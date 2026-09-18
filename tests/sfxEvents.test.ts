import { describe, it, expect } from 'vitest';
import { nextSfxEvents } from '../src/components/GameScreen';
import type { GameState } from '../src/core/types';

/** 构造最小 lastMove（替换/弃牌） */
function move(seq: number, kind: 'discard' | 'replace' = 'replace') {
  return { seq, kind, actor: 0, slot: 1 } as GameState['lastMove'];
}
/** 构造最小 lastPenalty（跟弃失败罚牌） */
function penalty(seq: number) {
  return { seq, actor: 0, slot: 2 } as GameState['lastPenalty'];
}

describe('nextSfxEvents 各事件独立 seq 防重', () => {
  it('跟弃失败后，替换手牌（move.seq 变化）不再重播跟弃失败音效', () => {
    // 已播放过 penalty.seq=1（prev.penalty=1）
    const prev = { swap: 0, move: 0, penalty: 1 };
    const s = { lastMove: move(2), lastPenalty: penalty(1) } as Pick<
      GameState,
      'lastSwap' | 'lastMove' | 'lastPenalty'
    >;
    const ev = nextSfxEvents(prev, s);
    expect(ev.playMove).toBe(true); // 替换音效正常触发
    expect(ev.playPenalty).toBe(false); // 跟弃失败音效不重播
    expect(ev.playSwap).toBe(false);
    // 下一轮 prev 同步
    expect(ev.next).toEqual({ swap: 0, move: 2, penalty: 1 });
  });

  it('新发生的跟弃失败（penalty.seq 递增）只播一次', () => {
    const prev = { swap: 0, move: 2, penalty: 1 };
    const s = { lastPenalty: penalty(3) } as Pick<
      GameState,
      'lastSwap' | 'lastMove' | 'lastPenalty'
    >;
    const ev = nextSfxEvents(prev, s);
    expect(ev.playPenalty).toBe(true);
    // 同状态再比一次 → 不再触发
    const ev2 = nextSfxEvents(ev.next, s);
    expect(ev2.playPenalty).toBe(false);
  });

  it('换牌（swap.seq 变化）不牵连 move/penalty 旧值', () => {
    const prev = { swap: 0, move: 5, penalty: 2 };
    const s = {
      lastSwap: {
        seq: 7,
        actor: 0,
        selfPlayer: 0,
        selfSlot: 1,
        otherPlayer: 1,
        otherSlot: 2,
      } as GameState['lastSwap'],
      lastMove: move(5),
      lastPenalty: penalty(2),
    } as Pick<GameState, 'lastSwap' | 'lastMove' | 'lastPenalty'>;
    const ev = nextSfxEvents(prev, s);
    expect(ev.playSwap).toBe(true);
    expect(ev.playMove).toBe(false);
    expect(ev.playPenalty).toBe(false);
  });
});
