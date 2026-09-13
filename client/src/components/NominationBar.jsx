import { useEffect, useRef, useState } from 'react';
import {
  C2S,
  DEFAULT_VOTE_SPEED,
  LIMITS,
  NOMINATION_STATE,
  PHASE,
  VOTE_SPEEDS,
} from '@shared/events.js';
import { serverNow } from '../socket.js';
import { useRoom } from '../store.js';

const PHASE_HINT = {
  [PHASE.NIGHT]: 'Night falls. Everyone eyes closed.',
  [PHASE.DAY]: 'Day. Talk it over.',
  [PHASE.DUSK]: 'Dusk. Nominations are open — tap a seat to nominate.',
};

/** Whole sweep, from the gap before the first voter to the nominee. */
function sweepMs(msPerPlayer, seatCount) {
  return msPerPlayer * (seatCount - 1 + LIMITS.HAND_START_OFFSET);
}

function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  if (total < 100) return `${total}s`;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function NominationBar({ seated }) {
  const { state, me, isStoryteller, act } = useRoom();
  const nomination = state.nomination;
  const [speed, setSpeed] = useState(DEFAULT_VOTE_SPEED);
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

  const myIndex = me ? nomination.order.indexOf(me.id) : -1;
  const iAmAVoter = myIndex >= 0;

  const toggleHand = async () => {
    const next = !hand;
    setHand(next); // optimistic; the server corrects us if we were too late
    const res = await act(C2S.VOTE_HAND, { value: next });
    if (!res.ok) setHand(!next);
  };

  if (nomination.state === NOMINATION_STATE.OPEN) {
    return (
      <div className="nomination-bar nomination-bar--open">
        <p className="nomination-bar__headline">{headline}</p>
        {iAmAVoter && (
          // Hands may go up before the storyteller calls the vote. An early
          // hand simply stays up and is locked in when the clock hand passes,
          // so nobody has to be watching the screen at the right second.
          <HandButton
            hand={hand}
            onToggle={toggleHand}
            note={hand ? 'counts when the hand reaches you' : 'you can also wait for the clock'}
          />
        )}
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
                  <em>{formatDuration(sweepMs(option.msPerPlayer, seated.length))}</em>
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
        {me && !me.alive && <GhostNote me={me} />}
      </div>
    );
  }

  // Voting.
  const iAmLocked = me ? me.id in nomination.locked : true;
  const myArrival = iAmAVoter
    ? nomination.startAt + (myIndex + LIMITS.HAND_START_OFFSET) * nomination.msPerPlayer
    : null;
  // The bar drains across the whole span this player was given, counting the
  // lead-in, so it starts full the moment the vote is called.
  const myWindowMs = myArrival ? myArrival - (nomination.startAt - LIMITS.VOTE_LEAD_IN_MS) : 0;

  return (
    <div className="nomination-bar nomination-bar--voting">
      <p className="nomination-bar__headline">{headline}</p>
      {!iAmAVoter ? (
        <p className="nomination-bar__hint">
          {isStoryteller ? 'The town is voting.' : 'You are not in this vote.'}
        </p>
      ) : iAmLocked ? (
        <p className="nomination-bar__hint">
          Your vote is locked in: <strong>{nomination.locked[me.id] ? 'yes' : 'no'}</strong>
        </p>
      ) : (
        <>
          <VoteTimer lockAt={myArrival} windowMs={myWindowMs} />
          <HandButton
            hand={hand}
            onToggle={toggleHand}
            note={hand ? 'tap again to lower it' : 'tap before the clock hand reaches you'}
          />
        </>
      )}
      {me && !me.alive && <GhostNote me={me} />}
    </div>
  );
}

/**
 * Your own countdown: how long until the clock hand reaches your seat and
 * whatever your hand is doing at that moment becomes your vote.
 *
 * It runs off the shared server clock on its own animation frame rather than
 * off a prop, so it stays honest even if nothing else on the screen changes,
 * and it only re-renders when the displayed second actually flips — the
 * draining bar is written straight to the element.
 */
function VoteTimer({ lockAt, windowMs }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((lockAt - serverNow()) / 1000)),
  );
  const fillRef = useRef(null);

  useEffect(() => {
    let frame;
    const tick = () => {
      const remaining = lockAt - serverNow();
      if (fillRef.current) {
        const fraction = windowMs > 0 ? Math.max(0, Math.min(1, remaining / windowMs)) : 0;
        fillRef.current.style.transform = `scaleX(${fraction})`;
      }
      const next = Math.max(0, Math.ceil(remaining / 1000));
      setSecondsLeft((prev) => (prev === next ? prev : next));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [lockAt, windowMs]);

  const urgent = secondsLeft <= 5;

  return (
    <div className={`vote-timer${urgent ? ' vote-timer--urgent' : ''}`} role="timer">
      <div className="vote-timer__head">
        <span className="vote-timer__count">{secondsLeft}s</span>
        <span className="vote-timer__label">
          {secondsLeft > 0 ? 'until your vote locks' : 'locking in…'}
        </span>
      </div>
      <div className="vote-timer__track">
        <div className="vote-timer__fill" ref={fillRef} />
      </div>
    </div>
  );
}

function HandButton({ hand, onToggle, note }) {
  return (
    <button
      type="button"
      className={`hand-button${hand ? ' hand-button--raised' : ''}`}
      onClick={onToggle}
    >
      <span className="hand-button__icon">✋</span>
      <span className="hand-button__label">
        {hand ? 'Hand raised' : 'Raise your hand'}
        <em>{note}</em>
      </span>
    </button>
  );
}

function GhostNote({ me }) {
  return (
    <p className="nomination-bar__ghost">
      {me.usedGhostVote
        ? 'You have already spent your ghost vote.'
        : 'Dead: you have one vote left for the rest of the game.'}
    </p>
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
