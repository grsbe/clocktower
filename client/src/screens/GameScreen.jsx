import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { C2S, LIMITS, NOMINATION_STATE, PHASE } from '@shared/events.js';
import { useRoom } from '../store.js';
import SeatCircle from '../components/SeatCircle.jsx';
import ClockHand from '../components/ClockHand.jsx';
import NominationBar from '../components/NominationBar.jsx';
import StorytellerPanel from '../components/StorytellerPanel.jsx';

const PHASE_LABEL = {
  [PHASE.NIGHT]: 'Night',
  [PHASE.DAY]: 'Day',
  [PHASE.DUSK]: 'Dusk',
};

export default function GameScreen() {
  const { state, me, isStoryteller, act, leaveRoom } = useRoom();
  const [pendingNominee, setPendingNominee] = useState(null);
  const [clock, setClock] = useState({ index: -1, secondsLeft: 0, leadIn: 0, done: false });
  const [panelOpen, setPanelOpen] = useState(false);

  const seated = useMemo(
    () => state.players.filter((p) => p.id !== state.storytellerId),
    [state.players, state.storytellerId],
  );
  const storyteller = state.players.find((p) => p.id === state.storytellerId) ?? null;
  const day = state.dayNumber ?? LIMITS.DAY_MIN;
  const nomination = state.nomination;
  const voting = nomination?.state === NOMINATION_STATE.VOTING;

  const nomineeSeatIndex = nomination
    ? seated.findIndex((p) => p.id === nomination.nomineeId)
    : -1;

  // Same rule the server applies when it writes the result: half the living
  // table, rounded up. Shown from the moment a nomination is on the floor so
  // the room can see what the vote has to clear.
  const threshold = Math.ceil(seated.filter((p) => p.alive).length / 2);

  // A player may nominate at dusk while the floor is free. The storyteller can
  // also raise one on someone's behalf.
  const canNominate =
    state.phase === PHASE.DUSK &&
    Boolean(me?.alive) &&
    (!nomination || nomination.state === NOMINATION_STATE.FINISHED);
  const selectableIds = canNominate ? seated.map((p) => p.id) : null;

  const onProgress = useCallback((next) => setClock(next), []);

  const confirmNomination = async () => {
    const target = pendingNominee;
    setPendingNominee(null);
    if (target) await act(C2S.NOMINATE, { nomineeId: target.id });
  };

  const centre = (() => {
    if (voting) {
      if (clock.leadIn > 0) {
        return (
          <>
            <span className="centre__big">{clock.leadIn}</span>
            <span className="centre__small">hands down…</span>
          </>
        );
      }
      return (
        <>
          <span className="centre__big">{countVotes(nomination)}</span>
          <span className="centre__small">of {threshold} needed</span>
          <span className="centre__small">
            {clock.secondsLeft > 0 ? `${clock.secondsLeft}s left` : 'counting…'}
          </span>
        </>
      );
    }
    if (nomination?.state === NOMINATION_STATE.OPEN) {
      return (
        <>
          <span className="centre__big">{countVotes(nomination)}</span>
          <span className="centre__small">of {threshold} needed</span>
          <span className="centre__small">hands up</span>
        </>
      );
    }
    if (nomination?.state === NOMINATION_STATE.FINISHED && nomination.result) {
      return (
        <>
          <span className="centre__big">{nomination.result.yes}</span>
          <span className="centre__small">
            votes · {nomination.result.threshold} needed
          </span>
        </>
      );
    }
    return (
      <>
        <span className="centre__phase">{PHASE_LABEL[state.phase] ?? state.phase}</span>
        <span className="centre__small">{seated.length} seated</span>
      </>
    );
  })();

  return (
    <div className={`screen screen--game phase-${state.phase}`}>
      <header className="game__header">
        <span className="game__code">{state.code}</span>
        <span className="game__st">
          {storyteller ? `ST: ${storyteller.name}` : 'no storyteller'}
        </span>
        <button type="button" className="link-button" onClick={leaveRoom}>
          Leave
        </button>
      </header>

      <div className="cycle">
        <h1 className="cycle__label">
          <span className="cycle__phase">{PHASE_LABEL[state.phase] ?? state.phase}</span>
          <span className="cycle__number">{day}</span>
        </h1>
        {isStoryteller && (
          <div className="cycle__nudge" role="group" aria-label="Correct the day number">
            <button
              type="button"
              onClick={() => act(C2S.DAY_SET, { day: day - 1 })}
              disabled={day <= LIMITS.DAY_MIN}
              aria-label="One day back"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => act(C2S.DAY_SET, { day: day + 1 })}
              disabled={day >= LIMITS.DAY_MAX}
              aria-label="One day on"
            >
              +
            </button>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <SeatCircle
          seated={seated}
          nomination={nomination}
          activeSeatIndex={voting ? clock.index : -1}
          meId={me?.id}
          selectableIds={selectableIds}
          onSeatClick={setPendingNominee}
          hand={
            voting && nomination.startAt != null && seated.length > 0 ? (
              <ClockHand
                startAt={nomination.startAt}
                msPerPlayer={nomination.msPerPlayer}
                seatCount={seated.length}
                nomineeIndex={nomineeSeatIndex < 0 ? 0 : nomineeSeatIndex}
                onProgress={onProgress}
              />
            ) : null
          }
        >
          {centre}
        </SeatCircle>
      </div>

      {pendingNominee && (
        <div className="confirm-bar">
          <span>Nominate {pendingNominee.name}?</span>
          <button type="button" className="primary-button" onClick={confirmNomination}>
            Nominate
          </button>
          <button type="button" className="ghost-button" onClick={() => setPendingNominee(null)}>
            Cancel
          </button>
        </div>
      )}

      <PublicNote
        text={state.publicNote ?? ''}
        editable={isStoryteller}
        onSave={(next) => act(C2S.PUBLIC_NOTE_SET, { text: next })}
      />

      <NominationBar seated={seated} />

      {isStoryteller && (
        <>
          <div className="phase-switch" role="group" aria-label="Phase">
            {[PHASE.NIGHT, PHASE.DAY, PHASE.DUSK].map((phase) => (
              <button
                key={phase}
                type="button"
                className={`phase-switch__btn${state.phase === phase ? ' phase-switch__btn--active' : ''}`}
                onClick={() => act(C2S.PHASE_SET, { phase })}
                disabled={voting}
              >
                {PHASE_LABEL[phase]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="panel-toggle"
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
          >
            {panelOpen ? 'Hide grimoire' : 'Grimoire & notes'}
          </button>
          {panelOpen && <StorytellerPanel seated={seated} />}
        </>
      )}
    </div>
  );
}

/**
 * The storyteller's public board: one shared line of text the whole table can
 * see, for the things that would otherwise be said twice — who died in the
 * night, which script is in play, whose turn it is to talk.
 */
function PublicNote({ text, editable = false, onSave }) {
  const [draft, setDraft] = useState(text);
  const pending = useRef(false);

  // Adopt what the server has unless we are mid-edit, so a second storyteller
  // tab (or a reconnect) does not fight the person typing.
  useEffect(() => {
    if (!pending.current) setDraft(text);
  }, [text]);

  useEffect(() => {
    if (draft === text) {
      pending.current = false;
      return undefined;
    }
    pending.current = true;
    const timer = setTimeout(async () => {
      await onSave(draft);
      pending.current = false;
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, text]);

  if (!editable) {
    if (!text.trim()) return null;
    return (
      <section className="public-note" aria-label="Note from the storyteller">
        <h2 className="public-note__label">From the storyteller</h2>
        <p className="public-note__text">{text}</p>
      </section>
    );
  }

  return (
    <section className="public-note public-note--edit">
      <h2 className="public-note__label">
        Public note
        <span className="public-note__count">
          {draft.length}/{LIMITS.PUBLIC_NOTE_MAX}
        </span>
      </h2>
      <textarea
        className="public-note__input"
        value={draft}
        maxLength={LIMITS.PUBLIC_NOTE_MAX}
        rows={2}
        placeholder="Everyone at the table sees this, as you type…"
        onChange={(e) => setDraft(e.target.value)}
      />
    </section>
  );
}

/**
 * What the table looks like right now: a locked seat counts as whatever was
 * frozen for it, everyone else as whatever their hand is doing this second.
 * Once every seat is locked this is simply the result.
 */
function countVotes(nomination) {
  if (!nomination) return 0;
  const { order = [], locked = {}, hands = {} } = nomination;
  return order.filter((id) => (id in locked ? locked[id] : hands[id] === true)).length;
}
