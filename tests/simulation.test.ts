// 模拟对局测试：全 AI 代理跑完整对局
import { describe, expect, it } from 'vitest';
import { aiDecide } from '../src/core/ai';
import { applyAction, canApply, createGame } from '../src/core/engine';
import type { GameState } from '../src/core/types';

/** 确定性伪随机数生成器（LCG），保证测试可复现 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function countCards(state: GameState): number {
  let n = state.deck.length + state.discardPile.length;
  for (const p of state.players) n += p.handSlots.filter((c) => c !== null).length;
  if (state.pending?.kind === 'drawn') n += 1;
  return n;
}

/** 当前需要动作的玩家 */
function currentActor(state: GameState): number {
  if (state.phase === 'deal') return state.currentPlayer;
  if (state.phase === 'follow' && state.follow) {
    const pending = Object.entries(state.follow.decisions).find(([, d]) => d === 'pending');
    if (pending) return Number(pending[0]);
    return state.currentPlayer;
  }
  return state.currentPlayer;
}

function runGame(playerCount: number, botCount: number, seed: number): GameState {
  let s = createGame({ playerCount, botCount }, makeRng(seed));
  let guard = 0;
  while (s.phase !== 'end') {
    if (guard++ > 10000) throw new Error(`对局未终止（seed=${seed}, phase=${s.phase}）`);
    const actor = currentActor(s);
    const action = aiDecide(s, actor);
    if (!canApply(s, action)) {
      throw new Error(`非法动作 ${JSON.stringify(action)}（phase=${s.phase}, actor=${actor}）`);
    }
    s = applyAction(s, action);
    if (countCards(s) !== 54) {
      throw new Error(`状态不守恒：${countCards(s)} 张（seed=${seed}）`);
    }
  }
  return s;
}

describe('模拟对局', () => {
  it('4 人全 AI 跑 60 局：必然终止、状态守恒、结算正确', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = runGame(4, 4, seed);
      expect(s.phase, `seed=${seed}`).toBe('end');
      expect(s.winner!.length, `seed=${seed}`).toBeGreaterThan(0);
      // 胜者分数为全场最低
      const scores = s.players.map((p) => p.score!);
      const min = Math.min(...scores);
      for (const id of s.winner!) expect(scores[id]).toBe(min);
    }
  });

  it('2 人与 3 人局各跑 20 局', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(runGame(2, 1, seed).phase).toBe('end');
      expect(runGame(3, 2, seed).phase).toBe('end');
    }
  });

  it('1 真人 + 3 机器人：真人位由 AI 代理同样能完成对局', () => {
    // botCount = 3（4 人局），与全 AI 等价驱动
    for (let seed = 1; seed <= 10; seed++) {
      expect(runGame(4, 3, seed).phase).toBe('end');
    }
  });
});
