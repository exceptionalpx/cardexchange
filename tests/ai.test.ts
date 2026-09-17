// AI 决策合法性测试
import { describe, expect, it } from 'vitest';
import { aiDecide } from '../src/core/ai';
import { applyAction, canApply, createGame } from '../src/core/engine';
import { handScore } from '../src/core/score';
import type { Card, GameState } from '../src/core/types';

function card(rank: Card['rank'], suit: Card['suit'] = 'spades'): Card {
  const prefix: Record<string, string> = {
    spades: 's',
    hearts: 'h',
    diamonds: 'd',
    clubs: 'c',
    joker: '',
  };
  const id =
    rank === 'JOKER_SMALL' || rank === 'JOKER_BIG' ? rank : `${prefix[suit]}${rank}`;
  return { id, suit, rank };
}

function makeState(hands: Card[][]): GameState {
  const players = hands.map((hand, i) => ({
    id: i,
    name: `P${i}`,
    isBot: true,
    handSlots: hand.map((c) => c as Card | null),
    knowledge: Object.fromEntries(hand.map((c) => [c.id, c])), // 假设看过自己的牌
  }));
  return {
    deck: [card('A'), card('5'), card('A'), card('5'), card('A')],
    discardPile: [],
    usedPile: [],
    players,
    currentPlayer: 0,
    phase: 'playing' as const,
    dealConfirmed: players.map(() => true),
    declaredPlayer: null,
    lastDiscard: null,
    follow: null,
    pending: null,
    lastSwap: null,
    lastMove: null,
    lastViewed: null,
    lastPenalty: null,
    animSeq: 0,
    finalRemaining: 0,
    winner: null,
    declaredDeckCount: undefined,
    settleBonus: 0,
    allowSelfFollow: true,
    declareBonus: false,
    botMemory: 0,
    log: [],
  };
}

describe('aiDecide', () => {
  it('deal 阶段自动确认盖牌', () => {
    const s = createGame({ playerCount: 2, botCount: 1 });
    expect(aiDecide(s, 0)).toEqual({ type: 'CONFIRM_DEAL' });
  });

  it('手牌均分很低时宣布定牌', () => {
    // 4 张 A + 王：均分 <= 2
    const s = makeState([
      [card('A'), card('A'), card('JOKER_SMALL', 'joker'), card('A')],
      [card('K'), card('Q'), card('J'), card('10')],
    ]);
    const action = aiDecide(s, 0);
    expect(action.type).toBe('DECLARE');
    expect(canApply(s, action)).toBe(true);
  });

  it('手牌均分较高时摸牌', () => {
    const s = makeState([
      [card('K'), card('Q'), card('J'), card('10')],
      [card('A'), card('A'), card('A'), card('A')],
    ]);
    const action = aiDecide(s, 0);
    expect(action.type).toBe('DRAW');
  });

  it('摸到普通牌时替换更高分手牌', () => {
    const s = makeState([
      [card('K'), card('A'), card('2'), card('3')],
      [card('5'), card('6'), card('7'), card('8')],
    ]);
    s.deck = [card('A')]; // 摸到 A(1)，手牌 K(13) 更高 → 替换
    const afterDraw = applyAction(s, { type: 'DRAW' });
    expect(afterDraw.pending?.kind).toBe('drawn');
    const action = aiDecide(afterDraw, 0);
    expect(action.type).toBe('REPLACE');
    expect(canApply(afterDraw, action)).toBe(true);
  });

  it('摸到普通牌时手牌无更高分则弃牌', () => {
    const s = makeState([
      [card('A'), card('2'), card('3'), card('4')],
      [card('5'), card('6'), card('7'), card('8')],
    ]);
    s.deck = [card('5')]; // 摸到 5(5)，手牌最高 4 → 弃掉
    const afterDraw = applyAction(s, { type: 'DRAW' });
    const action = aiDecide(afterDraw, 0);
    expect(action.type).toBe('DISCARD_DRAWN');
  });

  it('AI 决策全部通过合法性校验（覆盖各阶段）', () => {
    let s = createGame({ playerCount: 3, botCount: 2 });
    let guard = 0;
    while (s.phase !== 'end' && guard < 500) {
      guard++;
      const actor =
        s.phase === 'deal'
          ? s.currentPlayer
          : s.phase === 'follow' && s.follow
            ? Number(Object.entries(s.follow.decisions).find(([, d]) => d === 'pending')?.[0] ?? s.currentPlayer)
            : s.currentPlayer;
      const action = aiDecide(s, actor);
      expect(canApply(s, action), `阶段 ${s.phase} 动作 ${JSON.stringify(action)}`).toBe(true);
      s = applyAction(s, action);
    }
    expect(s.phase).toBe('end');
    expect(s.winner).toBeTruthy();
    expect(s.winner!.length).toBeGreaterThan(0);
    for (const p of s.players) {
      expect(typeof p.score).toBe('number');
      expect(p.score!).toBe(handScore(p.handSlots));
    }
  });
});

  it('记忆误差（新手 0.4）下 AI 决策全程合法并正常终局', () => {
    let s = createGame({ playerCount: 3, botCount: 2, botMemory: 0.4 });
    let guard = 0;
    let seed = 0.123;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    while (s.phase !== 'end' && guard < 500) {
      guard++;
      const actor =
        s.phase === 'deal'
          ? s.currentPlayer
          : s.phase === 'follow' && s.follow
            ? Number(Object.entries(s.follow.decisions).find(([, d]) => d === 'pending')?.[0] ?? s.currentPlayer)
            : s.currentPlayer;
      const action = aiDecide(s, actor, rng);
      expect(canApply(s, action), `阶段 ${s.phase} 动作 ${JSON.stringify(action)}`).toBe(true);
      s = applyAction(s, action);
    }
    expect(s.phase).toBe('end');
    expect(s.winner!.length).toBeGreaterThan(0);
  });

  it('记忆误差（新手 0.4）会让 AI 忘记看过的牌（出现保守决策）', () => {
    // 手牌全 A（均分 1，完美记忆下必然定牌）；botMemory=1 时必然遗忘 → 摸牌
    const s = makeState([
      [card('A'), card('A'), card('A'), card('A')],
      [card('K'), card('Q'), card('J'), card('10')],
    ]);
    s.botMemory = 1; // 极端：每次决策 100% 遗忘
    const action = aiDecide(s, 0, () => 0.1);
    expect(action.type).toBe('DRAW'); // 因遗忘而不敢定牌
  });

  it('高手（0 记忆误差）决策与完美记忆一致', () => {
    const s = makeState([
      [card('A'), card('A'), card('A'), card('A')],
      [card('K'), card('Q'), card('J'), card('10')],
    ]);
    s.botMemory = 0;
    const action = aiDecide(s, 0, () => 0.9);
    expect(action.type).toBe('DECLARE');
  });