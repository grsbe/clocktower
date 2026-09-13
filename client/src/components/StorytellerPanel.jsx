import { useEffect, useRef, useState } from 'react';
import { C2S, LIMITS } from '@shared/events.js';
import { useRoom } from '../store.js';
import Avatar from './Avatar.jsx';

export default function StorytellerPanel({ seated }) {
  const { state, act } = useRoom();

  return (
    <section className="st-panel">
      <ul className="st-panel__list">
        {seated.map((player, index) => (
          <li key={player.id} className={`st-row${player.alive ? '' : ' st-row--dead'}`}>
            <div className="st-row__head">
              <span className="st-row__seat">{index + 1}</span>
              <Avatar player={player} size={36} />
              <span className="st-row__name">{player.name}</span>
              {!player.connected && <span className="badge badge--away">away</span>}
              <div className="st-row__toggles">
                <button
                  type="button"
                  className={`chip chip--tiny${player.alive ? '' : ' chip--active'}`}
                  onClick={() => act(C2S.PLAYER_ALIVE_SET, { playerId: player.id, alive: !player.alive })}
                >
                  {player.alive ? 'kill' : 'revive'}
                </button>
                {!player.alive && (
                  <button
                    type="button"
                    className={`chip chip--tiny${player.usedGhostVote ? ' chip--active' : ''}`}
                    onClick={() =>
                      act(C2S.PLAYER_GHOSTVOTE_SET, {
                        playerId: player.id,
                        used: !player.usedGhostVote,
                      })
                    }
                    title="Whether this player's one remaining vote has been spent"
                  >
                    {player.usedGhostVote ? 'vote spent' : 'vote left'}
                  </button>
                )}
              </div>
            </div>
            <NoteField
              playerId={player.id}
              initial={state.notes?.[player.id] ?? ''}
              onSave={(text) => act(C2S.NOTE_SET, { playerId: player.id, text })}
            />
          </li>
        ))}
      </ul>

      {state.history.length > 0 && (
        <div className="st-panel__history">
          <h3>Earlier nominations</h3>
          <ul>
            {[...state.history].reverse().map((entry) => {
              const nominee = state.players.find((p) => p.id === entry.nomineeId);
              const nominator = state.players.find((p) => p.id === entry.nominatorId);
              return (
                <li key={entry.id}>
                  <strong>{nominee?.name ?? '?'}</strong> by {nominator?.name ?? 'storyteller'} —{' '}
                  {entry.result.yes}/{entry.result.threshold}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Free-text note under a player, saved a moment after typing stops. */
function NoteField({ playerId, initial, onSave }) {
  const [text, setText] = useState(initial);
  const firstRender = useRef(true);

  // Switching rows should not carry the previous player's text over.
  useEffect(() => {
    setText(initial);
    firstRender.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return undefined;
    }
    const timer = setTimeout(() => onSave(text), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <textarea
      className="st-row__note"
      value={text}
      maxLength={LIMITS.NOTE_MAX}
      rows={2}
      placeholder="notes…"
      onChange={(e) => setText(e.target.value)}
    />
  );
}
