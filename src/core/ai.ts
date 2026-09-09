// 机器人 AI：MVP 基础策略
// 所有决策通过 canApply 校验，非法时回退到保守动作。
import type { Action, Card, GameState, PendingAction } from './types';
import { canApply } from './engine';
import { scoreOf } from './score';
import { buildView } from './view';

const HIGH_SCORE = 7; // 视为"高分"的阈值（AI 愿意用功能牌换走）

export function aiDecide(state: GameState, playerId: number): Action {
  // 发牌阶段：自动确认盖牌
  if (state.phase === 'deal') return { type: 'CONFIRM_DEAL' };

  // 跟弃窗口：有待决策且有同分牌则尝试跟弃（选第一个同分槽位），否则放弃
  if (state.phase === 'follow' && state.follow) {
    const follow = state.follow;
    if (follow.decisions[playerId] === 'pending') {
      const me = state.players[playerId];
      const idx = me.handSlots.findIndex((c) => c !== null && scoreOf(c) === follow.targetScore);
      if (idx >= 0) {
        const tr: Action = { type: 'TRY_FOLLOW', playerId, slot: idx };
        if (canApply(state, tr)) return tr;
      }
    }
    return { type: 'PASS_FOLLOW', playerId };
  }

  // 挂起交互
  const pend = state.pending;
  if (pend) return decidePending(state, playerId, pend);

  // 回合开始：手牌均分低则定牌，否则摸牌
  if (state.phase === 'playing') {
    const view = buildView(state, playerId);
    const known = view.players[playerId].slots.filter((s) => s.known && s.card);
    if (known.length > 0) {
      const avg = known.reduce((sum, s) => sum + scoreOf(s.card!), 0) / known.length;
      if (avg <= 2) {
        const dec: Action = { type: 'DECLARE' };
        if (canApply(state, dec)) return dec;
      }
    }
  }
  return { type: 'DRAW' };
}

function decidePending(state: GameState, playerId: number, pend: PendingAction): Action {
  switch (pend.kind) {
    case 'drawn':
      return decideDrawn(state, playerId, pend.card);
    case 'chooseSelfSlot': {
      const view = buildView(state, playerId);
      const me = view.players[playerId];
      if (pend.purpose === 'view') {
        // 查看自己：优先未知槽位
        const unknownIdx = me.slots.findIndex((s) => s.card && !s.known);
        const idx = unknownIdx >= 0 ? unknownIdx : me.slots.findIndex((s) => s.card);
        return safe({ type: 'PICK_SELF_SLOT', slot: idx }, state, fallbackSelf(state, playerId));
      }
      // 换牌：选自己已知最高分槽位
      let bestIdx = -1;
      let bestScore = -Infinity;
      me.slots.forEach((s, i) => {
        if (s.card && s.known && scoreOf(s.card) > bestScore) {
          bestScore = scoreOf(s.card);
          bestIdx = i;
        }
      });
      const idx = bestIdx >= 0 ? bestIdx : me.slots.findIndex((s) => s.card);
      return safe({ type: 'PICK_SELF_SLOT', slot: idx }, state, fallbackSelf(state, playerId));
    }
    case 'chooseOtherSlot': {
      const view = buildView(state, playerId);
      const others = view.players.filter(
        (p) => p.id !== playerId && (pend.purpose === 'swap' ? p.id !== state.declaredPlayer : true),
      );
      for (const op of others) {
        for (let i = 0; i < op.slots.length; i++) {
          const s = op.slots[i];
          if (!s.card) continue;
          if (pend.purpose === 'view' && !s.known) {
            return safe({ type: 'PICK_OTHER', playerId: op.id, slot: i }, state, fallbackOther(state, playerId));
          }
          if (pend.purpose === 'swap') {
            return safe({ type: 'PICK_OTHER', playerId: op.id, slot: i }, state, fallbackOther(state, playerId));
          }
        }
      }
      return fallbackOther(state, playerId);
    }
    case 'confirmReveal':
      // 对方牌分数更低才换
      return scoreOf(pend.otherCard) < scoreOf(pend.selfCard) ? { type: 'SWAP' } : { type: 'KEEP' };
    case 'revealDone':
      // 机器人无记忆限制，翻看后立即确认收起
      return { type: 'REVEAL_DONE' };
    default:
      return fallback(state, playerId);
  }
}

function decideDrawn(state: GameState, playerId: number, card: Card): Action {
  const rank = card.rank;
  const isAbility = rank === '7' || rank === '8' || rank === '9' || rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K';

  if (isAbility) {
    if (rank === '7' || rank === '8') {
      if (hasUnknownSelfSlot(state, playerId)) return useAbility(state, playerId);
      return discardDrawn(state, playerId);
    }
    if (rank === '9' || rank === '10') {
      if (hasUnknownOtherSlot(state, playerId)) return useAbility(state, playerId);
      return discardDrawn(state, playerId);
    }
    // J/Q/K：自己有高分已知牌且对方有未知槽位才用
    if (hasHighKnownSelf(state, playerId) && hasUnknownOtherSlot(state, playerId)) {
      return useAbility(state, playerId);
    }
    return discardDrawn(state, playerId);
  }

  // 普通牌：手牌有更高分牌则替换最高分，否则弃掉
  const me = state.players[playerId];
  let bestIdx = -1;
  let bestScore = -Infinity;
  me.handSlots.forEach((c, i) => {
    if (c && scoreOf(c) > bestScore) {
      bestScore = scoreOf(c);
      bestIdx = i;
    }
  });
  if (bestIdx >= 0 && bestScore > scoreOf(card)) {
    const rep: Action = { type: 'REPLACE', slot: bestIdx };
    if (canApply(state, rep)) return rep;
  }
  return discardDrawn(state, playerId);
}

// ---- 辅助 ----

function useAbility(state: GameState, playerId: number): Action {
  const a: Action = { type: 'USE_ABILITY' };
  return canApply(state, a) ? a : discardDrawn(state, playerId);
}

function discardDrawn(state: GameState, playerId: number): Action {
  const a: Action = { type: 'DISCARD_DRAWN' };
  return canApply(state, a) ? a : fallback(state, playerId);
}

function hasUnknownSelfSlot(state: GameState, playerId: number): boolean {
  const view = buildView(state, playerId);
  return view.players[playerId].slots.some((s) => s.card && !s.known);
}

function hasUnknownOtherSlot(state: GameState, playerId: number): boolean {
  const view = buildView(state, playerId);
  return view.players.some((p) => p.id !== playerId && p.slots.some((s) => s.card && !s.known));
}

function hasHighKnownSelf(state: GameState, playerId: number): boolean {
  const view = buildView(state, playerId);
  return view.players[playerId].slots.some((s) => s.card && s.known && scoreOf(s.card) >= HIGH_SCORE);
}

function safe(action: Action, state: GameState, fallbackAction: Action): Action {
  return canApply(state, action) ? action : fallbackAction;
}

function fallbackSelf(state: GameState, playerId: number): Action {
  const me = state.players[playerId];
  const idx = me.handSlots.findIndex((c) => c !== null);
  return { type: 'PICK_SELF_SLOT', slot: Math.max(0, idx) };
}

function fallbackOther(state: GameState, playerId: number): Action {
  for (const p of state.players) {
    if (p.id === playerId) continue;
    if (p.id === state.declaredPlayer) continue; // 不能对定牌玩家换牌
    const idx = p.handSlots.findIndex((c) => c !== null);
    if (idx >= 0) return { type: 'PICK_OTHER', playerId: p.id, slot: idx };
  }
  return fallback(state, playerId);
}

function fallback(state: GameState, playerId: number): Action {
  if (state.phase === 'follow') return { type: 'PASS_FOLLOW', playerId };
  if (state.pending?.kind === 'drawn') return { type: 'DISCARD_DRAWN' };
  return { type: 'DRAW' };
}
