import {
  C2S,
  LIMITS,
  NOMINATION_STATE,
  PHASE,
  S2C,
  VOTE_SPEEDS,
} from '../../shared/events.js';
import {
  clearVoteTimers,
  createRoom,
  findPlayer,
  getRoom,
  newPlayer,
  normalizeCode,
  seatedPlayers,
  touchRoom,
} from './rooms.js';
import { broadcastRoom, roomPreview, sanitizeRoom } from './room-state.js';
import { buildVoteOrder, canToggleHand, startVote } from './voting.js';

const ok = (data = {}) => ({ ok: true, ...data });
const fail = (error) => ({ ok: false, error });

function cleanName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  return name.slice(0, LIMITS.NAME_MAX);
}

function cleanAvatar(raw) {
  if (raw == null || raw === '') return null;
  const value = String(raw);
  if (!value.startsWith('data:image/')) return null;
  if (value.length > LIMITS.AVATAR_MAX_BYTES) return null;
  return value;
}

export function registerHandlers(io, socket) {
  const context = () => {
    const room = socket.data.roomCode ? getRoom(socket.data.roomCode) : null;
    const player = room ? findPlayer(room, socket.data.playerId) : null;
    return { room, player };
  };

  const requireStoryteller = () => {
    const { room, player } = context();
    if (!room || !player) return { error: 'not-in-a-room' };
    if (room.storytellerId !== player.id) return { error: 'storyteller-only' };
    return { room, player };
  };

  const attach = (room, player) => {
    // One browser tab per player: drop any older socket holding this seat.
    for (const [socketId, playerId] of room.sockets) {
      if (playerId === player.id && socketId !== socket.id) {
        room.sockets.delete(socketId);
        io.sockets.sockets.get(socketId)?.disconnect(true);
      }
    }
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    room.sockets.set(socket.id, player.id);
    player.connected = true;
    touchRoom(room);
  };

  socket.on(C2S.TIME_SYNC, (_payload, ack) => {
    if (typeof ack === 'function') ack({ serverTime: Date.now() });
  });

  socket.on(C2S.ROOM_PEEK, ({ code } = {}, ack) => {
    const room = getRoom(code);
    if (typeof ack !== 'function') return;
    if (!room) return ack(fail('no-such-room'));
    ack(ok({ preview: roomPreview(room) }));
  });

  socket.on(C2S.ROOM_CREATE, ({ name, avatar } = {}, ack) => {
    const cleanedName = cleanName(name);
    if (!cleanedName) return ack?.(fail('name-required'));

    const room = createRoom();
    const player = newPlayer({ name: cleanedName, avatar: cleanAvatar(avatar) });
    room.players.push(player);
    room.storytellerId = player.id; // whoever opens the room starts as storyteller
    attach(room, player);

    ack?.(ok({ code: room.code, playerId: player.id, state: sanitizeRoom(room, player.id) }));
    broadcastRoom(io, room);
  });

  socket.on(C2S.ROOM_JOIN, ({ code, playerId, name, avatar } = {}, ack) => {
    const room = getRoom(code);
    if (!room) return ack?.(fail('no-such-room'));

    let player = playerId ? findPlayer(room, playerId) : null;

    if (!player) {
      if (playerId) return ack?.(fail('seat-gone'));
      const cleanedName = cleanName(name);
      if (!cleanedName) return ack?.(fail('name-required'));
      if (room.players.length >= LIMITS.MAX_PLAYERS) return ack?.(fail('room-full'));
      if (room.phase !== PHASE.LOBBY) return ack?.(fail('game-already-started'));
      player = newPlayer({ name: cleanedName, avatar: cleanAvatar(avatar) });
      room.players.push(player);
    } else if (name) {
      // Reclaiming a seat may also refresh the profile.
      const cleanedName = cleanName(name);
      if (cleanedName) player.name = cleanedName;
      const cleanedAvatar = cleanAvatar(avatar);
      if (cleanedAvatar) player.avatar = cleanedAvatar;
    }

    attach(room, player);
    ack?.(ok({ code: room.code, playerId: player.id, state: sanitizeRoom(room, player.id) }));
    broadcastRoom(io, room);
  });

  socket.on(C2S.PLAYER_PROFILE_SET, ({ name, avatar } = {}, ack) => {
    const { room, player } = context();
    if (!room || !player) return ack?.(fail('not-in-a-room'));
    const cleanedName = cleanName(name);
    if (cleanedName) player.name = cleanedName;
    if (avatar !== undefined) player.avatar = cleanAvatar(avatar);
    touchRoom(room);
    broadcastRoom(io, room);
    ack?.(ok());
  });

  socket.on(C2S.SEATING_SET, ({ order } = {}, ack) => {
    const { room, player } = context();
    if (!room || !player) return ack?.(fail('not-in-a-room'));
    // Before a storyteller exists anyone may arrange the table; afterwards it
    // is the storyteller's job.
    if (room.storytellerId && room.storytellerId !== player.id) {
      return ack?.(fail('storyteller-only'));
    }
    if (!Array.isArray(order)) return ack?.(fail('bad-order'));

    const byId = new Map(room.players.map((p) => [p.id, p]));
    const reordered = [];
    for (const id of order) {
      const found = byId.get(id);
      if (found && !reordered.includes(found)) reordered.push(found);
    }
    // Anyone the client did not mention keeps their relative place at the end.
    for (const p of room.players) if (!reordered.includes(p)) reordered.push(p);

    room.players = reordered;
    touchRoom(room);
    broadcastRoom(io, room);
    ack?.(ok());
  });

  socket.on(C2S.STORYTELLER_SET, ({ playerId } = {}, ack) => {
    const { room, player } = context();
    if (!room || !player) return ack?.(fail('not-in-a-room'));
    if (room.storytellerId && room.storytellerId !== player.id) {
      return ack?.(fail('storyteller-only'));
    }
    if (room.phase !== PHASE.LOBBY) return ack?.(fail('lobby-only'));
    if (playerId != null && !findPlayer(room, playerId)) return ack?.(fail('no-such-player'));

    room.storytellerId = playerId ?? null;
    touchRoom(room);
    broadcastRoom(io, room);
    ack?.(ok());
  });

  socket.on(C2S.GAME_START, (_payload, ack) => {
    const { room, error } = requireStoryteller();
    if (error) return ack?.(fail(error));
    if (room.phase !== PHASE.LOBBY) return ack?.(fail('already-started'));
    if (seatedPlayers(room).length < LIMITS.MIN_PLAYERS_TO_START) {
      return ack?.(fail('not-enough-players'));
    }
    room.phase = PHASE.NIGHT;
    touchRoom(room);
    broadcastRoom(io, room);
    ack?.(ok());
  });

  socket.on(C2S.PHASE_SET, ({ phase } = {}, ack) => {
    const { room, error } = requireStoryteller();
    if (error) return ack?.(fail(error));
    if (![PHASE.LOBBY, PHASE.NIGHT, PHASE.DAY, PHASE.DUSK].includes(phase)) {
      return ack?.(fail('bad-phase'));
    }
    if (room.nomination?.state === NOMINATION_STATE.VOTING) {
      return ack?.(fail('vote-in-progress'));
    }
    room.phase = phase;
    room.nomination = null;
    clearVoteTimers(room);
    touchRoom(room);
    broadcastRoom(io, room);
    ack?.(ok());
  });

  socket.on(C2S.PLAYER_ALIVE_SET, ({ playerId, alive } = {}, ack) => {
    const { room, error } = requireStoryteller();
    if (error) return ack?.(fail(error));
    const target = findPlayer(room, playerId);
    if (!target) return ack?.(fail('no-such-player'));
    target.alive = Boolean(alive);
    touchRoom(room);
    broadcastRoom(io, room);
    ack?.(ok());
  });

  socket.on(C2S.PLAYER_GHOSTVOTE_SET, ({ playerId, used } = {}, ack) => {
    const { room, error } = requireStoryteller();
    if (error) return ack?.(fail(error));
    const target = findPlayer(room, playerId);
    if (!target) return ack?.(fail('no-such-player'));
    target.usedGhostVote = Boolean(used);
    touchRoom(room);
    broadcastRoom(io, room);
    ack?.(ok());
  });

  socket.on(C2S.PLAYER_REMOVE, ({ playerId } = {}, ack) => {
    const { room, error } = requireStoryteller();
    if (error) return ack?.(fail(error));
    if (playerId === room.storytellerId) return ack?.(fail('cannot-remove-storyteller'));
    const target = findPlayer(room, playerId);
    if (!target) return ack?.(fail('no-such-player'));
    if (room.nomination?.state === NOMINATION_STATE.VOTING) {
      return ack?.(fail('vote-in-progress'));
    }

    room.players = room.players.filter((p) => p.id !== playerId);
    delete room.notes[playerId];
    if (room.nomination &&
        (room.nomination.nomineeId === playerId || room.nomination.nominatorId === playerId)) {
      room.nomination = null;
    }
    for (const [socketId, id] of room.sockets) {
      if (id === playerId) {
        room.sockets.delete(socketId);
        io.sockets.sockets.get(socketId)?.emit(S2C.ROOM_CLOSED, { reason: 'removed' });
        io.sockets.sockets.get(socketId)?.disconnect(true);
      }
    }
    touchRoom(room);
    broadcastRoom(io, room);
    ack?.(ok());
  });

  socket.on(C2S.NOTE_SET, ({ playerId, text } = {}, ack) => {
    const { room, error } = requireStoryteller();
    if (error) return ack?.(fail(error));
    if (!findPlayer(room, playerId)) return ack?.(fail('no-such-player'));
    room.notes[playerId] = String(text ?? '').slice(0, LIMITS.NOTE_MAX);
    touchRoom(room);
    broadcastRoom(io, room);
    ack?.(ok());
  });

  socket.on(C2S.NOMINATE, ({ nomineeId } = {}, ack) => {
    const { room, player } = context();
    if (!room || !player) return ack?.(fail('not-in-a-room'));
    if (room.phase !== PHASE.DUSK) return ack?.(fail('nominations-closed'));
    if (room.nomination && room.nomination.state !== NOMINATION_STATE.FINISHED) {
      return ack?.(fail('nomination-in-progress'));
    }
    const nominee = findPlayer(room, nomineeId);
    if (!nominee) return ack?.(fail('no-such-player'));
    if (nomineeId === room.storytellerId) return ack?.(fail('cannot-nominate-storyteller'));

    // The storyteller may raise a nomination on someone's behalf; otherwise a
    // player nominates as themselves.
    const nominatorId = player.id === room.storytellerId ? null : player.id;

    room.nomination = {
      nominatorId,
      nomineeId,
      state: NOMINATION_STATE.OPEN,
      msPerPlayer: null,
      startAt: null,
      order: buildVoteOrder(room, nomineeId),
      hands: {},
      locked: {},
      result: null,
    };
    clearVoteTimers(room);
    touchRoom(room);
    broadcastRoom(io, room);
    ack?.(ok());
  });

  socket.on(C2S.NOMINATION_CANCEL, (_payload, ack) => {
    const { room, error } = requireStoryteller();
    if (error) return ack?.(fail(error));
    room.nomination = null;
    clearVoteTimers(room);
    touchRoom(room);
    broadcastRoom(io, room);
    ack?.(ok());
  });

  socket.on(C2S.VOTE_START, ({ msPerPlayer } = {}, ack) => {
    const { room, error } = requireStoryteller();
    if (error) return ack?.(fail(error));
    if (!room.nomination || room.nomination.state !== NOMINATION_STATE.OPEN) {
      return ack?.(fail('no-open-nomination'));
    }
    const allowed = VOTE_SPEEDS.some((s) => s.msPerPlayer === msPerPlayer);
    if (!allowed) return ack?.(fail('bad-speed'));

    // Seating may have changed since the nomination was raised.
    room.nomination.order = buildVoteOrder(room, room.nomination.nomineeId);
    if (room.nomination.order.length === 0) return ack?.(fail('no-such-player'));

    startVote(io, room, msPerPlayer);
    touchRoom(room);
    ack?.(ok());
  });

  socket.on(C2S.VOTE_HAND, ({ value } = {}, ack) => {
    const { room, player } = context();
    if (!room || !player) return ack?.(fail('not-in-a-room'));
    if (!canToggleHand(room.nomination, player.id)) return ack?.(fail('too-late'));
    room.nomination.hands[player.id] = Boolean(value);
    // Only this player learns their own pending hand; nobody else sees it until
    // the clock hand reaches them.
    socket.emit(S2C.ROOM_STATE, sanitizeRoom(room, player.id));
    ack?.(ok({ value: Boolean(value) }));
  });

  socket.on(C2S.ROOM_LEAVE, (_payload, ack) => {
    const { room, player } = context();
    if (room && player) {
      room.sockets.delete(socket.id);
      player.connected = false;
      socket.leave(room.code);
      broadcastRoom(io, room);
    }
    socket.data.roomCode = null;
    socket.data.playerId = null;
    ack?.(ok());
  });

  socket.on('disconnect', () => {
    const { room, player } = context();
    if (!room) return;
    if (room.sockets.get(socket.id) !== undefined) room.sockets.delete(socket.id);
    // Only mark them gone if no other socket still holds the seat.
    const stillHere = [...room.sockets.values()].includes(player?.id);
    if (player && !stillHere) player.connected = false;
    broadcastRoom(io, room);
  });
}

export { normalizeCode };
