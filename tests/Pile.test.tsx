// 弃牌堆 / 已使用功能牌组件：空状态紧凑占位 + 有牌渲染（牌面/最新黑框/功能标签）
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DiscardPile from '../src/components/DiscardPile';
import UsedPile from '../src/components/UsedPile';
import type { GameState, Card } from '../src/core/types';

function baseState(over: Partial<GameState>): GameState {
  return {
    deck: [],
    discardPile: [],
    usedPile: [],
    players: [],
    currentPlayer: 0,
    phase: 'playing',
    dealConfirmed: [],
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
    settleBonus: 0,
    allowSelfFollow: true,
    declareBonus: true,
    botMemory: 0.2,
    winner: null,
    log: [],
    ...over,
  };
}

const h10: Card = { id: 'h10', suit: 'hearts', rank: '10' };
const h7: Card = { id: 'h7', suit: 'hearts', rank: '7' };

describe('DiscardPile 弃牌堆', () => {
  it('空状态：显示"弃牌堆 0 张"与紧凑空占位（.pile-empty），不渲染卡牌', () => {
    const { container } = render(<DiscardPile state={baseState({})} />);
    expect(screen.getByText('弃牌堆 0 张')).toBeTruthy();
    expect(container.querySelector('.pile-empty')).toBeTruthy();
    expect(container.querySelector('.card')).toBeNull();
  });

  it('有弃牌：渲染卡牌，最新一张带黑框标记（.card-newest）与"可跟弃"标签', () => {
    const { container } = render(<DiscardPile state={baseState({ discardPile: [h10] })} />);
    expect(screen.getByText('弃牌堆 1 张')).toBeTruthy();
    expect(container.querySelector('.card-newest')).toBeTruthy();
    expect(screen.getByText('可跟弃')).toBeTruthy();
    expect(container.querySelector('.pile-empty')).toBeNull();
  });
});

describe('UsedPile 已使用功能牌', () => {
  it('空状态：显示"已使用功能牌 0 张"与紧凑空占位', () => {
    const { container } = render(<UsedPile state={baseState({})} />);
    expect(screen.getByText('已使用功能牌 0 张')).toBeTruthy();
    expect(container.querySelector('.pile-empty')).toBeTruthy();
  });

  it('有功能牌：渲染卡牌并带功能标签（7 = 看自己牌）', () => {
    const { container } = render(<UsedPile state={baseState({ usedPile: [h7] })} />);
    expect(screen.getByText('已使用功能牌 1 张')).toBeTruthy();
    expect(container.querySelector('.card')).toBeTruthy();
    expect(screen.getByText('看自己牌')).toBeTruthy();
  });
});
