import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import LogPanel from '../src/components/LogPanel';
import type { GameState, PlayerState } from '../src/core/types';

function player(id: number, name: string, isBot = false): PlayerState {
  return {
    id,
    name,
    isBot,
    avatar: isBot ? '🤖' : '🐻',
    handSlots: [null, null, null, null],
    knowledge: {},
    score: 0,
  } as PlayerState;
}

function makeState(log: GameState['log']): GameState {
  return {
    players: [player(0, '甲'), player(1, '乙'), player(2, 'AI熊', true)],
    log,
  } as GameState;
}

describe('LogPanel 玩家色 + 操作色渲染', () => {
  it('真人玩家名用座位色、动作按 kind 着色', () => {
    const { container } = render(
      <LogPanel
        state={makeState([
          { playerId: 0, text: '甲 摸了一张牌', kind: 'draw' },
          { playerId: 1, text: '乙 弃掉了 ♥8', kind: 'discard' },
        ])}
      />,
    );
    const entries = container.querySelectorAll('.log-entry');
    expect(entries.length).toBe(2);
    const e0 = entries[0];
    expect(e0.querySelector('.log-player.pc-0')?.textContent).toBe('甲');
    expect(e0.querySelector('.log-action.ok-draw')?.textContent).toBe(' 摸了一张牌');
    const e1 = entries[1];
    expect(e1.querySelector('.log-player.pc-1')?.textContent).toBe('乙');
    expect(e1.querySelector('.log-action.ok-discard')?.textContent).toBe(' 弃掉了 ♥8');
  });

  it('机器人玩家名用统一灰色 pc-bot', () => {
    const { container } = render(
      <LogPanel
        state={makeState([{ playerId: 2, text: 'AI熊 跟弃成功，弃掉 ♠9', kind: 'follow' }])}
      />,
    );
    expect(container.querySelector('.log-player.pc-bot')?.textContent).toBe('AI熊');
    expect(container.querySelector('.log-action.ok-follow')).toBeTruthy();
  });

  it('系统日志（playerId<0）用 log-system 样式', () => {
    const { container } = render(
      <LogPanel
        state={makeState([{ playerId: -1, text: '终局：甲 获胜' }])}
      />,
    );
    expect(container.querySelector('.log-entry.log-system')).toBeTruthy();
  });
});
