import { S2C } from '../../shared/events.js';

/**
 * Builds the view of a room for one specific viewer.
 *
 * Only the storyteller's private notes are withheld. Hands are visible to the
 * whole table the moment they go up, the way they would be in a room together;
 * what the clock hand does is not reveal a vote but freeze it, after which it
 * can no longer be changed.
 */
export function sanitizeRoom(room, viewerId) {
  const isStoryteller = viewerId != null && viewerId === room.storytellerId;

  return {
    code: room.code,
    phase: room.phase,
    dayNumber: room.dayNumber ?? 1,
    storytellerId: room.storytellerId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      connected: p.connected,
      alive: p.alive,
      causeOfDeath: p.causeOfDeath ?? null,
      usedGhostVote: p.usedGhostVote,
    })),
    notes: isStoryteller ? { ...room.notes } : null,
    publicNote: room.publicNote ?? '',
    nomination: sanitizeNomination(room.nomination),
    history: room.history.map(sanitizeHistoryEntry),
    events: (room.events ?? []).map((e) => ({ ...e })),
    serverTime: Date.now(),
  };
}

function sanitizeNomination(nomination) {
  if (!nomination) return null;
  return {
    nominatorId: nomination.nominatorId,
    nomineeId: nomination.nomineeId,
    state: nomination.state,
    msPerPlayer: nomination.msPerPlayer,
    startAt: nomination.startAt,
    order: nomination.order,
    locked: { ...nomination.locked },
    hands: { ...nomination.hands },
    result: nomination.result,
  };
}

function sanitizeHistoryEntry(entry) {
  return {
    id: entry.id,
    day: entry.day,
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
    dayNumber: room.dayNumber ?? 1,
    storytellerId: room.storytellerId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      connected: p.connected,
    })),
  };
}
