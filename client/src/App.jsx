import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { C2S, PHASE, S2C } from '@shared/events.js';
import { emitAck, socket, syncClock } from './socket.js';
import {
  RoomContext,
  clearIdentity,
  errorText,
  loadIdentity,
  saveIdentity,
} from './store.js';
import JoinScreen from './screens/JoinScreen.jsx';
import LobbyScreen from './screens/LobbyScreen.jsx';
import GameScreen from './screens/GameScreen.jsx';
import Toast from './components/Toast.jsx';

// Opening the app with ?new starts as a stranger instead of resuming the seat
// this browser last held — handy for sitting several test players at one table.
function initialIdentity() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('new')) {
    clearIdentity();
    window.history.replaceState(null, '', window.location.pathname);
    return null;
  }
  return loadIdentity();
}

export default function App() {
  const [state, setState] = useState(null);
  const [identity, setIdentity] = useState(initialIdentity);
  const [connected, setConnected] = useState(socket.connected);
  const [booting, setBooting] = useState(true);
  const [toast, setToast] = useState(null);
  const identityRef = useRef(identity);
  identityRef.current = identity;

  const notify = useCallback((message) => {
    setToast({ message, at: Date.now() });
  }, []);

  const forget = useCallback(() => {
    clearIdentity();
    setIdentity(null);
    setState(null);
  }, []);

  // Rejoin silently on every (re)connect, so a dropped connection or a page
  // reload puts the player straight back in their seat.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setConnected(true);
      await syncClock();
      const stored = identityRef.current;
      if (!stored) {
        if (!cancelled) setBooting(false);
        return;
      }
      const res = await emitAck(C2S.ROOM_JOIN, {
        code: stored.code,
        playerId: stored.playerId,
      });
      if (cancelled) return;
      if (res.ok) {
        setState(res.state);
      } else {
        clearIdentity();
        setIdentity(null);
        setState(null);
        if (res.error !== 'timeout') notify(errorText(res.error));
      }
      setBooting(false);
    }

    const onDisconnect = () => setConnected(false);
    const onRoomState = (next) => setState(next);
    const onRoomClosed = ({ reason }) => {
      forget();
      notify(reason === 'removed' ? 'The storyteller removed you from the game.' : 'The room closed.');
    };
    const onVoteStarted = (payload) => {
      setState((prev) =>
        prev?.nomination
          ? {
              ...prev,
              nomination: {
                ...prev.nomination,
                state: 'voting',
                startAt: payload.startAt,
                msPerPlayer: payload.msPerPlayer,
                order: payload.order,
                locked: {},
                result: null,
              },
            }
          : prev,
      );
    };
    const onVoteLocked = ({ playerId, hand }) => {
      setState((prev) =>
        prev?.nomination
          ? {
              ...prev,
              nomination: {
                ...prev.nomination,
                locked: { ...prev.nomination.locked, [playerId]: hand },
              },
            }
          : prev,
      );
    };
    const onVoteFinished = ({ result }) => {
      setState((prev) =>
        prev?.nomination
          ? { ...prev, nomination: { ...prev.nomination, state: 'finished', result } }
          : prev,
      );
    };

    socket.on('connect', bootstrap);
    socket.on('disconnect', onDisconnect);
    socket.on(S2C.ROOM_STATE, onRoomState);
    socket.on(S2C.ROOM_CLOSED, onRoomClosed);
    socket.on(S2C.VOTE_STARTED, onVoteStarted);
    socket.on(S2C.VOTE_LOCKED, onVoteLocked);
    socket.on(S2C.VOTE_FINISHED, onVoteFinished);
    if (socket.connected) bootstrap();

    return () => {
      cancelled = true;
      socket.off('connect', bootstrap);
      socket.off('disconnect', onDisconnect);
      socket.off(S2C.ROOM_STATE, onRoomState);
      socket.off(S2C.ROOM_CLOSED, onRoomClosed);
      socket.off(S2C.VOTE_STARTED, onVoteStarted);
      socket.off(S2C.VOTE_LOCKED, onVoteLocked);
      socket.off(S2C.VOTE_FINISHED, onVoteFinished);
    };
  }, [forget, notify]);

  const enterRoom = useCallback((res) => {
    const next = { code: res.code, playerId: res.playerId };
    saveIdentity(next);
    setIdentity(next);
    setState(res.state);
  }, []);

  const leaveRoom = useCallback(async () => {
    await emitAck(C2S.ROOM_LEAVE, null);
    forget();
  }, [forget]);

  const act = useCallback(
    async (event, payload) => {
      const res = await emitAck(event, payload);
      if (!res.ok) notify(errorText(res.error));
      return res;
    },
    [notify],
  );

  const me = useMemo(
    () => state?.players.find((p) => p.id === identity?.playerId) ?? null,
    [state, identity],
  );

  const context = useMemo(
    () => ({
      state,
      me,
      identity,
      connected,
      isStoryteller: Boolean(me && state && state.storytellerId === me.id),
      act,
      notify,
      enterRoom,
      leaveRoom,
    }),
    [state, me, identity, connected, act, notify, enterRoom, leaveRoom],
  );

  let screen;
  if (booting && !state) {
    screen = <div className="boot">Lighting the candles…</div>;
  } else if (!state) {
    screen = <JoinScreen />;
  } else if (state.phase === PHASE.LOBBY) {
    screen = <LobbyScreen />;
  } else {
    screen = <GameScreen />;
  }

  return (
    <RoomContext.Provider value={context}>
      {!connected && <div className="connection-banner">Reconnecting…</div>}
      {screen}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </RoomContext.Provider>
  );
}
