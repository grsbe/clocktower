import Avatar from './Avatar.jsx';

const RADIUS_PERCENT = 39;

export default function SeatCircle({
  seated,
  nomination,
  activeSeatIndex = -1,
  meId,
  selectableIds = null,
  onSeatClick,
  hand = null,
  children,
}) {
  const count = seated.length;
  const voteOrder = nomination?.order ?? [];

  return (
    <div className="table">
      <div className="table__ring" />
      {hand}
      {children && <div className="table__centre">{children}</div>}
      {seated.map((player, index) => {
        const angle = (index / count) * 360 - 90;
        const rad = (angle * Math.PI) / 180;
        const left = 50 + RADIUS_PERCENT * Math.cos(rad);
        const top = 50 + RADIUS_PERCENT * Math.sin(rad);

        const orderIndex = voteOrder.indexOf(player.id);
        const locked = nomination?.locked?.[player.id];
        const isNominee = nomination?.nomineeId === player.id;
        const isNominator = nomination?.nominatorId === player.id;
        const selectable = selectableIds ? selectableIds.includes(player.id) : false;
        const isActive = activeSeatIndex >= 0 && orderIndex === activeSeatIndex;

        const classes = [
          'seat',
          !player.alive && 'seat--dead',
          !player.connected && 'seat--away',
          player.id === meId && 'seat--me',
          isNominee && 'seat--nominee',
          isNominator && 'seat--nominator',
          isActive && 'seat--active',
          selectable && 'seat--selectable',
          locked === true && 'seat--yes',
          locked === false && 'seat--no',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={player.id}
            type="button"
            className={classes}
            style={{ left: `${left}%`, top: `${top}%` }}
            disabled={!selectable}
            onClick={() => selectable && onSeatClick?.(player)}
          >
            <span className="seat__token">
              <Avatar player={player} size={54} />
              {!player.alive && <span className="seat__shroud" aria-hidden="true" />}
              {locked === true && <span className="seat__vote seat__vote--yes">✋</span>}
              {locked === false && <span className="seat__vote seat__vote--no">·</span>}
            </span>
            <span className="seat__name">{player.name}</span>
            {!player.alive && player.usedGhostVote && (
              <span className="seat__ghost" title="Ghost vote spent">
                vote spent
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
