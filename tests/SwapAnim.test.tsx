// 换牌动画爪型渲染测试：SwapAnim 按换牌者头像挂载对应爪型 PNG
import { describe, expect, it, beforeAll } from 'vitest';
import { render, act } from '@testing-library/react';
import SwapAnim from '../src/components/SwapAnim';
import type { GameState, PlayerState } from '../src/core/types';

// jsdom 无 WAAPI animate：补最小桩（播放 effect 只依赖 finished）
beforeAll(() => {
  if (!Element.prototype.animate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Element.prototype as any).animate = function () {
      return { finished: Promise.resolve(), cancel() {}, addEventListener() {} };
    };
  }
});

function player(id: number, avatar: string): PlayerState {
  return { id, name: `P${id}`, isBot: false, handSlots: [], knowledge: {}, avatar };
}

function renderSwap(actorAvatar: string) {
  const lastSwap = {
    actor: 0,
    selfPlayer: 0,
    selfSlot: 0,
    otherPlayer: 1,
    otherSlot: 0,
  } as NonNullable<GameState['lastSwap']>;
  const { container } = render(
    <div>
      <div data-player="0" data-slot="0">
        <div className="card" />
      </div>
      <div data-player="1" data-slot="0">
        <div className="card" />
      </div>
      <SwapAnim lastSwap={lastSwap} players={[player(0, actorAvatar), player(1, '🤖')]} />
    </div>,
  );
  act(() => {});
  return container;
}

describe('SwapAnim 爪型素材渲染', () => {
  it('玩家 1（🐯）换牌 → 动画层使用虎爪素材', () => {
    const c = renderSwap('🐯');
    const img = c.querySelector('.swap-paw-img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src.endsWith('/paws/tiger.png')).toBe(true);
  });

  it('机器人（🤖）换牌 → 动画层使用机械手素材', () => {
    const c = renderSwap('🤖');
    const img = c.querySelector('.swap-paw-img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src.endsWith('/paws/robot.png')).toBe(true);
  });

  it('自定义上传头像（dataURL）换牌 → 猫爪兜底', () => {
    const c = renderSwap('data:image/png;base64,abc');
    const img = c.querySelector('.swap-paw-img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src.endsWith('/paws/cat.png')).toBe(true);
  });
});
