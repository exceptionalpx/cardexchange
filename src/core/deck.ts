// 牌堆：洗牌、发牌
import type { Card, Rank, Suit } from './types';

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
];

const SUIT_PREFIX: Record<Suit, string> = {
  spades: 's',
  hearts: 'h',
  diamonds: 'd',
  clubs: 'c',
};

/** 构建一副 54 张牌 */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${SUIT_PREFIX[suit]}${rank}`, suit, rank });
    }
  }
  cards.push({ id: 'JOKER_SMALL', suit: 'joker', rank: 'JOKER_SMALL' });
  cards.push({ id: 'JOKER_BIG', suit: 'joker', rank: 'JOKER_BIG' });
  return cards;
}

/** Fisher-Yates 洗牌（就地修改并返回） */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 从牌堆顶部摸一张，返回 [牌, 剩余牌堆] */
export function drawCard(deck: Card[]): [Card | null, Card[]] {
  if (deck.length === 0) return [null, deck];
  const [card, ...rest] = deck;
  return [card, rest];
}
