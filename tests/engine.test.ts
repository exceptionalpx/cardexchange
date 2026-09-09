// 规则引擎测试：发牌/定牌/摸牌/弃牌/替换/功能牌/跟弃/结算/非法操作
import { describe, expect, it } from 'vitest';
import { applyAction, canApply, createGame, settle } from '../src/core/engine';
import { scoreOf } from '../src/core/score';
import type { Card, GameState } from '../src/core/types';

function card(rank: Card['rank'], suit: Card['suit'] = 'spades'): Card {
  const prefix: Record<string, string> = {
    spades: 's',
    hearts: 'h',
    diamonds: 'd',
    clubs: 'c',
    joker: '',
  };
  const id =
    rank === 'JOKER_SMALL' || rank === 'JOKER_BIG' ? rank : `${prefix[suit]}${rank}`;
  return { id, suit, rank };
}

function makeGame(
  hands: (Card | null)[][],
  opts: {
    deck?: Card[];
    currentPlayer?: number;
    phase?: GameState['phase'];
    declaredPlayer?: number | null;
    pending?: GameState['pending'];
    discardPile?: Card[];
  } = {},
): GameState {
  const players = hands.map((hand, i) => {
    const slots = Array.from({ length: 4 }, (_, j) => hand[j] ?? null);
    return { id: i, name: `P${i}`, isBot: true, handSlots: slots, knowledge: {} };
  });
  return {
    deck: opts.deck ?? [],
    discardPile: opts.discardPile ?? [],
    players,
    currentPlayer: opts.currentPlayer ?? 0,
    phase: opts.phase ?? 'playing',
    declaredPlayer: opts.declaredPlayer ?? null,
    lastDiscard: null,
    follow: null,
    pending: opts.pending ?? null,
    lastSwap: null,
    finalRemaining: 0,
    winner: null,
    log: [],
  };
}

/** 全局牌数守恒：牌堆 + 弃牌堆 + 手牌 + 悬空 pending = 54 */
function countCards(s: GameState): number {
  let n = s.deck.length + s.discardPile.length;
  for (const p of s.players) n += p.handSlots.filter((c) => c !== null).length;
  if (s.pending?.kind === 'drawn') n += 1;
  return n;
}

describe('createGame 发牌', () => {
  it('4 人局：每人 4 张，牌堆 38 张，共 54 张', () => {
    const s = createGame({ playerCount: 4, botCount: 3 });
    expect(s.phase).toBe('deal');
    expect(s.players).toHaveLength(4);
    for (const p of s.players) expect(p.handSlots.filter((c) => c)).toHaveLength(4);
    expect(s.deck).toHaveLength(38);
    expect(countCards(s)).toBe(54);
  });

  it('2 人局：每人 4 张，牌堆 46 张', () => {
    const s = createGame({ playerCount: 2, botCount: 1 });
    expect(s.deck).toHaveLength(46);
  });
});

describe('deal 盖牌确认', () => {
  it('依次确认后进入 playing，每人 knowledge 记录自己的 4 张牌', () => {
    let s = createGame({ playerCount: 3, botCount: 2 });
    for (let i = 0; i < 3; i++) {
      expect(s.phase).toBe('deal');
      s = applyAction(s, { type: 'CONFIRM_DEAL' });
    }
    expect(s.phase).toBe('playing');
    expect(s.currentPlayer).toBe(0);
    for (const p of s.players) {
      expect(Object.keys(p.knowledge)).toHaveLength(4);
    }
  });
});

describe('定牌与终局', () => {
  it('定牌后进入 final，其余玩家依次各操作一轮后结算', () => {
    const s0 = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')], // P0 定牌
        [card('K'), card('Q'), card('J'), card('10')], // P1 高分
        [card('A'), card('A'), card('A'), card('A')], // P2 低分
      ],
      { deck: [card('5'), card('6'), card('7')] },
    );
    let s = applyAction(s0, { type: 'DECLARE' });
    expect(s.phase).toBe('final');
    expect(s.declaredPlayer).toBe(0);
    expect(s.currentPlayer).toBe(1);
    expect(s.finalRemaining).toBe(2);

    // P1 摸牌（普通牌 5）→ 弃掉
    s = applyAction(s, { type: 'DRAW' });
    expect(s.pending?.kind).toBe('drawn');
    s = applyAction(s, { type: 'DISCARD_DRAWN' });
    // P2 摸牌（6）→ 弃掉（无同分 → 回合推进，final 结束 → 结算）
    s = applyAction(s, { type: 'DRAW' });
    s = applyAction(s, { type: 'DISCARD_DRAWN' });
    expect(s.phase).toBe('end');
    expect(s.winner).toEqual([2]); // P2 总分 4 最低
    expect(s.players[0].score).toBe(10);
    expect(s.players[1].score).toBe(46);
    expect(s.players[2].score).toBe(4);
  });

  it('final 阶段不能再定牌', () => {
    const s = makeGame([
      [card('A'), card('2'), card('3'), card('4')],
      [card('5'), card('6'), card('7'), card('8')],
    ]);
    const after = applyAction(s, { type: 'DECLARE' });
    expect(canApply(after, { type: 'DECLARE' })).toBe(false);
  });

  it('分数并列同时胜出', () => {
    const s = makeGame([
      [card('A'), card('2'), card('3'), card('4')], // 10
      [card('A'), card('2'), card('3'), card('4')], // 10
      [card('K'), card('Q'), card('J'), card('10')], // 46
    ]);
    const end = settle(s);
    expect(end.winner).toEqual([0, 1]);
  });

  it('牌堆耗尽：摸牌时牌堆为空直接结算', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')], // 10
        [card('A'), card('A'), card('A'), card('A')], // 4
      ],
      { deck: [] },
    );
    const after = applyAction(s, { type: 'DRAW' });
    expect(after.phase).toBe('end');
    expect(after.winner).toEqual([1]);
  });
});

describe('摸牌与处理', () => {
  it('DRAW 后 pending 为 drawn，可弃牌', () => {
    const s = makeGame([[card('A'), card('2'), card('3'), card('4')]], { deck: [card('10')] });
    let g = applyAction(s, { type: 'DRAW' });
    expect(g.pending).toEqual({ kind: 'drawn', card: card('10') });
    g = applyAction(g, { type: 'DISCARD_DRAWN' });
    expect(g.discardPile).toContainEqual(card('10'));
    expect(g.pending).toBeNull();
    expect(g.currentPlayer).toBe(0); // 单人局回到自己
  });

  it('普通牌 REPLACE：替换槽位，被替换牌进弃牌堆并触发跟弃', () => {
    const s = makeGame(
      [
        [card('K'), card('A'), card('2'), card('3')],
        [card('5'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('A')] }, // 摸到 A
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'REPLACE', slot: 0 });
    expect(g.players[0].handSlots[0]).toEqual(card('A'));
    expect(g.discardPile).toContainEqual(card('K'));
    expect(g.players[0].knowledge[card('A').id]).toEqual(card('A'));
    expect(g.players[0].knowledge[card('K').id]).toBeUndefined();
    // P1 无 K → 无跟弃，回合推进
    expect(g.phase).toBe('playing');
    expect(g.currentPlayer).toBe(1);
  });

  it('空槽不能 REPLACE', () => {
    const s = makeGame([[null, null, null, null]], { deck: [card('A')] });
    const g = applyAction(s, { type: 'DRAW' });
    expect(canApply(g, { type: 'REPLACE', slot: 0 })).toBe(false);
  });

  it('未摸牌时不能弃牌/替换/发动功能', () => {
    const s = makeGame([[card('A'), card('2'), card('3'), card('4')]]);
    expect(canApply(s, { type: 'DISCARD_DRAWN' })).toBe(false);
    expect(canApply(s, { type: 'REPLACE', slot: 0 })).toBe(false);
    expect(canApply(s, { type: 'USE_ABILITY' })).toBe(false);
  });
});

describe('功能牌', () => {
  it('7/8 看自己一张牌：翻看后进入 revealDone 待确认，确认后结束回合', () => {
    const s = makeGame([[card('A'), card('K'), card('2'), card('3')]], {
      deck: [card('7')],
    });
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'USE_ABILITY' });
    expect(g.pending?.kind).toBe('chooseSelfSlot');
    expect(g.discardPile).toContainEqual(card('7'));
    g = applyAction(g, { type: 'PICK_SELF_SLOT', slot: 1 });
    expect(g.players[0].knowledge[card('K').id]).toEqual(card('K'));
    expect(g.pending?.kind).toBe('revealDone');
    if (g.pending?.kind === 'revealDone') expect(g.pending.card).toEqual(card('K'));
    g = applyAction(g, { type: 'REVEAL_DONE' });
    expect(g.pending).toBeNull();
    expect(g.currentPlayer).toBe(0); // 单人局回到自己
  });

  it('9/10 看别人一张牌：写入查看者 knowledge，翻看后进入 revealDone', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')],
        [card('Q'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('9')] },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'USE_ABILITY' });
    expect(g.pending?.kind).toBe('chooseOtherSlot');
    g = applyAction(g, { type: 'PICK_OTHER', playerId: 1, slot: 0 });
    expect(g.players[0].knowledge[card('Q').id]).toEqual(card('Q'));
    expect(g.players[1].knowledge[card('Q').id]).toBeUndefined(); // 对方不知道被看
    expect(g.pending?.kind).toBe('revealDone');
    g = applyAction(g, { type: 'REVEAL_DONE' });
    expect(g.pending).toBeNull();
  });

  it('信息隐藏：机器人翻看/明换的日志不透露牌面，且 revealDone 记录查看者', () => {
    // 机器人查看自己（7/8）：日志无牌面，viewer 记录查看者
    let g = makeGame([[card('A'), card('K'), card('2'), card('3')]], {
      deck: [card('7')],
    });
    g = applyAction(g, { type: 'DRAW' });
    g = applyAction(g, { type: 'USE_ABILITY' });
    g = applyAction(g, { type: 'PICK_SELF_SLOT', slot: 1 });
    expect(g.pending?.kind).toBe('revealDone');
    if (g.pending?.kind === 'revealDone') expect(g.pending.viewer).toBe(0);
    expect(g.log.at(-1)?.text).toBe('P0 查看了自己的一张牌');
    expect(g.log.at(-1)?.text).not.toContain('♠K');

    // 机器人查看别人（9/10）：日志无牌面
    const s2 = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')],
        [card('Q'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('9')] },
    );
    let g2 = applyAction(s2, { type: 'DRAW' });
    g2 = applyAction(g2, { type: 'USE_ABILITY' });
    g2 = applyAction(g2, { type: 'PICK_OTHER', playerId: 1, slot: 0 });
    expect(g2.log.at(-1)?.text).toBe('P0 查看了 P1 的一张牌');
    expect(g2.log.at(-1)?.text).not.toContain('♠Q');

    // 机器人 K 明换：日志无对方牌面
    const s3 = makeGame(
      [
        [card('K'), card('A'), card('2'), card('3')],
        [card('5'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('K')] },
    );
    let g3 = applyAction(s3, { type: 'DRAW' });
    g3 = applyAction(g3, { type: 'USE_ABILITY' });
    g3 = applyAction(g3, { type: 'PICK_SELF_SLOT', slot: 0 });
    g3 = applyAction(g3, { type: 'PICK_OTHER', playerId: 1, slot: 0 });
    expect(g3.log.at(-1)?.text).toBe('P0 使用 K 明换，查看了 P1 的一张牌');
    expect(g3.log.at(-1)?.text).not.toContain('♠5');

    // 真人查看自己（7/8）：日志保留牌面（真人需要记忆）
    const s4 = makeGame([[card('A'), card('K'), card('2'), card('3')]], {
      deck: [card('7')],
    });
    s4.players[0] = { ...s4.players[0], isBot: false };
    let g4 = applyAction(s4, { type: 'DRAW' });
    g4 = applyAction(g4, { type: 'USE_ABILITY' });
    g4 = applyAction(g4, { type: 'PICK_SELF_SLOT', slot: 1 });
    expect(g4.log.at(-1)?.text).toBe('P0 查看了自己的 ♠K');
  });

  it('J 暗换：交换双方槽位，双方均不知道新牌', () => {
    const s = makeGame(
      [
        [card('K'), card('A'), card('2'), card('3')],
        [card('5'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('J')] },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'USE_ABILITY' });
    g = applyAction(g, { type: 'PICK_SELF_SLOT', slot: 0 });
    g = applyAction(g, { type: 'PICK_OTHER', playerId: 1, slot: 0 });
    expect(g.players[0].handSlots[0]).toEqual(card('5'));
    expect(g.players[1].handSlots[0]).toEqual(card('K'));
    expect(g.players[0].knowledge[card('K').id]).toBeUndefined();
    expect(g.players[0].knowledge[card('5').id]).toBeUndefined();
    expect(g.players[1].knowledge[card('K').id]).toBeUndefined();
  });

  it('K 明换：先展示双方牌，可决定换或不换', () => {
    const s = makeGame(
      [
        [card('K'), card('A'), card('2'), card('3')], // P0 槽0 = K(13)
        [card('5'), card('6'), card('7'), card('8')], // P1 槽0 = 5
      ],
      { deck: [card('K', 'hearts')] }, // 摸到红桃 K，但作为功能牌用（点数 K）
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'USE_ABILITY' });
    g = applyAction(g, { type: 'PICK_SELF_SLOT', slot: 0 });
    g = applyAction(g, { type: 'PICK_OTHER', playerId: 1, slot: 0 });
    expect(g.pending?.kind).toBe('confirmReveal');
    if (g.pending?.kind === 'confirmReveal') {
      expect(g.pending.selfCard).toEqual(card('K'));
      expect(g.pending.otherCard).toEqual(card('5'));
    }
    // 对方牌更好（5 < 13），选择交换
    g = applyAction(g, { type: 'SWAP' });
    expect(g.players[0].handSlots[0]).toEqual(card('5'));
    expect(g.players[1].handSlots[0]).toEqual(card('K'));
    // KEEP 分支
    const s2 = makeGame(
      [
        [card('A'), card('A'), card('2'), card('3')], // P0 槽0 = A(1)
        [card('5'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('K')] },
    );
    let g2 = applyAction(s2, { type: 'DRAW' });
    g2 = applyAction(g2, { type: 'USE_ABILITY' });
    g2 = applyAction(g2, { type: 'PICK_SELF_SLOT', slot: 0 });
    g2 = applyAction(g2, { type: 'PICK_OTHER', playerId: 1, slot: 0 });
    g2 = applyAction(g2, { type: 'KEEP' });
    expect(g2.players[0].handSlots[0]).toEqual(card('A')); // 不变
  });

  it('普通牌不能发动功能', () => {
    const s = makeGame([[card('A'), card('2'), card('3'), card('4')]], { deck: [card('5')] });
    const g = applyAction(s, { type: 'DRAW' });
    expect(canApply(g, { type: 'USE_ABILITY' })).toBe(false);
  });
});

describe('跟弃', () => {
  it('弃牌触发跟弃窗口，点击同分牌的"弃"按钮成功弃掉该牌', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')], // P0 弃 10（自身无同分，pass）
        [card('10'), card('6'), card('7'), card('8')], // P1 有 10（槽 0）
        [card('Q'), card('Q'), card('Q'), card('Q')], // P2 无 10
      ],
      { deck: [card('10', 'diamonds')] },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'DISCARD_DRAWN' });
    expect(g.phase).toBe('follow');
    expect(g.follow?.decisions[1]).toBe('pending');
    expect(g.follow?.decisions[2]).toBe('pass');
    // 日志不出现"触发跟弃"提示，是否跟弃由玩家自行判断
    expect(g.log.some((e) => e.text.includes('触发跟弃'))).toBe(false);
    expect(g.log.some((e) => e.text.includes('弃掉了'))).toBe(true);
    // P1 点击同分牌槽位跟弃成功
    g = applyAction(g, { type: 'TRY_FOLLOW', playerId: 1, slot: 0 });
    expect(g.players[1].handSlots[0]).toBeNull();
    expect(g.discardPile).toContainEqual(card('10'));
    expect(g.phase).toBe('playing'); // 唯一 pending 决策完，窗口关闭
  });

  it('多人抢弃：先提交者成功，后提交者失败补牌', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')], // P0 弃 10（自身无同分）
        [card('10'), card('6'), card('7'), card('8')], // P1 有 10（槽 0）
        [card('10'), card('Q'), card('Q'), card('Q')], // P2 有 10（槽 0）
      ],
      { deck: [card('10', 'diamonds'), card('9')] }, // 弃的 10 + 补牌用 9
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'DISCARD_DRAWN' });
    // P1 先提交 → 成功
    g = applyAction(g, { type: 'TRY_FOLLOW', playerId: 1, slot: 0 });
    expect(g.players[1].handSlots[0]).toBeNull();
    // P2 后提交 → 失败，补 1 张（9 进空槽）
    g = applyAction(g, { type: 'TRY_FOLLOW', playerId: 2, slot: 0 });
    expect(g.players[2].handSlots).toContainEqual(card('9'));
    expect(g.phase).toBe('playing');
    expect(g.players[2].knowledge[card('9').id]).toBeUndefined(); // 盲摸不知道
  });

  it('窗口内点错牌（不同分）：跟弃失败惩罚补牌', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')], // P0 弃 10（自身无同分）
        [card('10'), card('6'), card('7'), card('8')], // P1 槽 0 是 10（同分），槽 2 是 7（不同分）
      ],
      { deck: [card('10', 'diamonds'), card('9')] },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'DISCARD_DRAWN' });
    // P1 点错（点了不同分的槽 2）→ 跟弃失败，补 1 张
    g = applyAction(g, { type: 'TRY_FOLLOW', playerId: 1, slot: 2 });
    expect(g.players[1].handSlots).toContainEqual(card('9'));
    expect(g.players[1].handSlots[0]).toEqual(card('10')); // 同分牌未弃
    expect(g.log.some((e) => e.text.includes('跟弃失败'))).toBe(true);
    expect(g.phase).toBe('playing'); // 唯一 pending 已决策，窗口关闭
  });

  it('窗口期外（平时）点击"弃"按钮：跟弃失败惩罚补牌，回合状态不变', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')], // P0 回合开始（无 pending）
        [card('5'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('9')] },
    );
    // 没有跟弃窗口时点击 → 失败 + 补 1 张
    let g = applyAction(s, { type: 'TRY_FOLLOW', playerId: 0, slot: 0 });
    expect(g.players[0].handSlots).toContainEqual(card('9'));
    expect(g.phase).toBe('playing');
    expect(g.currentPlayer).toBe(0); // 回合不推进
    expect(g.pending).toBeNull();
  });

  it('无人跟弃时窗口由 PASS 关闭', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')],
        [card('10'), card('6'), card('7'), card('8')],
        [card('Q'), card('Q'), card('Q'), card('Q')],
      ],
      { deck: [card('10', 'diamonds')] },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'DISCARD_DRAWN' });
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 1 });
    expect(g.phase).toBe('playing');
    expect(g.players[1].handSlots[0]).toEqual(card('10')); // 未弃
  });

  it('跟弃成功后不连锁触发新窗口', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')], // P0 弃 10（自身无同分）
        [card('10'), card('6'), card('7'), card('8')], // P1 跟弃 10（弃掉后不再触发）
        [card('10'), card('Q'), card('Q'), card('Q')], // P2 也有 10 但不参与
      ],
      { deck: [card('10', 'diamonds')] },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'DISCARD_DRAWN' });
    g = applyAction(g, { type: 'TRY_FOLLOW', playerId: 1, slot: 0 });
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 2 });
    expect(g.phase).toBe('playing'); // 直接进入下一回合，无新窗口
  });

  it('发牌/结算阶段不能尝试跟弃', () => {
    const deal = createGame({ playerCount: 2, botCount: 1 });
    expect(canApply(deal, { type: 'TRY_FOLLOW', playerId: 0, slot: 0 })).toBe(false);
    const ended = settle(
      makeGame([
        [card('A'), card('2'), card('3'), card('4')],
        [card('5'), card('6'), card('7'), card('8')],
      ]),
    );
    expect(canApply(ended, { type: 'TRY_FOLLOW', playerId: 0, slot: 0 })).toBe(false);
  });

  it('弃牌者本人也可跟弃（一回合连弃两张同分牌）', () => {
    const s = makeGame(
      [
        [card('10'), card('A'), card('2'), card('3')], // P0 手牌含 10，弃掉摸到的 10 后可跟弃自己的 10
        [card('Q'), card('Q'), card('Q'), card('Q')], // P1 无 10
      ],
      { deck: [card('10', 'diamonds')] },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'DISCARD_DRAWN' });
    // 弃牌者 P0 也进入 pending（可跟弃自己）
    expect(g.phase).toBe('follow');
    expect(g.follow?.decisions[0]).toBe('pending');
    expect(g.follow?.decisions[1]).toBe('pass');
    // P0 点击自己手牌中的同分 10 → 跟弃成功，连弃两张
    g = applyAction(g, { type: 'TRY_FOLLOW', playerId: 0, slot: 0 });
    expect(g.players[0].handSlots[0]).toBeNull();
    expect(g.discardPile.filter((c) => c.rank === '10')).toHaveLength(2);
    expect(g.phase).toBe('playing');
  });
});

describe('换牌标记 lastSwap', () => {
  it('J 暗换：记录双方换入的槽位', () => {
    const s = makeGame(
      [
        [card('K'), card('A'), card('2'), card('3')],
        [card('5'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('J')] },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'USE_ABILITY' });
    g = applyAction(g, { type: 'PICK_SELF_SLOT', slot: 0 });
    g = applyAction(g, { type: 'PICK_OTHER', playerId: 1, slot: 0 });
    expect(g.lastSwap).toEqual({
      actor: 0,
      selfPlayer: 0,
      selfSlot: 0,
      otherPlayer: 1,
      otherSlot: 0,
    });
  });

  it('K 明换选择不换：不记录 lastSwap', () => {
    const s = makeGame(
      [
        [card('K'), card('A'), card('2'), card('3')],
        [card('5'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('K')] },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'USE_ABILITY' });
    g = applyAction(g, { type: 'PICK_SELF_SLOT', slot: 0 });
    g = applyAction(g, { type: 'PICK_OTHER', playerId: 1, slot: 0 });
    expect(g.pending?.kind).toBe('confirmReveal');
    g = applyAction(g, { type: 'KEEP' });
    expect(g.lastSwap).toBeNull();
  });
});

describe('非法操作拦截', () => {
  it('定牌后不能对已定牌玩家换牌（看牌允许）', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')],
        [card('5'), card('6'), card('7'), card('8')],
        [card('9'), card('10'), card('J'), card('Q')],
      ],
      {
        phase: 'final',
        declaredPlayer: 1,
        currentPlayer: 0,
        pending: { kind: 'chooseOtherSlot', purpose: 'swap', ability: 'J', selfSlot: 0 },
      },
    );
    expect(canApply(s, { type: 'PICK_OTHER', playerId: 1, slot: 0 })).toBe(false);
    expect(canApply(s, { type: 'PICK_OTHER', playerId: 2, slot: 0 })).toBe(true);
    // 看牌允许
    const sView = { ...s, pending: { kind: 'chooseOtherSlot', purpose: 'view', ability: '9' } as GameState['pending'] };
    expect(canApply(sView, { type: 'PICK_OTHER', playerId: 1, slot: 0 })).toBe(true);
  });

  it('不能选择自己作为换牌目标', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')],
        [card('5'), card('6'), card('7'), card('8')],
      ],
      { pending: { kind: 'chooseOtherSlot', purpose: 'swap', ability: 'J', selfSlot: 0 } },
    );
    expect(canApply(s, { type: 'PICK_OTHER', playerId: 0, slot: 0 })).toBe(false);
  });
});

describe('状态守恒', () => {
  it('完整流程中全局牌数恒为 54', () => {
    let s = createGame({ playerCount: 3, botCount: 2 });
    expect(countCards(s)).toBe(54);
    // deal 确认
    for (let i = 0; i < 3; i++) {
      s = applyAction(s, { type: 'CONFIRM_DEAL' });
      expect(countCards(s)).toBe(54);
    }
    // 跑若干回合直至终局（用 AI 模拟，见 simulation.test 做完整验证）
    let guard = 0;
    while (s.phase !== 'end' && guard < 200) {
      guard++;
      if (s.phase === 'deal') {
        s = applyAction(s, { type: 'CONFIRM_DEAL' });
      } else if (s.phase === 'follow' && s.follow) {
        const pendingId = Number(
          Object.entries(s.follow.decisions).find(([, d]) => d === 'pending')?.[0] ?? -1,
        );
        const p = s.players[pendingId];
        const idx = p.handSlots.findIndex((c) => c !== null && scoreOf(c) === s.follow!.targetScore);
        if (idx >= 0) {
          s = applyAction(s, { type: 'TRY_FOLLOW', playerId: pendingId, slot: idx });
        } else {
          s = applyAction(s, { type: 'PASS_FOLLOW', playerId: pendingId });
        }
      } else {
        // 简单驱动：能定牌就定，否则摸牌弃牌
        if (s.phase === 'playing' && s.pending === null) {
          s = applyAction(s, { type: 'DRAW' });
        } else if (s.pending?.kind === 'drawn') {
          s = applyAction(s, { type: 'DISCARD_DRAWN' });
        } else {
          break;
        }
      }
      expect(countCards(s)).toBe(54);
    }
  });
});
