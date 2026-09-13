import { S2C } from '../../shared/events.js';

/**
 * Builds the view of a room for one specific viewer.
 *
 * Two things are deliberately withheld:
 *  - storyteller notes go only to the storyteller;
 *  - pending hands (raised before the clock hand arrives) are private to their
 *    owner, so nobody can copy a vote that has not been reached yet. Only
 *    locked votes, written as the hand passes, are public.
 */
export function sanitizeRoom(room, viewerId) {
  const isStoryteller = viewerId != null && viewerId === room.storytellerId;

  return {
    code: room.code,
    phase: room.phase,
    storytellerId: room.storytellerId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      connected: p.connected,
      alive: p.alive,
      usedGhostVote: p.usedGhostVote,
    })),
    notes: isStoryteller ? { ...room.notes } : null,
    publicNote: room.publicNote ?? '',
    nomination: sanitizeNomination(room.nomination, viewerId),
    history: room.history.map(sanitizeHistoryEntry),
    serverTime: Date.now(),
  };
}

function sanitizeNomination(nomination, viewerId) {
  if (!nomination) return null;
  return {
    nominatorId: nomination.nominatorId,
    nomineeId: nomination.nomineeId,
    state: nomination.state,
    msPerPlayer: nomination.msPerPlayer,
    startAt: nomination.startAt,
    order: nomination.order,
    locked: { ...nomination.locked },
    result: nomination.result,
    myHand: viewerId != null ? nomination.hands[viewerId] === true : false,
  };
}

function sanitizeHistoryEntry(entry) {
  return {
    id: entry.id,
    nominatorId: entry.nominatorId,
    nomineeId: entry.nomineeId,
    order: entry.order,
    locked: entry.locked,
    preRaised: entry.preRaised,
    result: entry.result,
    finishedAt: entry.finishedAt,
  };
}

/** Sends every connected socket in the room its own tailored copy of the state. */
export function broadcastRoom(io, room) {
  for (const [socketId, playerId] of room.sockets) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.emit(S2C.ROOM_STATE, sanitizeRoom(room, playerId));
  }
}

/** Minimal public information shown before joining: who is already seated. */
export function roomPreview(room) {
  return {
    code: room.code,
    phase: room.phase,
    storytellerId: room.storytellerId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      connected: p.connected,
    })),
  };
}
