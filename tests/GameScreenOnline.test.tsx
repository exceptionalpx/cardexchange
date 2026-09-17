import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameScreen from '../src/components/GameScreen';
import type { ClientGameView } from '../server/protocol';
import type { Card } from '../src/core/types';

/**
 * 回归测试：联机视图的 follow 脱敏后不含 submitted（协议里只有
 * discarder/targetScore/canFollow）。音效 effect 若直接读
 * state.follow?.submitted.length 会抛 "Cannot read properties of
 * undefined (reading 'length')" 导致整页白屏（真实线上故障）。
 */
const c5: Card = { id: 'h5', suit: 'hearts', rank: '5' };
const c9: Card = { id: 's9', suit: 'spades', rank: '9' };

function buildFollowView(): ClientGameView {
  return {
    viewerId: 0,
    deckCount: 40,
    discardPile: [c5],
    usedPile: [],
    players: [
      { id: 0, name: '玩家1', isBot: false, handSlots: [c5, c9, null, null], knowledge: {} },
      { id: 1, name: '玩家2', isBot: false, handSlots: [c9, c5, null, null], knowledge: {} },
    ],
    currentPlayer: 0,
    phase: 'follow',
    dealConfirmed: [true, true],
    declaredPlayer: null,
    pending: null,
    lastSwap: null,
    lastMove: null,
    lastViewed: null,
    lastPenalty: null,
    lastDiscard: c5,
    // 联机脱敏后的跟弃窗口：不含 submitted（线上协议的真实结构）
    follow: { discarder: 0, targetScore: 5, canFollow: true },
    finalRemaining: 0,
    winner: null,
    log: [],
    view: {
      viewerId: 0,
      players: [
        { id: 0, name: '玩家1', isBot: false, slots: [{ card: c5, known: true }, { card: c9, known: true }, { card: null, known: true }, { card: null, known: true }] },
        { id: 1, name: '玩家2', isBot: false, slots: [{ card: null, known: true }, { card: null, known: true }, { card: null, known: true }, { card: null, known: true }] },
      ],
    },
    totalScores: {},
    gamesPlayed: 1,
    followWindowMs: 3000,
    aiControlled: [],
    declareBonus: true,
    settleBonus: 0,
  };
}

describe('GameScreen 联机视图健壮性', () => {
  it('跟弃窗口（follow 无 submitted 字段）渲染不崩溃，页面正常显示', () => {
    const view = buildFollowView();
    render(
      <GameScreen
        online={{
          view,
          myId: 0,
          send: () => {},
          onRestart: () => {},
          canRestart: false,
          onExit: () => {},
          onExitGame: () => {},
        }}
        onExit={() => {}}
      />,
    );
    // 跟弃窗口 UI 正常渲染（修复前此处音效 effect 抛错导致整树卸载）
    expect(screen.getAllByText(/可跟弃/).length).toBeGreaterThan(0);
    expect(screen.getByText(/玩家2/)).toBeInTheDocument();
  });

  it('非跟弃阶段（follow 为 null）同样正常', () => {
    const view = buildFollowView();
    view.phase = 'playing';
    view.follow = null;
    view.pending = { kind: 'drawn', card: c9 };
    render(
      <GameScreen
        online={{
          view,
          myId: 0,
          send: () => {},
          onRestart: () => {},
          canRestart: false,
          onExit: () => {},
          onExitGame: () => {},
        }}
        onExit={() => {}}
      />,
    );
    expect(screen.getByText(/对局中/)).toBeInTheDocument();
  });
});
