// 信息隐藏测试：buildView 视角
import { describe, expect, it } from 'vitest';
import { buildView } from '../src/core/view';
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

function makeState(hands: Card[][], viewerKnowledge: Card[], otherKnowledge: Card[]): GameState {
  const players = hands.map((hand, i) => ({
    id: i,
    name: `P${i}`,
    isBot: true,
    handSlots: hand.map((c) => c as Card | null),
    knowledge:
      i === 0
        ? Object.fromEntries(viewerKnowledge.map((c) => [c.id, c]))
        : Object.fromEntries(otherKnowledge.map((c) => [c.id, c])),
  }));
  return {
    deck: [],
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
    log: [],
  };
}

describe('buildView', () => {
  it('发牌确认后：viewer 看到自己 4 张牌，其他玩家全部背面', () => {
    const hands = [
      [card('A'), card('2'), card('3'), card('4')],
      [card('K'), card('Q'), card('J'), card('10')],
    ];
    const s = makeState(hands, hands[0], []);
    const v = buildView(s, 0);
    expect(v.players[0].slots.map((x) => x.known)).toEqual([true, true, true, true]);
    expect(v.players[1].slots.map((x) => x.known)).toEqual([false, false, false, false]);
    // 其他玩家视角看不到 viewer 的牌
    const v1 = buildView(s, 1);
    expect(v1.players[0].slots.map((x) => x.known)).toEqual([false, false, false, false]);
  });

  it('9/10 查看后：viewer 能看到对方指定槽位的牌', () => {
    const s = makeState(
      [
        [card('A'), card('2'), card('3'), card('4')],
        [card('K'), card('Q'), card('J'), card('10')],
      ],
      [card('Q')], // viewer 看过 P1 的 Q
      [],
    );
    const v = buildView(s, 0);
    expect(v.players[1].slots[1].known).toBe(true);
    expect(v.players[1].slots[1].card).toEqual(card('Q'));
    expect(v.players[1].slots[0].known).toBe(false);
    // 被看玩家 P1 的视角不受影响
    const v1 = buildView(s, 1);
    expect(v1.players[1].slots[1].known).toBe(false);
  });

  it('暗换后：换入的牌对双方均为未知', () => {
    // P0 曾看过自己的 K（knowledge 残留），但暗换后槽 0 已是对方的 5（未看过）
    const s = makeState(
      [
        [card('5'), card('A'), card('2'), card('3')],
        [card('K'), card('6'), card('7'), card('8')],
      ],
      [card('K')],
      [],
    );
    const v = buildView(s, 0);
    // 槽 0 现在是 5，但 P0 未看过 → known=false
    expect(v.players[0].slots[0].known).toBe(false);
    expect(v.players[0].slots[0].card).toEqual(card('5'));
  });

  it('空槽显示为已知空', () => {
    const s = makeState(
      [
        [card('A'), card('2'), card('3'), card('4')],
        [card('5'), card('6'), card('7'), card('8')],
      ],
      [],
      [],
    );
    // 人为置空 P0 槽 0
    s.players[0].handSlots[0] = null;
    const v = buildView(s, 0);
    expect(v.players[0].slots[0]).toEqual({ card: null, known: true });
  });

  it('头像随视角透传', () => {
    const s = makeState(
      [
        [card('A'), card('2'), card('3'), card('4')],
        [card('5'), card('6'), card('7'), card('8')],
      ],
      [],
      [],
    );
    s.players[0].avatar = '🐱';
    const v = buildView(s, 0);
    expect(v.players[0].avatar).toBe('🐱');
    expect(v.players[1].avatar).toBeUndefined();
  });
});
