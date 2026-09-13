import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { C2S, LIMITS } from '@shared/events.js';
import { useRoom } from '../store.js';
import Avatar from '../components/Avatar.jsx';
import AvatarDraw from '../components/AvatarDraw.jsx';

const STORYTELLER_SLOT = '__storyteller-slot__';

export default function LobbyScreen() {
  const { state, me, act, isStoryteller, leaveRoom, notify } = useRoom();
  const [editing, setEditing] = useState(false);

  const seated = useMemo(
    () => state.players.filter((p) => p.id !== state.storytellerId),
    [state.players, state.storytellerId],
  );
  const storyteller = state.players.find((p) => p.id === state.storytellerId) ?? null;
  const canArrange = !state.storytellerId || isStoryteller;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }) => {
    if (!over || !canArrange) return;

    if (over.id === STORYTELLER_SLOT) {
      act(C2S.STORYTELLER_SET, { playerId: active.id });
      return;
    }
    if (active.id === over.id) return;

    const from = seated.findIndex((p) => p.id === active.id);
    const to = seated.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    const order = arrayMove(seated, from, to).map((p) => p.id);
    act(C2S.SEATING_SET, { order });
  };

  const startGame = async () => {
    if (seated.length < LIMITS.MIN_PLAYERS_TO_START) {
      return notify(`You need at least ${LIMITS.MIN_PLAYERS_TO_START} seated players.`);
    }
    await act(C2S.GAME_START, null);
  };

  return (
    <div className="screen screen--lobby">
      <header className="lobby__header">
        <div>
          <p className="lobby__label">Room code</p>
          <button
            type="button"
            className="room-code"
            onClick={() => {
              navigator.clipboard?.writeText(state.code).then(
                () => notify('Room code copied.'),
                () => {},
              );
            }}
            title="Copy room code"
          >
            {state.code}
          </button>
        </div>
        <button type="button" className="link-button" onClick={leaveRoom}>
          Leave
        </button>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <StorytellerSlot
          storyteller={storyteller}
          canArrange={canArrange}
          onClear={() => act(C2S.STORYTELLER_SET, { playerId: null })}
        />

        <p className="lobby__hint">
          {canArrange
            ? 'Drag to set the seating order, or drag someone into the storyteller seat.'
            : 'The storyteller arranges the seating.'}
        </p>

        <SortableContext items={seated.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <ul className="seat-list">
            {seated.map((player, index) => (
              <SeatRow
                key={player.id}
                player={player}
                index={index}
                isMe={player.id === me?.id}
                canArrange={canArrange}
                canRemove={isStoryteller && player.id !== me?.id}
                onRemove={() => act(C2S.PLAYER_REMOVE, { playerId: player.id })}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {seated.length === 0 && <p className="empty">Nobody is seated yet.</p>}

      <div className="lobby__footer">
        <button type="button" className="ghost-button" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Done editing' : 'Edit my token'}
        </button>
        {isStoryteller ? (
          <button
            type="button"
            className="primary-button"
            onClick={startGame}
            disabled={seated.length < LIMITS.MIN_PLAYERS_TO_START}
          >
            Start game
          </button>
        ) : (
          <p className="lobby__waiting">
            {storyteller ? `Waiting for ${storyteller.name} to start…` : 'Waiting for a storyteller…'}
          </p>
        )}
      </div>

      {editing && (
        <div className="panel panel--inline">
          <h2 className="panel__title">Your token</h2>
          <label className="field">
            <span>Name</span>
            <input
              defaultValue={me?.name ?? ''}
              maxLength={LIMITS.NAME_MAX}
              onBlur={(e) => act(C2S.PLAYER_PROFILE_SET, { name: e.target.value })}
            />
          </label>
          <AvatarDraw onChange={(avatar) => act(C2S.PLAYER_PROFILE_SET, { name: me?.name, avatar })} />
        </div>
      )}
    </div>
  );
}

function StorytellerSlot({ storyteller, canArrange, onClear }) {
  const { setNodeRef, isOver } = useDroppable({ id: STORYTELLER_SLOT });
  return (
    <div
      ref={setNodeRef}
      className={`storyteller-slot${isOver ? ' storyteller-slot--over' : ''}${
        storyteller ? ' storyteller-slot--filled' : ''
      }`}
    >
      <span className="storyteller-slot__label">Storyteller</span>
      {storyteller ? (
        <div className="storyteller-slot__player">
          <Avatar player={storyteller} size={44} />
          <span>{storyteller.name}</span>
          {canArrange && (
            <button type="button" className="link-button" onClick={onClear}>
              clear
            </button>
          )}
        </div>
      ) : (
        <span className="storyteller-slot__empty">drag someone here</span>
      )}
    </div>
  );
}

function SeatRow({ player, index, isMe, canArrange, canRemove, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: player.id,
    disabled: !canArrange,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`seat-row${isDragging ? ' seat-row--dragging' : ''}${isMe ? ' seat-row--me' : ''}`}
    >
      <span className="seat-row__index">{index + 1}</span>
      <Avatar player={player} size={40} />
      <span className="seat-row__name">
        {player.name}
        {isMe && <em> (you)</em>}
      </span>
      {!player.connected && <span className="badge badge--away">away</span>}
      {canRemove && (
        <button type="button" className="link-button" onClick={onRemove}>
          remove
        </button>
      )}
      {canArrange && (
        <button
          type="button"
          className="seat-row__handle"
          aria-label={`Move ${player.name}`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
      )}
    </li>
  );
}
