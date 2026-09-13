import { useState } from 'react';
import { C2S, LIMITS } from '@shared/events.js';
import { emitAck } from '../socket.js';
import { errorText, useRoom } from '../store.js';
import AvatarDraw from '../components/AvatarDraw.jsx';
import Avatar from '../components/Avatar.jsx';

export default function JoinScreen() {
  const { enterRoom, notify } = useRoom();
  const [step, setStep] = useState('landing'); // landing | roster | profile
  const [mode, setMode] = useState('join'); // join | create
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [claimId, setClaimId] = useState(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [busy, setBusy] = useState(false);

  const lookUpRoom = async (event) => {
    event.preventDefault();
    if (code.length !== LIMITS.ROOM_CODE_LENGTH) return;
    setBusy(true);
    const res = await emitAck(C2S.ROOM_PEEK, { code });
    setBusy(false);
    if (!res.ok) return notify(errorText(res.error));
    setPreview(res.preview);
    setMode('join');
    setStep(res.preview.players.length ? 'roster' : 'profile');
  };

  const startCreate = () => {
    setMode('create');
    setPreview(null);
    setClaimId(null);
    setStep('profile');
  };

  const reclaimSeat = async (player) => {
    setBusy(true);
    const res = await emitAck(C2S.ROOM_JOIN, { code: preview.code, playerId: player.id });
    setBusy(false);
    if (!res.ok) return notify(errorText(res.error));
    enterRoom(res);
  };

  const submitProfile = async (event) => {
    event.preventDefault();
    if (!name.trim()) return notify('Please enter a name.');
    setBusy(true);
    const res =
      mode === 'create'
        ? await emitAck(C2S.ROOM_CREATE, { name, avatar })
        : await emitAck(C2S.ROOM_JOIN, {
            code: preview.code,
            playerId: claimId ?? undefined,
            name,
            avatar,
          });
    setBusy(false);
    if (!res.ok) return notify(errorText(res.error));
    enterRoom(res);
  };

  return (
    <div className="screen screen--join">
      <header className="brand">
        <h1>Clocktower</h1>
        <p>Gather the town.</p>
      </header>

      {step === 'landing' && (
        <div className="panel">
          <form onSubmit={lookUpRoom} className="stack">
            <label className="field">
              <span>Room code</span>
              <input
                className="code-input"
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z]/g, '')
                      .slice(0, LIMITS.ROOM_CODE_LENGTH),
                  )
                }
                placeholder="ABCD"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                aria-label="Room code"
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={busy || code.length !== LIMITS.ROOM_CODE_LENGTH}
            >
              Join room
            </button>
          </form>
          <div className="divider"><span>or</span></div>
          <button type="button" className="ghost-button ghost-button--wide" onClick={startCreate}>
            Create a new room
          </button>
        </div>
      )}

      {step === 'roster' && preview && (
        <div className="panel">
          <h2 className="panel__title">Room {preview.code}</h2>
          <p className="panel__hint">
            Rejoining after losing connection? Pick your name to take your seat back.
          </p>
          <ul className="roster">
            {preview.players.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  className="roster__entry"
                  disabled={busy}
                  onClick={() => reclaimSeat(player)}
                >
                  <Avatar player={player} size={40} />
                  <span className="roster__name">{player.name}</span>
                  <span className={`dot${player.connected ? ' dot--on' : ''}`} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setClaimId(null);
              setStep('profile');
            }}
          >
            I'm new here
          </button>
          <button type="button" className="link-button" onClick={() => setStep('landing')}>
            Back
          </button>
        </div>
      )}

      {step === 'profile' && (
        <div className="panel">
          <h2 className="panel__title">
            {mode === 'create' ? 'Open a new room' : `Join room ${preview?.code ?? ''}`}
          </h2>
          <form onSubmit={submitProfile} className="stack">
            <label className="field">
              <span>Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, LIMITS.NAME_MAX))}
                placeholder="Name"
                autoComplete="off"
                maxLength={LIMITS.NAME_MAX}
              />
            </label>
            <AvatarDraw onChange={setAvatar} />
            <button type="submit" className="primary-button" disabled={busy || !name.trim()}>
              {mode === 'create' ? 'Create room' : 'Take a seat'}
            </button>
          </form>
          <button
            type="button"
            className="link-button"
            onClick={() => setStep(mode === 'create' ? 'landing' : 'roster')}
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
