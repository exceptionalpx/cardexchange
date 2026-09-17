import type { GameState } from '../core/types';
import CardView from './CardView';

interface Props {
  state: GameState;
  onRestart: () => void;
  /** 联机模式：只有房主能发起下一局 */
  canRestart?: boolean;
  onExit: () => void;
  /** 多局累计总分（key = 玩家 id，仅下发已参与玩家；缺省不显示累计榜） */
  totalScores?: Record<number, number> | null;
  /** 已玩局数（含本局） */
  gamesPlayed?: number;
}

export default function ResultScreen({
  state,
  onRestart,
  canRestart = true,
  onExit,
  totalScores,
  gamesPlayed,
}: Props) {
  const winners = state.winner ?? [];
  const hasTotal = !!totalScores && Object.keys(totalScores).length > 0;
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
                  {state.settleBonus > 0 && p.id === state.declaredPlayer ? (
                    <span className="result-score-breakdown">
                      手牌 {(p.score ?? 0) + state.settleBonus} − 定牌奖励 {state.settleBonus} = 总分 {p.score}
                    </span>
                  ) : (
                    <>总分：{p.score}</>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {hasTotal && (
          <div className="result-total">
            <div className="pile-label">
              累计总分榜（{gamesPlayed ?? 1} 局 · 总分最小者最终胜）
            </div>
            <div className="result-total-row">
              {[...state.players]
                .sort((a, b) => (totalScores[a.id] ?? 0) - (totalScores[b.id] ?? 0))
                .map((p, i) => (
                  <div key={p.id} className={`result-total-item ${i === 0 ? 'result-total-lead' : ''}`}>
                    <span className="result-total-rank">{i + 1}</span>
                    {p.avatar && <span className="avatar avatar-sm">{p.avatar}</span>}
                    <span className="result-total-name">{p.name}</span>
                    <span className="result-total-score">{totalScores[p.id] ?? 0} 分</span>
                  </div>
                ))}
            </div>
          </div>
        )}

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
