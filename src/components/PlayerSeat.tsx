import type { ViewPlayer } from '../core/view';
import CardView from './CardView';

interface Props {
  player: ViewPlayer;
  isCurrent: boolean;
  isDeclared: boolean;
  selectable: boolean;
  onSlotClick?: (slot: number) => void;
  /** 是否显示每张手牌下方的"弃"按钮（跟弃用，整局常驻） */
  showDiscard?: boolean;
  onDiscard?: (slot: number) => void;
}

export default function PlayerSeat({
  player,
  isCurrent,
  isDeclared,
  selectable,
  onSlotClick,
  showDiscard,
  onDiscard,
}: Props) {
  return (
    <div className={`seat ${isCurrent ? 'seat-current' : ''} ${isDeclared ? 'seat-declared' : ''}`}>
      <div className="seat-name">
        {player.name}
        {isCurrent && <span className="badge">行动中</span>}
        {isDeclared && <span className="badge badge-declared">已定牌</span>}
        {player.isBot && <span className="badge badge-bot">AI</span>}
      </div>
      <div className="seat-slots">
        {player.slots.map((s, i) => (
          <div
            className="card-slot"
            key={i}
            data-player={player.id}
            data-slot={i}
          >
            <CardView
              card={s.card}
              known={s.known}
              onClick={s.card ? () => onSlotClick?.(i) : undefined}
              selectable={selectable && !!s.card}
              highlight={isCurrent}
            />
            {showDiscard && s.card && (
              <button className="discard-btn" onClick={() => onDiscard?.(i)}>
                弃
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
