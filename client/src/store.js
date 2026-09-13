import { createContext, useContext } from 'react';

const STORAGE_KEY = 'botct.identity';

/**
 * Who this browser is. Kept in both storages on purpose:
 *
 *  - sessionStorage is per tab and is read first, so several tabs on one
 *    machine can sit at the same table as different players (which is how you
 *    test the app locally, and how a shared tablet could work);
 *  - localStorage is the durable copy, so closing and reopening the browser on
 *    a phone still drops the player back into their seat.
 *
 * If both are gone the player picks their name from the roster instead.
 */
function read(store) {
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.code && parsed?.playerId) return parsed;
  } catch {
    /* private mode or cleared storage: fall back to the name-reclaim flow */
  }
  return null;
}

export function loadIdentity() {
  return read(sessionStorage) ?? read(localStorage);
}

export function saveIdentity(identity) {
  const value = JSON.stringify(identity);
  for (const store of [sessionStorage, localStorage]) {
    try {
      store.setItem(STORAGE_KEY, value);
    } catch {
      /* nothing we can do; reconnect will use the name-reclaim flow */
    }
  }
}

export function clearIdentity() {
  for (const store of [sessionStorage, localStorage]) {
    try {
      store.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const RoomContext = createContext(null);

export function useRoom() {
  const value = useContext(RoomContext);
  if (!value) throw new Error('useRoom must be used inside RoomContext');
  return value;
}

export const ERROR_TEXT = {
  'no-such-room': 'No room with that code.',
  'seat-gone': 'That seat no longer exists.',
  'name-required': 'Please enter a name.',
  'room-full': 'That room is full.',
  'game-already-started': 'That game has already started.',
  'storyteller-only': 'Only the storyteller can do that.',
  'not-enough-players': 'You need at least three seated players.',
  'nominations-closed': 'Nominations are only open at dusk.',
  'nomination-in-progress': 'There is already a nomination on the floor.',
  'cannot-nominate-storyteller': 'The storyteller cannot be nominated.',
  'cannot-remove-storyteller': 'Hand over the storyteller role first.',
  'vote-in-progress': 'Wait for the vote to finish.',
  'no-open-nomination': 'Nothing has been nominated yet.',
  'too-late': 'The clock hand has already passed you.',
  'lobby-only': 'That can only be changed before the game starts.',
  timeout: 'The server did not answer. Check your connection.',
};

export function errorText(code) {
  return ERROR_TEXT[code] ?? 'Something went wrong.';
}
