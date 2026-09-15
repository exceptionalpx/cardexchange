// 每玩家视角脱敏：服务器权威的信息隐藏层
// 只把该玩家该看的内容下发到客户端，对手手牌、牌堆内容、他人 knowledge 一律不下发。
import type { Card, GameState, PendingAction } from '../src/core/types';
import { buildView } from '../src/core/view';
import type { ClientGameView } from './protocol';

/**
 * 对挂起交互做牌面脱敏：
 * - drawn：摸到的牌只有当前行动玩家可见
 * - revealDone：翻看结果只有查看者（真人）可见
 * - confirmReveal：K 明换双方牌只有发动者（真人）可见
 */
export function sanitizePending(
  pending: PendingAction | null,
  viewerId: number,
  currentPlayer: number,
): PendingAction | null {
  if (!pending) return null;
  switch (pending.kind) {
    case 'drawn':
      return currentPlayer === viewerId ? pending : { ...pending, card: undefined as unknown as Card };
    case 'revealDone':
      return pending.viewer === viewerId ? pending : { ...pending, card: undefined as unknown as Card };
    case 'confirmReveal':
      return currentPlayer === viewerId
        ? pending
        : {
            ...pending,
            selfCard: undefined as unknown as Card,
            otherCard: undefined as unknown as Card,
          };
    default:
      return pending;
  }
}

/** 为指定玩家构造下发的对局视图 */
export function buildClientView(state: GameState, viewerId: number): ClientGameView {
  return {
    viewerId,
    deckCount: state.deck.length,
    discardPile: state.discardPile,
    usedPile: state.usedPile,
    players: state.players.map((p) => ({ ...p, knowledge: {} })),
    currentPlayer: state.currentPlayer,
    phase: state.phase,
    declaredPlayer: state.declaredPlayer,
    pending: sanitizePending(state.pending, viewerId, state.currentPlayer),
    lastSwap: state.lastSwap,
    lastMove: state.lastMove,
    lastViewed: state.lastViewed,
    finalRemaining: state.finalRemaining,
    winner: state.winner,
    log: state.log,
    view: buildView(state, viewerId),
  };
}
