// 观战界面（方案A 全视角）：不占座位、随时进出、对局中实时跟随、结束后可看结算
import { useEffect, useMemo, useRef, useState } from 'react';
import { Net } from '../net/socket';
import type { WatchView } from '../../server/protocol';
import type { GameState } from '../core/types';
import PlayerSeat from './PlayerSeat';
import DiscardPile from './DiscardPile';
import UsedPile from './UsedPile';
import CardView from './CardView';

interface Props {
  code: string;
  onExit: () => void;
}

const PHASE_LABEL: Record<WatchView['phase'], string> = {
  deal: '发牌（看牌盖牌）',
  playing: '对局中',
  follow: '对局中',
  final: '定牌终局',
  end: '已结束',
};

/** 观战动作日志：取最近一次事件（字段被广播覆盖即最新） */
function lastActionText(v: WatchView): string | null {
  const players = v.players;
  const name = (id: number) => players[id]?.name ?? `玩家${id + 1}`;
  const best = [
    v.lastMove ? { seq: v.lastMove.seq, text: v.lastMove.kind === 'discard' ? `${name(v.lastMove.actor)} 弃了一张牌` : `${name(v.lastMove.actor)} 替换了手牌（旧牌进弃牌堆）` } : null,
    v.lastSwap ? { seq: v.lastSwap.seq, text: `${name(v.lastSwap.actor)} 与 ${name(v.lastSwap.otherPlayer)} 交换了手牌` } : null,
    v.lastViewed ? { seq: v.lastViewed.seq, text: `${name(v.lastViewed.actor)} 翻看了 ${name(v.lastViewed.targetPlayer)} 的一张牌` } : null,
    v.lastPenalty ? { seq: v.lastPenalty.seq, text: `${name(v.lastPenalty.actor)} 跟弃失败，罚补 1 张牌` } : null,
  ].filter((x): x is { seq: number; text: string } => x !== null);
  if (best.length === 0) return null;
  best.sort((a, b) => b.seq - a.seq);
  return best[0].text;
}

export default function WatchScreen({ code, onExit }: Props) {
  const [view, setView] = useState<WatchView | null>(null);
  const [hostName, setHostName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const netRef = useRef<Net | null>(null);

  useEffect(() => {
    const net = new Net();
    netRef.current = net;
    // 断线自动重连并重新订阅观战
    net.setResume(() => ({ type: 'watchRoom', code }));
    const off = net.onMessage((msg) => {
      switch (msg.type) {
        case 'watchStart':
          setHostName(msg.hostName);
          setError(null);
          setClosed(null);
          break;
        case 'watchView':
          setView(msg.view);
          break;
        case 'watchClosed':
          setClosed(msg.message);
          break;
        case 'error':
          setError(msg.message);
          break;
      }
    });
    net
      .connect()
      .then(() => net.send({ type: 'watchRoom', code }))
      .catch(() => setError('无法连接联机服务器'));
    return () => {
      off();
      net.close();
    };
  }, [code]);

  function exitWatch() {
    // 正常退出：告知服务器取消订阅后断开
    try {
      netRef.current?.send({ type: 'watchLeave' });
    } catch {
      /* 忽略 */
    }
    setTimeout(() => {
      netRef.current?.close();
      onExit();
    }, 50);
  }

  const actionText = useMemo(() => (view ? lastActionText(view) : null), [view]);
  const declareBonusOn = !!view && view.declareBonus && view.phase !== 'end';

  return (
    <div className="menu watch-screen">
      <div className="watch-top">
        <div className="watch-top-title">
          👀 观战中 · 房间 {code}
          {hostName && <span className="hint">（房主 {hostName}）</span>}
          {view && <span className="badge">{PHASE_LABEL[view.phase]}</span>}
        </div>
        <button className="btn" onClick={exitWatch}>
          退出观战
        </button>
      </div>
      {error && <p className="hint hint-error">{error}</p>}
      {closed && <p className="hint hint-warn">{closed}</p>}

      {view && (
        <div className="table">
          <div className="center-area">
            {declareBonusOn && (() => {
              const initDeck = 54 - 4 * view.players.length;
              const n2 = Math.ceil(initDeck * 0.6);
              const n1 = Math.ceil(initDeck * 0.35);
              return (
                <div className="declare-bonus-hint">
                  定牌奖励：牌堆剩余 ≥{n2} 张 −2 分 · ≥{n1} 张 −1 分
                </div>
              );
            })()}
            <div className="deck-stub">
              <div className="deck-stack" aria-hidden>
                <div className="deck-card deck-card-1" />
                <div className="deck-card deck-card-2" />
                <div className="deck-card deck-card-3" />
              </div>
              <div className="deck-count">{view.deckCount} 张</div>
            </div>
            <DiscardPile state={view as unknown as GameState} />
            <UsedPile state={view as unknown as GameState} />
            {view.follow && (
              <div className="follow-banner">
                {view.players[view.follow.discarder]?.name ?? `玩家${view.follow.discarder + 1}`} 弃了一张 {view.follow.targetScore} 分的牌，等待跟弃
              </div>
            )}
            {actionText && <div className="watch-action">{actionText}</div>}
            {view.pending?.kind === 'drawn' && view.pending.card && (
              <div className="watch-drawn">
                {view.players[view.currentPlayer]?.name ?? `玩家${view.currentPlayer + 1}`} 摸到一张牌
                <CardView card={view.pending.card} known extraClass="card-pending" />
              </div>
            )}
          </div>

          <div className="seats">
            {view.players.map((p) => (
              <PlayerSeat
                key={p.id}
                player={{
                  id: p.id,
                  name: p.name,
                  isBot: p.isBot,
                  avatar: p.avatar,
                  slots: p.slots.map((c) => ({ card: c, known: !!c })),
                }}
                isCurrent={p.id === view.currentPlayer}
                isDeclared={p.id === view.declaredPlayer}
                selectable={false}
                aiControlled={view.aiControlled.includes(p.id)}
              />
            ))}
          </div>

          {view.phase === 'end' && view.winner && (
            <div className="result result-watch">
              <h2 className="result-title">🏆 {view.winner.map((id) => view.players[id]?.name ?? `玩家${id + 1}`).join('、')} 获胜！</h2>
              <div className="result-list">
                {view.players.map((p) => {
                  const isWinner = view.winner!.includes(p.id);
                  const score = p.score ?? 0;
                  return (
                    <div key={p.id} className={`result-row ${isWinner ? 'result-row-win' : ''}`}>
                      <span className="result-name">
                        {p.avatar && <span className="avatar avatar-sm">{p.avatar}</span>}
                        {p.name}
                      </span>
                      <span className="result-score">
                        {view.settleBonus > 0 && p.id === view.declaredPlayer ? (
                          <>
                            手牌 {score + view.settleBonus} − 定牌奖励 {view.settleBonus} = 总分 {score}
                          </>
                        ) : (
                          <>总分：{score}</>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              {view.gamesPlayed > 0 && Object.keys(view.totalScores).length > 0 && (
                <div className="result-total">
                  <div className="result-total-title">多局累计（总分最小者最终胜出）</div>
                  {Object.entries(view.totalScores)
                    .map(([pidStr, score]) => ({ pid: Number(pidStr), score }))
                    .sort((a, b) => a.score - b.score)
                    .map(({ pid, score }) => (
                      <span key={pid} className="result-total-row">
                        {view.players[pid]?.name ?? `玩家${pid + 1}`}：{score}
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
