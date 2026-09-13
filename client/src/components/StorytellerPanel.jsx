import { useEffect, useRef, useState } from 'react';
import { C2S, DEATH, EVENT, LIMITS, PHASE } from '@shared/events.js';
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
                {player.causeOfDeath !== DEATH.EXECUTED && (
                  <button
                    type="button"
                    className="chip chip--tiny chip--execute"
                    onClick={() => act(C2S.PLAYER_EXECUTE, { playerId: player.id })}
                    title="Killed by the town's vote, and written into the day log"
                  >
                    execute
                  </button>
                )}
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

      {(state.history.length > 0 || (state.events ?? []).length > 0) && (
        <DayLog
          history={state.history}
          events={state.events ?? []}
          players={state.players}
        />
      )}
    </section>
  );
}

/**
 * The day log: everything that happened, grouped by the cycle it happened on
 * and told in order within each day — who died, who the town executed, and
 * every nomination with the two lists the storyteller wants afterwards, who
 * put their hand up and who left it down. Hands raised before the vote was
 * called are marked, since those were committed without seeing anybody else's.
 */
function DayLog({ history, events, players }) {
  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? 'someone';

  const items = [
    ...history.map((entry) => ({
      key: entry.id,
      day: entry.day ?? 1,
      at: entry.finishedAt,
      nomination: entry,
    })),
    ...events.map((event) => ({
      key: event.id,
      day: event.day ?? 1,
      at: event.at,
      event,
    })),
  ];

  const days = [];
  for (const item of items.sort((a, b) => a.at - b.at)) {
    const bucket = days.find((d) => d.day === item.day);
    if (bucket) bucket.items.push(item);
    else days.push({ day: item.day, items: [item] });
  }
  days.reverse(); // newest day first, but each day still reads top to bottom

  return (
    <div className="st-panel__history">
      <h3>Day log</h3>
      {days.map(({ day, items: dayItems }) => (
        <section key={day} className="day-log">
          <h4 className="day-log__head">Day {day}</h4>
          <ul className="day-log__list">
            {dayItems.map((item) =>
              item.event ? (
                <li key={item.key}>
                  <EventLine event={item.event} nameOf={nameOf} />
                </li>
              ) : (
                <li key={item.key}>
                  <NominationEntry entry={item.nomination} nameOf={nameOf} />
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

const EVENT_MARK = {
  [EVENT.EXECUTION]: '⚖',
  [EVENT.DEATH]: '†',
  [EVENT.REVIVAL]: '✚',
};

function EventLine({ event, nameOf }) {
  const name = nameOf(event.playerId);
  let text;
  if (event.type === EVENT.EXECUTION) text = `${name} was executed`;
  else if (event.type === EVENT.REVIVAL) text = `${name} was brought back`;
  else text = event.phase === PHASE.NIGHT ? `${name} died in the night` : `${name} died`;

  return (
    <p className={`day-log__event day-log__event--${event.type}`}>
      <span className="day-log__mark" aria-hidden="true">
        {EVENT_MARK[event.type] ?? '·'}
      </span>
      {text}
      <span className="day-log__time">{timeOfDay(event.at)}</span>
    </p>
  );
}

function NominationEntry({ entry, nameOf }) {
  const voters = entry.order ?? Object.keys(entry.locked ?? {});
  const early = new Set(entry.preRaised ?? []);
  const raised = voters.filter((id) => entry.locked?.[id]);
  const down = voters.filter((id) => !entry.locked?.[id]);
  const passed = entry.result.yes >= entry.result.threshold;

  return (
    <div className="vote-log__entry">
      <div className="vote-log__head">
        <strong>{nameOf(entry.nomineeId)}</strong>
        <span className="vote-log__by">
          by {entry.nominatorId ? nameOf(entry.nominatorId) : 'storyteller'}
        </span>
        <span className={`vote-log__tally${passed ? ' vote-log__tally--pass' : ''}`}>
          {entry.result.yes}/{entry.result.threshold}
        </span>
        <span className="vote-log__time">{timeOfDay(entry.finishedAt)}</span>
      </div>
      <p className="vote-log__row vote-log__row--yes">
        <span className="vote-log__label">✋ raised ({raised.length})</span>
        {raised.length
          ? raised.map((id) => nameOf(id) + (early.has(id) ? ' (early)' : '')).join(', ')
          : '—'}
      </p>
      <p className="vote-log__row vote-log__row--no">
        <span className="vote-log__label">hands down ({down.length})</span>
        {down.length ? down.map(nameOf).join(', ') : '—'}
      </p>
    </div>
  );
}

function timeOfDay(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
