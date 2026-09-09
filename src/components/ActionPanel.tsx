import type { Action, Card, GameState } from '../core/types';
import { canApply } from '../core/engine';
import { scoreOf } from '../core/score';
import { cardLabel } from './CardView';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
  replaceMode: boolean;
  setReplaceMode: (v: boolean) => void;
  kDeciding: boolean;
  setKDeciding: (v: boolean) => void;
}

export default function ActionPanel({
  state,
  dispatch,
  replaceMode,
  setReplaceMode,
  kDeciding,
  setKDeciding,
}: Props) {
  const current = state.players[state.currentPlayer];
  const pend = state.pending;

  // ---- 发牌确认 ----
  if (state.phase === 'deal') {
    if (current.isBot) return <div className="action-panel hint">机器人 {current.name} 正在看牌…</div>;
    return (
      <div className="action-panel">
        <p className="hint">轮到 {current.name}：请记住你的 4 张牌，确认后盖牌传给下一位玩家。</p>
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'CONFIRM_DEAL' })}>
          我记住了，盖牌
        </button>
      </div>
    );
  }

  // ---- 跟弃窗口：不主动提示，玩家通过日志与手牌下方"弃"按钮自行判断 ----
  if (state.phase === 'follow' && state.follow) {
    return <div className="action-panel" />;
  }

  // ---- 翻看限时（7/8、9/10） ----
  if (pend?.kind === 'revealDone') {
    if (current.isBot) return <div className="action-panel hint">机器人 {current.name} 正在记忆…</div>;
    return (
      <div className="action-panel">
        <p className="hint">
          记住这张牌：<b>{cardLabel(pend.card)}</b>（{scoreText(pend.card)}），5 秒后自动收起
        </p>
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'REVEAL_DONE' })}>
          记住了，收起
        </button>
      </div>
    );
  }

  // ---- K 明换确认 ----
  if (pend?.kind === 'confirmReveal') {
    if (current.isBot) return <div className="action-panel hint">机器人 {current.name} 正在考虑…</div>;
    const desc = (
      <p className="hint">
        K 明换：你的牌 <b>{cardLabel(pend.selfCard)}</b>（{scoreText(pend.selfCard)}） vs 对方{' '}
        <b>{cardLabel(pend.otherCard)}</b>（{scoreText(pend.otherCard)}）
      </p>
    );
    if (!kDeciding) {
      return (
        <div className="action-panel">
          {desc}
          <button className="btn btn-primary" onClick={() => setKDeciding(true)}>
            进入决定
          </button>
        </div>
      );
    }
    return (
      <div className="action-panel">
        {desc}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'SWAP' })}>
            交换
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'KEEP' })}>
            不换
          </button>
        </div>
      </div>
    );
  }

  // ---- 槽位选择 ----
  if (pend?.kind === 'chooseSelfSlot' || pend?.kind === 'chooseOtherSlot') {
    if (current.isBot) return <div className="action-panel hint">机器人 {current.name} 正在选择…</div>;
    const targetName = pend.kind === 'chooseOtherSlot' ? '其他玩家的' : '自己的';
    const abilityName: Record<string, string> = {
      '7': '查看自己一张牌',
      '8': '查看自己一张牌',
      '9': '查看其他玩家一张牌',
      '10': '查看其他玩家一张牌',
      J: '暗换一张牌',
      Q: '暗换一张牌',
      K: '明换（选牌）',
    };
    return (
      <div className="action-panel">
        <p className="hint">
          {current.name}：请点击{targetName}一张牌（{abilityName[pend.ability] ?? pend.ability}）
        </p>
      </div>
    );
  }

  // ---- 摸到的牌待处理 ----
  if (pend?.kind === 'drawn') {
    if (current.isBot) return <div className="action-panel hint">机器人 {current.name} 正在考虑…</div>;
    const canAbility = canApply(state, { type: 'USE_ABILITY' });
    return (
      <div className="action-panel">
        <p className="hint">
          {current.name} 摸到了 <b>{cardLabel(pend.card)}</b>（{scoreText(pend.card)}），请选择处理方式：
        </p>
        <div className="btn-row">
          {canAbility && (
            <button className="btn btn-primary" onClick={() => dispatch({ type: 'USE_ABILITY' })}>
              发动功能
            </button>
          )}
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'DISCARD_DRAWN' })}>
            直接弃牌
          </button>
          <button
            className={replaceMode ? 'btn btn-active' : 'btn'}
            onClick={() => setReplaceMode(!replaceMode)}
          >
            替换手牌
          </button>
        </div>
        {replaceMode && <p className="hint">请点击你手牌中要替换的牌</p>}
      </div>
    );
  }

  // ---- 回合开始 ----
  if (state.phase === 'playing' || state.phase === 'final') {
    if (current.isBot) return <div className="action-panel hint">机器人 {current.name} 正在思考…</div>;
    return (
      <div className="action-panel">
        <p className="hint">轮到 {current.name}</p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'DRAW' })}>
            摸牌
          </button>
          {state.phase === 'playing' && state.declaredPlayer === null && (
            <button className="btn" onClick={() => dispatch({ type: 'DECLARE' })}>
              宣布定牌
            </button>
          )}
        </div>
      </div>
    );
  }

  return <div className="action-panel" />;
}

function scoreText(card: Card): string {
  const score = scoreOf(card);
  return score > 0 ? `+${score}分` : `${score}分`;
}
