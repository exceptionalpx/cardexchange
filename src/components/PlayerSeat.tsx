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
  /** 是否处于托管状态（退出/掉线，由服务器 AI 代打） */
  aiControlled?: boolean;
  /** 跟弃窗口信息（倒计时+放弃按钮，显示在手牌区弃牌按钮旁） */
  followBar?: { left: number; gaveUp: boolean; onPass: () => void } | null;
}

export default function PlayerSeat({
  player,
  isCurrent,
  isDeclared,
  selectable,
  onSlotClick,
  showDiscard,
  onDiscard,
  aiControlled,
  followBar,
}: Props) {
  return (
    <div
      className={`seat ${isCurrent ? 'seat-current' : ''} ${isDeclared ? 'seat-declared' : ''}`}
      data-player={player.id}
    >
      <div className="seat-name">
        {player.avatar && <span className="avatar avatar-sm">{player.avatar}</span>}
        {player.name}
        {isCurrent && <span className="badge">行动中</span>}
        {isDeclared && <span className="badge badge-declared">已定牌</span>}
        {player.isBot && <span className="badge badge-bot">AI</span>}
        {aiControlled && <span className="badge badge-ai">托管中</span>}
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
      {followBar && (
        <div className="follow-bar seat-follow-bar">
          <span className="follow-timer">可跟弃 · {followBar.left}s</span>
          <button className="btn btn-small" onClick={followBar.onPass} disabled={followBar.gaveUp}>
            {followBar.gaveUp ? '已放弃（等待其他玩家）' : '放弃'}
          </button>
        </div>
      )}
    </div>
  );
}
