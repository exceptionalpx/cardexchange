import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GameScreen from '../src/components/GameScreen';

// 信息隐藏回归测试：发牌阶段机器人看牌时绝不亮牌（玩家不得通过热座视角偷看机器人手牌）
function renderGame() {
  return render(
    <GameScreen config={{ playerCount: 2, botCount: 1 }} onExit={() => {}} />,
  );
}

/** 已亮牌面文字（如 ♥5），即信息泄露信号；无牌面时返回空数组（不抛错） */
function faceLabels(): string[] {
  return screen
    .queryAllByText(/^[♠♥♦♣]|^大小王/)
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
    await waitFor(() => expect(screen.queryByText('摸牌')).toBeTruthy(), { timeout: 2000 });
    expect(faceLabels().length).toBe(0);
    expect(backCount()).toBe(8);
  });
});
