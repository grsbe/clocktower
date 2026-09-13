import { randomUUID } from 'node:crypto';
import { LIMITS, PHASE } from '../../shared/events.js';

// Ambiguous letters (I, O) are left out so codes are easy to read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** @type {Map<string, object>} */
const rooms = new Map();

function randomCode() {
  let code = '';
  for (let i = 0; i < LIMITS.ROOM_CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeCode(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, LIMITS.ROOM_CODE_LENGTH);
}

export function createRoom() {
  let code = randomCode();
  while (rooms.has(code)) code = randomCode();

  const room = {
    code,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    phase: PHASE.LOBBY,
    // The game opens on night one and stays there through day one and dusk
    // one; nightfall is what starts the next cycle.
    dayNumber: 1,
    // True once day has broken and the cycle has not yet been closed by
    // nightfall, so stepping back from night to dusk and forward again is a
    // correction rather than another day.
    cycleOpen: false,
    storytellerId: null,
    players: [],
    notes: {},
    // Written by the storyteller, read by the whole table.
    publicNote: '',
    nomination: null,
    history: [],
    // Deaths, executions and revivals, in the order they happened.
    events: [],
    // Not serialised to clients: live socket bookkeeping and vote timers.
    sockets: new Map(),
    voteTimers: [],
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(normalizeCode(code)) ?? null;
}

export function deleteRoom(code) {
  const room = rooms.get(code);
  if (room) {
    clearVoteTimers(room);
    rooms.delete(code);
  }
}

export function touchRoom(room) {
  room.lastActivity = Date.now();
}

export function clearVoteTimers(room) {
  for (const t of room.voteTimers) clearTimeout(t);
  room.voteTimers = [];
}

export function newPlayer({ name, avatar }) {
  return {
    id: randomUUID(),
    name,
    avatar: avatar || null,
    connected: false,
    alive: true,
    causeOfDeath: null,
    usedGhostVote: false,
  };
}

/** Records something worth remembering against the day it happened on. */
export function logEvent(room, type, playerId) {
  room.events.push({
    id: randomUUID(),
    day: room.dayNumber ?? LIMITS.DAY_MIN,
    // Kept so the log can tell a quiet night death from one in broad daylight.
    phase: room.phase,
    type,
    playerId,
    at: Date.now(),
  });
}

export function findPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId) ?? null;
}

/**
 * The players actually sitting at the table. The storyteller keeps their entry
 * in `players` (name, avatar, identity for reconnect) but does not occupy a
 * seat in the circle and never votes.
 */
export function seatedPlayers(room) {
  return room.players.filter((p) => p.id !== room.storytellerId);
}

/** Drops rooms nobody has touched for a long time. */
export function startRoomSweeper(intervalMs = 10 * 60 * 1000) {
  const timer = setInterval(() => {
    const cutoff = Date.now() - LIMITS.ROOM_TTL_MS;
    for (const [code, room] of rooms) {
      const anyoneHere = room.players.some((p) => p.connected);
      if (!anyoneHere && room.lastActivity < cutoff) deleteRoom(code);
    }
  }, intervalMs);
  timer.unref?.();
  return timer;
}

export function roomCount() {
  return rooms.size;
}
