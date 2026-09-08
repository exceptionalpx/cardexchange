// 分数计算
import type { Card } from './types';

/** 单张牌分数：大小王 0，红桃 K -1，A~K = 1~13 */
export function scoreOf(card: Card): number {
  if (card.rank === 'JOKER_SMALL' || card.rank === 'JOKER_BIG') return 0;
  if (card.suit === 'hearts' && card.rank === 'K') return -1;
  const map: Record<string, number> = {
    A: 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    J: 11,
    Q: 12,
    K: 13,
  };
  return map[card.rank];
}

/** 手牌总分 */
export function handScore(cards: (Card | null)[]): number {
  return cards.reduce((sum, c) => (c ? sum + scoreOf(c) : sum), 0);
}
