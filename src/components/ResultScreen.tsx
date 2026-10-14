import { useEffect, useState } from 'react';
import type { GameState } from '../core/types';
import CardView from './CardView';
import { playSfx } from '../core/sfx';
import { drawResultImage } from '../core/shareImage';
import { isXhsContainer, writeTempFile, saveImageToAlbum, postNote } from '../core/xhs';

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
  /** 本客户端视角是否获胜（决定结算音效） */
  myWin?: boolean;
}

export default function ResultScreen({
  state,
  onRestart,
  canRestart = true,
  onExit,
  totalScores,
  gamesPlayed,
  myWin = true,
}: Props) {
  const winners = state.winner ?? [];
  const hasTotal = !!totalScores && Object.keys(totalScores).length > 0;
  /** 分享/保存按钮：xhs 构建模式即显示（本地 http 试玩也能看到入口；无容器时点击给提示） */
  const xhs = __XHS__;
  const [shareState, setShareState] = useState<'idle' | 'saving' | 'done' | 'fail' | 'nocontainer'>('idle');
  const [failStep, setFailStep] = useState('');

  async function handleShare(toNote: boolean) {
    if (shareState === 'saving') return;
    // 本地 http 试玩时没有小红书容器 API：直接提示，不再尝试调用
    if (!isXhsContainer()) {
      setShareState('nocontainer');
      return;
    }
    setShareState('saving');
    setFailStep('');
    const dataUrl = drawResultImage(state);
    if (!dataUrl) {
      setFailStep('生成战绩图');
      setShareState('fail');
      return;
    }
    const filePath = await writeTempFile(dataUrl);
    if (!filePath) {
      setFailStep('写入临时文件');
      setShareState('fail');
      return;
    }
    let ok = false;
    if (toNote) {
      const winNames = winners.map((id) => state.players[id]?.name ?? '').join('、');
      ok = await postNote({
        title: '我在换牌王拿到了好成绩！',
        content: `🏆 ${winNames} 获胜！你也来试试这手牌吧～ #换牌王 #卡牌游戏`,
        images: [filePath],
      });
      if (!ok) setFailStep('唤起发布笔记');
    } else {
      ok = await saveImageToAlbum(filePath);
      if (!ok) setFailStep('保存到相册');
    }
    setShareState(ok ? 'done' : 'fail');
  }

  // 结算音效：获胜/落败（挂载时播一次）
  useEffect(() => {
    playSfx(myWin ? 'win' : 'lose');
  }, [myWin]);
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

        {xhs && (
          <div className="btn-row">
            <button
              className="btn btn-primary"
              disabled={shareState === 'saving'}
              onClick={() => void handleShare(true)}
            >
              📤 分享战绩到小红书
            </button>
            <button
              className="btn"
              disabled={shareState === 'saving'}
              onClick={() => void handleShare(false)}
            >
              🖼️ 保存战绩图
            </button>
          </div>
        )}
        {xhs && shareState === 'done' && <p className="hint">✅ 已完成</p>}
        {xhs && shareState === 'fail' && (
          <p className="hint hint-error">
            操作失败{failStep ? `（${failStep}）` : ''}，请重试
          </p>
        )}
        {xhs && shareState === 'nocontainer' && (
          <p className="hint">请在小红书小工具容器内打开，使用分享/保存功能</p>
        )}
      </div>
    </div>
  );
}
