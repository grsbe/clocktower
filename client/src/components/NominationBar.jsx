import { useEffect, useState } from 'react';
import { C2S, LIMITS, NOMINATION_STATE, PHASE, VOTE_SPEEDS } from '@shared/events.js';
import { serverNow } from '../socket.js';
import { useRoom } from '../store.js';

const PHASE_HINT = {
  [PHASE.NIGHT]: 'Night falls. Everyone eyes closed.',
  [PHASE.DAY]: 'Day. Talk it over.',
  [PHASE.DUSK]: 'Dusk. Nominations are open — tap a seat to nominate.',
};

export default function NominationBar({ seated, clock }) {
  const { state, me, isStoryteller, act } = useRoom();
  const nomination = state.nomination;
  const [speed, setSpeed] = useState(VOTE_SPEEDS[1].msPerPlayer);
  const [hand, setHand] = useState(false);

  // Follow the server's idea of our pending hand (it resets between votes).
  useEffect(() => {
    setHand(Boolean(nomination?.myHand));
  }, [nomination?.myHand, nomination?.startAt]);

  if (!nomination || nomination.state === NOMINATION_STATE.FINISHED) {
    return (
      <div className="nomination-bar">
        {nomination?.result ? (
          <Result nomination={nomination} seated={seated} isStoryteller={isStoryteller} act={act} />
        ) : (
          <p className="nomination-bar__hint">{PHASE_HINT[state.phase] ?? ''}</p>
        )}
      </div>
    );
  }

  const nominee = seated.find((p) => p.id === nomination.nomineeId);
  const nominator = state.players.find((p) => p.id === nomination.nominatorId);
  const headline = `${nominator ? nominator.name : 'The storyteller'} nominated ${
    nominee?.name ?? 'someone'
  }`;

  if (nomination.state === NOMINATION_STATE.OPEN) {
    return (
      <div className="nomination-bar nomination-bar--open">
        <p className="nomination-bar__headline">{headline}</p>
        {isStoryteller ? (
          <div className="vote-start">
            <div className="speed-picker">
              {VOTE_SPEEDS.map((option) => (
                <button
                  key={option.msPerPlayer}
                  type="button"
                  className={`chip${option.msPerPlayer === speed ? ' chip--active' : ''}`}
                  onClick={() => setSpeed(option.msPerPlayer)}
                >
                  {option.label}
                  <em>
                    {Math.round(
                      (option.msPerPlayer * (seated.length - 1 + LIMITS.HAND_START_OFFSET)) / 1000,
                    )}
                    s
                  </em>
                </button>
              ))}
            </div>
            <div className="row">
              <button
                type="button"
                className="primary-button"
                onClick={() => act(C2S.VOTE_START, { msPerPlayer: speed })}
              >
                Start vote
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => act(C2S.NOMINATION_CANCEL, null)}
              >
                Withdraw
              </button>
            </div>
          </div>
        ) : (
          <p className="nomination-bar__hint">Waiting for the storyteller to call the vote…</p>
        )}
      </div>
    );
  }

  // Voting.
  const myIndex = me ? nomination.order.indexOf(me.id) : -1;
  const iAmLocked = me ? me.id in nomination.locked : true;
  const myArrival =
    myIndex >= 0
      ? nomination.startAt + (myIndex + LIMITS.HAND_START_OFFSET) * nomination.msPerPlayer
      : null;
  const secondsToMe = myArrival ? Math.max(0, Math.ceil((myArrival - serverNow()) / 1000)) : 0;

  const toggleHand = async () => {
    const next = !hand;
    setHand(next); // optimistic; the server corrects us if we were too late
    const res = await act(C2S.VOTE_HAND, { value: next });
    if (!res.ok) setHand(!next);
  };

  return (
    <div className="nomination-bar nomination-bar--voting">
      <p className="nomination-bar__headline">{headline}</p>
      {myIndex < 0 ? (
        <p className="nomination-bar__hint">
          {isStoryteller ? 'The town is voting.' : 'You are not in this vote.'}
        </p>
      ) : iAmLocked ? (
        <p className="nomination-bar__hint">
          Your vote is locked in: <strong>{nomination.locked[me.id] ? 'yes' : 'no'}</strong>
        </p>
      ) : (
        <button
          type="button"
          className={`hand-button${hand ? ' hand-button--raised' : ''}`}
          onClick={toggleHand}
        >
          <span className="hand-button__icon">{hand ? '✋' : '✋'}</span>
          <span className="hand-button__label">
            {hand ? 'Hand raised' : 'Raise your hand'}
            <em>
              {clock.leadIn > 0
                ? `starting in ${clock.leadIn}…`
                : `locks in ${secondsToMe}s`}
            </em>
          </span>
        </button>
      )}
      {me && !me.alive && (
        <p className="nomination-bar__ghost">
          {me.usedGhostVote
            ? 'You have already spent your ghost vote.'
            : 'Dead: you have one vote left for the rest of the game.'}
        </p>
      )}
    </div>
  );
}

function Result({ nomination, seated, isStoryteller, act }) {
  const nominee = seated.find((p) => p.id === nomination.nomineeId);
  const { yes, threshold } = nomination.result;
  const passes = yes >= threshold;
  return (
    <div className="result">
      <p className="result__line">
        <strong>{nominee?.name ?? 'Nominee'}</strong> — {yes} vote{yes === 1 ? '' : 's'}, {threshold}{' '}
        needed.{' '}
        <span className={passes ? 'result__pass' : 'result__fail'}>
          {passes ? 'Enough to execute.' : 'Not enough.'}
        </span>
      </p>
      {isStoryteller && (
        <button
          type="button"
          className="ghost-button"
          onClick={() => act(C2S.NOMINATION_CANCEL, null)}
        >
          Clear the floor
        </button>
      )}
    </div>
  );
}
