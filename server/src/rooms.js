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
    storytellerId: null,
    players: [],
    notes: {},
    nomination: null,
    history: [],
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
    usedGhostVote: false,
  };
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
