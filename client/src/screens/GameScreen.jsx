import { useCallback, useMemo, useState } from 'react';
import { C2S, NOMINATION_STATE, PHASE } from '@shared/events.js';
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
  const nomination = state.nomination;
  const voting = nomination?.state === NOMINATION_STATE.VOTING;

  const nomineeSeatIndex = nomination
    ? seated.findIndex((p) => p.id === nomination.nomineeId)
    : -1;

  // A player may nominate at dusk while the floor is free. The storyteller can
  // also raise one on someone's behalf.
  const canNominate =
    state.phase === PHASE.DUSK &&
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
          <span className="centre__big">{countYes(nomination)}</span>
          <span className="centre__small">
            {clock.secondsLeft > 0 ? `${clock.secondsLeft}s left` : 'counting…'}
          </span>
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
        <span className="game__phase">{PHASE_LABEL[state.phase] ?? state.phase}</span>
        <span className="game__st">
          {storyteller ? `ST: ${storyteller.name}` : 'no storyteller'}
        </span>
        <button type="button" className="link-button" onClick={leaveRoom}>
          Leave
        </button>
      </header>

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

      <NominationBar seated={seated} clock={clock} />

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

function countYes(nomination) {
  return Object.values(nomination?.locked ?? {}).filter(Boolean).length;
}
