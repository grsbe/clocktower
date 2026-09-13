// Shared between server and client. Plain ESM, no dependencies.

export const PHASE = {
  LOBBY: 'lobby',
  NIGHT: 'night',
  DAY: 'day',
  DUSK: 'dusk',
};

// How a player left the game. A quiet death in the night reads differently at
// the table from an execution the town voted for, so they are tracked apart.
export const DEATH = {
  KILLED: 'killed',
  EXECUTED: 'executed',
};

export const EVENT = {
  DEATH: 'death',
  EXECUTION: 'execution',
  REVIVAL: 'revival',
};

export const NOMINATION_STATE = {
  OPEN: 'open',
  VOTING: 'voting',
  FINISHED: 'finished',
};

// Client -> server
export const C2S = {
  TIME_SYNC: 'time:sync',
  ROOM_PEEK: 'room:peek',
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  SEATING_SET: 'seating:set',
  STORYTELLER_SET: 'storyteller:set',
  GAME_START: 'game:start',
  PHASE_SET: 'phase:set',
  DAY_SET: 'day:set',
  PLAYER_ALIVE_SET: 'player:aliveSet',
  PLAYER_EXECUTE: 'player:execute',
  PLAYER_GHOSTVOTE_SET: 'player:ghostVoteSet',
  PLAYER_PROFILE_SET: 'player:profileSet',
  PLAYER_REMOVE: 'player:remove',
  NOTE_SET: 'note:set',
  PUBLIC_NOTE_SET: 'note:publicSet',
  NOMINATE: 'nomination:create',
  NOMINATION_CANCEL: 'nomination:cancel',
  VOTE_START: 'vote:start',
  VOTE_HAND: 'vote:hand',
};

// Server -> client
export const S2C = {
  ROOM_STATE: 'room:state',
  ROOM_CLOSED: 'room:closed',
  VOTE_STARTED: 'vote:started',
  HAND_CHANGED: 'vote:handChanged',
  VOTE_LOCKED: 'vote:locked',
  VOTE_FINISHED: 'vote:finished',
  ERROR: 'app:error',
};

export const LIMITS = {
  ROOM_CODE_LENGTH: 4,
  NAME_MAX: 20,
  AVATAR_MAX_BYTES: 64 * 1024,
  NOTE_MAX: 2000,
  PUBLIC_NOTE_MAX: 500,
  MAX_PLAYERS: 20,
  DAY_MIN: 1,
  DAY_MAX: 99,
  MIN_PLAYERS_TO_START: 3,
  // Grace period for a hand toggle that was sent just before the clock hand
  // arrived but reached the server just after it.
  VOTE_GRACE_MS: 300,
  VOTE_LEAD_IN_MS: 3000,
  // Where the hand rests before it starts moving, measured in seats from the
  // nominee. Half a seat puts it in the gap between the nominee and the first
  // voter, so it is visibly "about to reach" the first voter rather than
  // sitting on the nominee.
  HAND_START_OFFSET: 0.5,
  ROOM_TTL_MS: 12 * 60 * 60 * 1000,
};

export const VOTE_SPEEDS = [
  // 15s a seat is the "super slow" setting: enough time for a table that is
  // talking over the vote, and comfortable to reach on a phone that has just
  // woken up.
  { label: 'Glacial', msPerPlayer: 15000 },
  { label: 'Slow', msPerPlayer: 3000 },
  { label: 'Normal', msPerPlayer: 2000 },
  { label: 'Brisk', msPerPlayer: 1500 },
  { label: 'Fast', msPerPlayer: 1000 },
];

/** Pre-selected in the speed picker. */
export const DEFAULT_VOTE_SPEED = 2000;
