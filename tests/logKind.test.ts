import { describe, it, expect } from 'vitest';
import { applyAction, createGame } from '../src/core/engine';
import type { Card, GameState } from '../src/core/types';

function card(rank: Card['rank'], suit: Card['suit'] = 'spades'): Card {
  const prefix: Record<string, string> = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' };
  return { id: `${prefix[suit]}${rank}`, suit, rank };
}

/** 固定牌局：P0 手牌 [5,2,3,4]，P1 手牌 [9,2,3,4]（跟弃失败用不同分 9） */
function fixedGame(): GameState {
  const hands = [
    [card('5'), card('2'), card('3'), card('4')],
    [card('9'), card('2'), card('3'), card('4')],
  ];
  const players = hands.map((hand, i) => {
    const slots = Array.from({ length: 4 }, (_, j) => hand[j] ?? null);
    return { id: i, name: `P${i}`, isBot: true, handSlots: slots, knowledge: {} };
  });
  return {
    deck: [],
    discardPile: [],
    usedPile: [],
    players,
    currentPlayer: 0,
    phase: 'playing',
    dealConfirmed: players.map((p) => p.isBot),
    declaredPlayer: null,
    lastDiscard: null,
    follow: null,
    pending: { kind: 'drawn', card: card('5') },
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
  } as GameState;
}

/** 完成 2 真人发牌，返回进行中的局 */
function dealt(): GameState {
  let s = createGame({ playerCount: 2, botCount: 0, playerNames: ['甲', '乙'] });
  s = applyAction(s, { type: 'CONFIRM_DEAL', playerId: 0 });
  s = applyAction(s, { type: 'CONFIRM_DEAL', playerId: 1 });
  return s;
}

describe('日志条目按操作类型标记 kind（记录面板着色用）', () => {
  it('摸牌日志 kind=draw', () => {
    const s = dealt();
    const g = applyAction(s, { type: 'DRAW' });
    expect(g.log[g.log.length - 1].kind).toBe('draw');
  });

  it('弃牌日志 kind=discard', () => {
    const s = dealt();
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'DISCARD_DRAWN' });
    expect(g.log[g.log.length - 1].kind).toBe('discard');
  });

  it('宣布定牌日志 kind=declare', () => {
    const s = dealt();
    const g = applyAction(s, { type: 'DECLARE' });
    expect(g.log[g.log.length - 1].kind).toBe('declare');
  });

  it('跟弃失败（不同分牌）日志 kind=follow_fail', () => {
    const s = fixedGame();
    // 弃掉摸到的 5 分牌 → 跟弃窗口（targetScore=5）
    let g = applyAction(s, { type: 'DISCARD_DRAWN' });
    expect(g.phase).toBe('follow');
    // P1 用 9 分牌跟弃 → 不同分 → 失败罚牌
    g = applyAction(g, { type: 'TRY_FOLLOW', playerId: 1, slot: 0 });
    expect(g.log[g.log.length - 1].kind).toBe('follow_fail');
  });

  it('放弃跟弃日志 kind=pass', () => {
    const s = dealt();
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'DISCARD_DRAWN' });
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 0 });
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 1 });
    expect(g.log[g.log.length - 1].kind).toBe('pass');
  });
});
