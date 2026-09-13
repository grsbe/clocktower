import { randomUUID } from 'node:crypto';
import { LIMITS, NOMINATION_STATE, S2C } from '../../shared/events.js';
import { clearVoteTimers, findPlayer, seatedPlayers, touchRoom } from './rooms.js';
import { broadcastRoom } from './room-state.js';

/**
 * Voting order: the clock hand starts in the gap between the nominee and the
 * seat after them, then sweeps clockwise through the seating order, so the
 * first voter is the seat after the nominee and the nominee themselves votes
 * last, one circle later.
 */
export function buildVoteOrder(room, nomineeId) {
  const seated = seatedPlayers(room);
  const seat = seated.findIndex((p) => p.id === nomineeId);
  if (seat < 0) return [];
  const n = seated.length;
  const order = [];
  for (let i = 1; i <= n; i += 1) order.push(seated[(seat + i) % n].id);
  return order;
}

/** Moment the hand reaches the voter at index i (server epoch ms). */
export function handArrivalAt(nomination, index) {
  return (
    nomination.startAt +
    (index + LIMITS.HAND_START_OFFSET) * nomination.msPerPlayer
  );
}

/** How long a full sweep takes, from the starting gap round to the nominee. */
export function voteDurationMs(voterCount, msPerPlayer) {
  return (voterCount - 1 + LIMITS.HAND_START_OFFSET) * msPerPlayer;
}

/** Latest moment a hand toggle from this voter is still honoured. */
export function toggleDeadline(nomination, index) {
  return handArrivalAt(nomination, index) + LIMITS.VOTE_GRACE_MS;
}

export function startVote(io, room, msPerPlayer) {
  const nomination = room.nomination;
  nomination.state = NOMINATION_STATE.VOTING;
  nomination.msPerPlayer = msPerPlayer;
  nomination.startAt = Date.now() + LIMITS.VOTE_LEAD_IN_MS;
  // `hands` is deliberately kept: anyone who raised their hand while the
  // nomination was still on the floor stays raised, and their vote is locked in
  // as the clock hand passes them just like a hand raised during the sweep.
  nomination.locked = {};
  nomination.result = null;
  // Frozen for the storyteller's log: who had already committed before the
  // clock started turning.
  nomination.preRaised = nomination.order.filter((id) => nomination.hands[id] === true);

  clearVoteTimers(room);

  nomination.order.forEach((playerId, index) => {
    // The lock is applied one grace period after the hand visually arrives, so
    // a toggle sent just in time but delivered just late is still counted and
    // never needs to be retracted afterwards.
    const timer = setTimeout(() => {
      lockVoter(io, room, nomination, playerId);
      if (index === nomination.order.length - 1) finishVote(io, room, nomination);
    }, Math.max(0, toggleDeadline(nomination, index) - Date.now()));
    room.voteTimers.push(timer);
  });

  io.to(room.code).emit(S2C.VOTE_STARTED, {
    nomineeId: nomination.nomineeId,
    nominatorId: nomination.nominatorId,
    startAt: nomination.startAt,
    msPerPlayer: nomination.msPerPlayer,
    order: nomination.order,
    serverTime: Date.now(),
  });
  broadcastRoom(io, room);
}

function lockVoter(io, room, nomination, playerId) {
  if (room.nomination !== nomination) return;
  const player = findPlayer(room, playerId);
  // The last word on whether this counts. The same rule is checked when the
  // hand goes up, but the storyteller may have killed this player, or marked
  // their vote spent, in the seconds since.
  const allowed = !player || player.alive || !player.usedGhostVote;
  const raised = allowed && nomination.hands[playerId] === true;
  nomination.locked[playerId] = raised;

  // A dead player who actually votes has now spent their one vote, and the
  // check above will refuse them from here on.
  let ghostVoteSpent = false;
  if (raised && player && !player.alive) {
    player.usedGhostVote = true;
    ghostVoteSpent = true;
  }

  io.to(room.code).emit(S2C.VOTE_LOCKED, {
    playerId,
    hand: raised,
    yes: countYes(nomination),
  });
  if (ghostVoteSpent) broadcastRoom(io, room);
}

function finishVote(io, room, nomination) {
  if (room.nomination !== nomination) return;
  nomination.state = NOMINATION_STATE.FINISHED;

  const aliveCount = seatedPlayers(room).filter((p) => p.alive).length;
  const yes = countYes(nomination);
  nomination.result = {
    yes,
    no: nomination.order.length - yes,
    aliveCount,
    threshold: Math.ceil(aliveCount / 2),
  };

  room.history.push({
    id: randomUUID(),
    day: room.dayNumber ?? 1,
    nominatorId: nomination.nominatorId,
    nomineeId: nomination.nomineeId,
    order: [...nomination.order],
    locked: { ...nomination.locked },
    preRaised: [...(nomination.preRaised ?? [])],
    result: nomination.result,
    finishedAt: Date.now(),
  });

  clearVoteTimers(room);
  touchRoom(room);
  io.to(room.code).emit(S2C.VOTE_FINISHED, { result: nomination.result });
  broadcastRoom(io, room);
}

function countYes(nomination) {
  return Object.values(nomination.locked).filter(Boolean).length;
}

/**
 * True if this voter may still put their hand up or take it down.
 *
 * While the nomination is merely on the floor every voter may do so, so people
 * who know their mind (or who are about to lose their phone) can commit early.
 * Once the vote is running the window closes seat by seat as the hand passes.
 */
export function canToggleHand(nomination, playerId) {
  if (!nomination) return false;
  const index = nomination.order.indexOf(playerId);
  if (index < 0) return false;
  if (nomination.state === NOMINATION_STATE.OPEN) return true;
  if (nomination.state !== NOMINATION_STATE.VOTING) return false;
  if (playerId in nomination.locked) return false;
  return Date.now() <= toggleDeadline(nomination, index);
}
