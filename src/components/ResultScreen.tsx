import type { GameState } from '../core/types';
import CardView from './CardView';

interface Props {
  state: GameState;
  onRestart: () => void;
  /** 联机模式：只有房主能发起下一局 */
  canRestart?: boolean;
  onExit: () => void;
}

export default function ResultScreen({ state, onRestart, canRestart = true, onExit }: Props) {
  const winners = state.winner ?? [];
  return (
    <div className="result-screen">
      <div className="result-card">
        <h2 className="result-title">
          🏆 {winners.map((id) => state.players[id].name).join('、')} 获胜！
        </h2>
        <p className="hint">手牌总分最小者获胜（并列同时胜出）</p>
        <div className="result-players">
          {state.players.map((p) => {
            const isWinner = winners.includes(p.id);
            return (
              <div key={p.id} className={`result-player ${isWinner ? 'result-winner' : ''}`}>
                <div className="seat-name">
                  {p.avatar && <span className="avatar avatar-md">{p.avatar}</span>}
                  {p.name}
                  {isWinner && <span className="badge">胜者</span>}
                </div>
                <div className="seat-slots">
                  {p.handSlots.map((c, i) => (
                    <CardView key={i} card={c} known />
                  ))}
                </div>
                <div className={`result-score ${isWinner ? 'result-score-win' : ''}`}>
                  总分：{p.score}
                </div>
              </div>
            );
          })}
        </div>
        <div className="btn-row">
          {canRestart ? (
            <button className="btn btn-primary btn-big" onClick={onRestart}>
              再来一局
            </button>
          ) : (
            <p className="hint">等待房主开始下一局…</p>
          )}
          <button className="btn btn-big" onClick={onExit}>
            返回主菜单
          </button>
        </div>
      </div>
    </div>
  );
}
