import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GameScreen, { computeFaceUpIds } from '../src/components/GameScreen';
import type { PlayerState } from '../src/core/types';

function botPlayer(id: number): PlayerState {
  return { id, name: `机器人${id + 1}`, isBot: true, handSlots: [], knowledge: {} };
}
function humanPlayer(id: number): PlayerState {
  return { ...botPlayer(id), isBot: false, name: `玩家${id + 1}` };
}

describe('computeFaceUpIds 翻看信息隐藏', () => {
  const cardA = { id: 'hA', suit: 'hearts' as const, rank: 'A' as const };
  const cardK = { id: 'sK', suit: 'spades' as const, rank: 'K' as const };

  it('真人发动 9/10 翻看：被查看的牌强制正面', () => {
    const players = [humanPlayer(0), botPlayer(1)];
    const ids = computeFaceUpIds(
      { kind: 'revealDone', card: cardA, viewer: 0 },
      players,
      0,
    );
    expect(ids.has('hA')).toBe(true);
  });

  it('机器人发动 9/10 翻看：被查看的牌不亮出（玩家看不到）', () => {
    const players = [humanPlayer(0), botPlayer(1)];
    const ids = computeFaceUpIds(
      { kind: 'revealDone', card: cardA, viewer: 1 },
      players,
      1,
    );
    expect(ids.has('hA')).toBe(false);
  });

  it('真人 K 明换：双方两张牌强制正面', () => {
    const players = [humanPlayer(0), botPlayer(1)];
    const ids = computeFaceUpIds(
      {
        kind: 'confirmReveal',
        selfSlot: 0,
        selfCard: cardK,
        otherPlayer: 1,
        otherSlot: 0,
        otherCard: cardA,
      },
      players,
      0,
    );
    expect(ids.has('sK')).toBe(true);
    expect(ids.has('hA')).toBe(true);
  });

  it('机器人 K 明换：双方牌都不亮出', () => {
    const players = [humanPlayer(0), botPlayer(1)];
    const ids = computeFaceUpIds(
      {
        kind: 'confirmReveal',
        selfSlot: 0,
        selfCard: cardK,
        otherPlayer: 0,
        otherSlot: 0,
        otherCard: cardA,
      },
      players,
      1,
    );
    expect(ids.has('sK')).toBe(false);
    expect(ids.has('hA')).toBe(false);
  });

  it('非翻看/明换 pending：不强制任何牌', () => {
    const players = [humanPlayer(0), botPlayer(1)];
    const ids = computeFaceUpIds({ kind: 'drawn', card: cardA }, players, 0);
    expect(ids.size).toBe(0);
  });
});

// 信息隐藏回归测试：发牌阶段机器人看牌时绝不亮牌（玩家不得通过热座视角偷看机器人手牌）
function renderGame() {
  return render(
    <GameScreen config={{ playerCount: 2, botCount: 1 }} onExit={() => {}} />,
  );
}

/** 已亮牌面文字（如 ♥5），即信息泄露信号；无牌面时返回空数组（不抛错） */
function faceLabels(): string[] {
  return screen
    .queryAllByText(/^[♠♥♦♣]|^(大王|小王)/)
    .map((el) => el.textContent || '');
}

/** 背面牌数量（"?"） */
function backCount(): number {
  return screen.queryAllByText('?').length;
}

describe('GameScreen 发牌阶段信息隐藏', () => {
  it('发牌阶段：真人当前玩家亮自己的 4 张，机器人看牌时全程背面', async () => {
    renderGame();

    // 初始 deal：玩家1（真人）看牌，亮 4 张；机器人2 背面 4 张
    await waitFor(() => expect(faceLabels().length).toBe(4), { timeout: 2000 });
    expect(backCount()).toBe(4);

    // 玩家1 盖牌 → currentPlayer 切到机器人2（发牌看牌阶段，600ms 后自动确认）
    fireEvent.click(screen.getByText('我记住了，盖牌'));

    // 关键断言：机器人2 看牌时不得亮任何牌（修改前此处 faceLabels 为 4）
    expect(faceLabels().length).toBe(0);
    expect(backCount()).toBe(8); // 玩家1 盖牌后背面 + 机器人2 背面

    // 兜底：机器人自动确认进入 playing 后，所有座位仍保持背面
    await waitFor(() => expect(screen.queryByText('＋ 摸牌')).toBeTruthy(), { timeout: 2000 });
    expect(faceLabels().length).toBe(0);
    expect(backCount()).toBe(8);
  });
});
