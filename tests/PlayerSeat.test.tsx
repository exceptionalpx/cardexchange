import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PlayerSeat from '../src/components/PlayerSeat';
import type { ViewPlayer } from '../src/core/view';

function vp(over: Partial<ViewPlayer> = {}): ViewPlayer {
  return {
    id: 0,
    name: '玩家1',
    isBot: false,
    avatar: '🐻',
    slots: [
      { card: { id: 'd7', suit: 'diamonds', rank: '7' }, known: false },
      { card: null, known: false },
      { card: { id: 'hA', suit: 'hearts', rank: 'A' }, known: false },
      { card: null, known: false },
    ],
    ...over,
  } as ViewPlayer;
}

describe('PlayerSeat 跟弃条（倒计时+放弃，显示在手牌区弃牌按钮旁）', () => {
  it('有 followBar 时显示倒计时与放弃按钮，点放弃触发 onPass', () => {
    const onPass = vi.fn();
    render(
      <PlayerSeat
        player={vp()}
        isCurrent
        isDeclared={false}
        selectable={false}
        showDiscard
        onDiscard={() => {}}
        followBar={{ left: 3, gaveUp: false, onPass }}
      />,
    );
    expect(screen.getByText('可跟弃 · 3s')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '放弃' }));
    expect(onPass).toHaveBeenCalledTimes(1);
  });

  it('联机已放弃：按钮禁用并显示等待文案', () => {
    render(
      <PlayerSeat
        player={vp()}
        isCurrent
        isDeclared={false}
        selectable={false}
        showDiscard
        onDiscard={() => {}}
        followBar={{ left: 2, gaveUp: true, onPass: () => {} }}
      />,
    );
    const btn = screen.getByRole('button', { name: '已放弃（等待其他玩家）' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('无 followBar 时完全不渲染跟弃条', () => {
    const { container } = render(
      <PlayerSeat
        player={vp()}
        isCurrent={false}
        isDeclared={false}
        selectable={false}
        showDiscard
        onDiscard={() => {}}
      />,
    );
    expect(container.querySelector('.follow-bar')).toBeNull();
    expect(screen.queryByText(/可跟弃/)).toBeNull();
  });
});
