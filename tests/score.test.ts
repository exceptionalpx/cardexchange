// 分数计算测试
import { describe, expect, it } from 'vitest';
import { handScore, scoreOf } from '../src/core/score';
import type { Card } from '../src/core/types';

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

describe('scoreOf', () => {
  it('大小王为 0 分', () => {
    expect(scoreOf(card('JOKER_SMALL', 'joker'))).toBe(0);
    expect(scoreOf(card('JOKER_BIG', 'joker'))).toBe(0);
  });

  it('红桃 K 为 -1 分', () => {
    expect(scoreOf(card('K', 'hearts'))).toBe(-1);
  });

  it('其他花色 K 为 13 分', () => {
    expect(scoreOf(card('K', 'spades'))).toBe(13);
  });

  it('A~10 为 1~10 分，J/Q 为 11/12 分', () => {
    expect(scoreOf(card('A'))).toBe(1);
    expect(scoreOf(card('5'))).toBe(5);
    expect(scoreOf(card('10'))).toBe(10);
    expect(scoreOf(card('J'))).toBe(11);
    expect(scoreOf(card('Q'))).toBe(12);
  });
});

describe('handScore', () => {
  it('求和手牌分数，忽略空槽', () => {
    const hand: (Card | null)[] = [
      card('JOKER_SMALL', 'joker'), // 0
      card('K', 'hearts'), // -1
      card('A'), // 1
      card('K'), // 13
      null,
    ];
    expect(handScore(hand)).toBe(13);
  });
});
