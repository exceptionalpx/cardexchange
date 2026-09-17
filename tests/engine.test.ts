// 规则引擎测试：发牌/定牌/摸牌/弃牌/替换/功能牌/跟弃/结算/非法操作
import { describe, expect, it } from 'vitest';
import { applyAction, canApply, createGame, settle } from '../src/core/engine';
import { handScore, scoreOf } from '../src/core/score';
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
    allowSelfFollow?: boolean;
    declareBonus?: boolean;
    declaredDeckCount?: number;
  } = {},
): GameState {
  const players = hands.map((hand, i) => {
    const slots = Array.from({ length: 4 }, (_, j) => hand[j] ?? null);
    return { id: i, name: `P${i}`, isBot: true, handSlots: slots, knowledge: {} };
  });
  return {
    deck: opts.deck ?? [],
    discardPile: opts.discardPile ?? [],
    usedPile: [],
    players,
    currentPlayer: opts.currentPlayer ?? 0,
    phase: opts.phase ?? 'playing',
    dealConfirmed: players.map((p) => p.isBot),
    declaredPlayer: opts.declaredPlayer ?? null,
    lastDiscard: null,
    follow: null,
    pending: opts.pending ?? null,
    lastSwap: null,
    lastMove: null,
    lastViewed: null,
    lastPenalty: null,
    animSeq: 0,
    finalRemaining: 0,
    winner: null,
    declaredDeckCount: opts.declaredDeckCount,
    allowSelfFollow: opts.allowSelfFollow ?? true,
    declareBonus: opts.declareBonus ?? false,
    botMemory: 0,
    log: [],
  };
}

/** 全局牌数守恒：牌堆 + 弃牌堆 + 功能区 + 手牌 + 悬空 pending = 54 */
function countCards(s: GameState): number {
  let n = s.deck.length + s.discardPile.length + s.usedPile.length;
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
  it('真人确认后进入 playing，真人 knowledge 记录自己的 4 张牌（机器人开局已确认）', () => {
    let s = createGame({ playerCount: 3, botCount: 2 });
    expect(s.phase).toBe('deal');
    expect(s.dealConfirmed).toEqual([false, true, true]);
    s = applyAction(s, { type: 'CONFIRM_DEAL' }); // 仅真人 P0 需确认
    expect(s.phase).toBe('playing');
    expect(s.currentPlayer).toBe(0);
    expect(s.dealConfirmed).toEqual([true, true, true]);
    expect(Object.keys(s.players[0].knowledge)).toHaveLength(4);
  });

  it('联机多真人可并行确认（任意顺序），全部确认才开局', () => {
    let s = createGame({ playerCount: 2, botCount: 0 });
    expect(s.dealConfirmed).toEqual([false, false]);
    // 玩家 1 先确认（不必是 currentPlayer）
    s = applyAction(s, { type: 'CONFIRM_DEAL', playerId: 1 });
    expect(s.phase).toBe('deal');
    expect(s.dealConfirmed).toEqual([false, true]);
    // 玩家 0 后确认
    s = applyAction(s, { type: 'CONFIRM_DEAL', playerId: 0 });
    expect(s.phase).toBe('playing');
    expect(s.dealConfirmed).toEqual([true, true]);
    expect(Object.keys(s.players[0].knowledge)).toHaveLength(4);
    expect(Object.keys(s.players[1].knowledge)).toHaveLength(4);
  });

  it('机器人无法确认盖牌（开局已确认）', () => {
    const s = createGame({ playerCount: 2, botCount: 1 });
    expect(canApply(s, { type: 'CONFIRM_DEAL', playerId: 1 })).toBe(false);
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

    // P1 摸牌（普通牌 5）→ 弃掉（每次弃牌都开窗口，全员 PASS 后轮到 P2）
    s = applyAction(s, { type: 'DRAW' });
    expect(s.pending?.kind).toBe('drawn');
    s = applyAction(s, { type: 'DISCARD_DRAWN' });
    expect(s.phase).toBe('follow');
    s = applyAction(s, { type: 'PASS_FOLLOW', playerId: 0 });
    s = applyAction(s, { type: 'PASS_FOLLOW', playerId: 1 });
    s = applyAction(s, { type: 'PASS_FOLLOW', playerId: 2 });
    expect(s.phase).toBe('final');
    expect(s.currentPlayer).toBe(2);
    // P2 摸牌（6）→ 弃掉（每次弃牌都开窗口，全员 PASS 后 final 结束 → 结算）
    s = applyAction(s, { type: 'DRAW' });
    s = applyAction(s, { type: 'DISCARD_DRAWN' });
    expect(s.phase).toBe('follow');
    s = applyAction(s, { type: 'PASS_FOLLOW', playerId: 0 });
    s = applyAction(s, { type: 'PASS_FOLLOW', playerId: 1 });
    s = applyAction(s, { type: 'PASS_FOLLOW', playerId: 2 });
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
    // 每次弃牌都开跟弃窗口（全员待决策）；无人跟弃时全部 PASS 后回合推进
    expect(g.phase).toBe('follow');
    expect(g.follow?.decisions[0]).toBe('pending');
    expect(g.follow?.decisions[1]).toBe('pending');
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 0 });
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 1 });
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
    // 功能牌进入功能区，不混入弃牌堆
    expect(g.usedPile).toContainEqual(card('7'));
    expect(g.discardPile).not.toContainEqual(card('7'));
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

    // 真人查看自己（7/8）：日志不写牌面（记忆考验"翻看后不标记"，联机日志对所有玩家安全）
    const s4 = makeGame([[card('A'), card('K'), card('2'), card('3')]], {
      deck: [card('7')],
    });
    s4.players[0] = { ...s4.players[0], isBot: false };
    let g4 = applyAction(s4, { type: 'DRAW' });
    g4 = applyAction(g4, { type: 'USE_ABILITY' });
    g4 = applyAction(g4, { type: 'PICK_SELF_SLOT', slot: 1 });
    expect(g4.log.at(-1)?.text).toBe('P0 查看了自己的一张牌');
    expect(g4.log.at(-1)?.text).not.toContain('♠K');
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

  it('换牌任意顺序：先选对方再选自己同样执行（暗换直接交换 / K 进入展示）', () => {
    // J 暗换：先选对方（P1 槽0），再选自己（P0 槽0）
    const s = makeGame(
      [
        [card('K'), card('A'), card('2'), card('3')],
        [card('5'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('J')] },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'USE_ABILITY' });
    expect(g.pending).toEqual({
      kind: 'chooseSwap',
      ability: 'J',
      selfSlot: null,
      otherPlayer: null,
      otherSlot: null,
    });
    g = applyAction(g, { type: 'PICK_OTHER', playerId: 1, slot: 0 });
    expect(g.pending).toEqual({
      kind: 'chooseSwap',
      ability: 'J',
      selfSlot: null,
      otherPlayer: 1,
      otherSlot: 0,
    });
    g = applyAction(g, { type: 'PICK_SELF_SLOT', slot: 0 });
    expect(g.pending).toBeNull();
    expect(g.players[0].handSlots[0]).toEqual(card('5'));
    expect(g.players[1].handSlots[0]).toEqual(card('K'));

    // K 明换：先选对方再选自己 → 进入 confirmReveal（展示双方牌）
    const s2 = makeGame(
      [
        [card('K'), card('A'), card('2'), card('3')],
        [card('5'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('K')] },
    );
    let g2 = applyAction(s2, { type: 'DRAW' });
    g2 = applyAction(g2, { type: 'USE_ABILITY' });
    g2 = applyAction(g2, { type: 'PICK_OTHER', playerId: 1, slot: 1 });
    g2 = applyAction(g2, { type: 'PICK_SELF_SLOT', slot: 0 });
    expect(g2.pending?.kind).toBe('confirmReveal');
    if (g2.pending?.kind === 'confirmReveal') {
      expect(g2.pending.selfCard).toEqual(card('K'));
      expect(g2.pending.otherCard).toEqual(card('6'));
    }
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
    expect(g.follow?.decisions[2]).toBe('pending');
    // 日志不出现"触发跟弃"提示，是否跟弃由玩家自行判断
    expect(g.log.some((e) => e.text.includes('触发跟弃'))).toBe(false);
    expect(g.log.some((e) => e.text.includes('弃掉了'))).toBe(true);
    // P1 点击同分牌槽位跟弃成功
    g = applyAction(g, { type: 'TRY_FOLLOW', playerId: 1, slot: 0 });
    expect(g.players[1].handSlots[0]).toBeNull();
    expect(g.discardPile).toContainEqual(card('10'));
    expect(g.phase).toBe('follow'); // P0/P2 仍待决策
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 0 });
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 2 });
    expect(g.phase).toBe('playing'); // 全部决策完，窗口关闭
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
    expect(g.phase).toBe('follow'); // 弃牌者 P0 仍待决策
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 0 });
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
    expect(g.phase).toBe('follow'); // 弃牌者 P0 仍待决策
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 0 });
    expect(g.phase).toBe('playing'); // 全部决策完，窗口关闭
  });

  it('窗口期外（平时）点击"弃"按钮：无响应、不罚牌、回合不变', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')], // P0 回合开始（无 pending）
        [card('5'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('9')] },
    );
    // 没有跟弃窗口时点击 → 无响应（不罚牌）
    const g = applyAction(s, { type: 'TRY_FOLLOW', playerId: 0, slot: 0 });
    expect(g).toBe(s); // 状态完全不变
    expect(g.players[0].handSlots).not.toContainEqual(card('9'));
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
    expect(g.phase).toBe('follow'); // P0/P2 仍待决策
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 0 });
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 2 });
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
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 0 });
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
    expect(g.follow?.decisions[1]).toBe('pending');
    // P0 点击自己手牌中的同分 10 → 跟弃成功，连弃两张
    g = applyAction(g, { type: 'TRY_FOLLOW', playerId: 0, slot: 0 });
    expect(g.players[0].handSlots[0]).toBeNull();
    expect(g.discardPile.filter((c) => c.rank === '10')).toHaveLength(2);
    expect(g.phase).toBe('follow'); // P1 仍待决策
    g = applyAction(g, { type: 'PASS_FOLLOW', playerId: 1 });
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
    expect(g.lastSwap).toMatchObject({
      actor: 0,
      selfPlayer: 0,
      selfSlot: 0,
      otherPlayer: 1,
      otherSlot: 0,
    });
    expect(g.lastSwap?.seq).toBeGreaterThan(0); // 动画事件带递增 seq
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
        pending: { kind: 'chooseSwap', ability: 'J', selfSlot: 0, otherPlayer: null, otherSlot: null },
      },
    );
    expect(canApply(s, { type: 'PICK_OTHER', playerId: 1, slot: 0 })).toBe(false);
    expect(canApply(s, { type: 'PICK_OTHER', playerId: 2, slot: 0 })).toBe(true);
    // 看牌允许（9/10 可看已定牌玩家）
    const sView = { ...s, pending: { kind: 'chooseOtherSlot', purpose: 'view', ability: '9' } as GameState['pending'] };
    expect(canApply(sView, { type: 'PICK_OTHER', playerId: 1, slot: 0 })).toBe(true);
  });

  it('不能选择自己作为换牌目标', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')],
        [card('5'), card('6'), card('7'), card('8')],
      ],
      { pending: { kind: 'chooseSwap', ability: 'J', selfSlot: 0, otherPlayer: null, otherSlot: null } },
    );
    expect(canApply(s, { type: 'PICK_OTHER', playerId: 0, slot: 0 })).toBe(false);
  });
});

describe('状态守恒', () => {
  it('完整流程中全局牌数恒为 54', () => {
    let s = createGame({ playerCount: 3, botCount: 2 });
    expect(countCards(s)).toBe(54);
    // deal 确认（仅真人 P0；机器人开局已确认）
    s = applyAction(s, { type: 'CONFIRM_DEAL' });
    expect(s.phase).toBe('playing');
    expect(countCards(s)).toBe(54);
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

describe('头像配置', () => {
  it('真人自定义头像优先；机器人统一用 🤖；未配置真人自动分配默认', () => {
    const s = createGame({ playerCount: 3, botCount: 2, avatars: ['🐱', undefined, undefined] });
    expect(s.players[0].avatar).toBe('🐱'); // 真人自定义头像
    expect(s.players[1].avatar).toBe('🤖'); // 机器人统一机器人头像
    expect(s.players[2].avatar).toBe('🤖');
    // 完全未配置时，真人座位也有默认头像（且机器人仍是 🤖，不与玩家重复）
    const s2 = createGame({ playerCount: 2, botCount: 1 });
    expect(s2.players[0].avatar).toBeTruthy();
    expect(s2.players[0].avatar).not.toBe('🤖');
    expect(s2.players[1].avatar).toBe('🤖');
  });

  it('真人头像为空字符串时兜底分配默认头像（不再空头像不显示）', () => {
    const s = createGame({ playerCount: 2, botCount: 0, avatars: ['', undefined] });
    expect(s.players[0].avatar).toBeTruthy();
    expect(s.players[1].avatar).toBeTruthy();
    expect(s.players[0].avatar).not.toBe('🤖');
  });
});

describe('罚牌 lastPenalty', () => {
  it('跟弃失败：惩罚补牌并记录 actor+slot（不含牌面）', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')],
        [card('9'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('9'), card('Q')], currentPlayer: 0 },
    );
    let g = applyAction(s, { type: 'DRAW' }); // 玩家0 摸到 9
    g = applyAction(g, { type: 'DISCARD_DRAWN' }); // 弃 9 → 触发跟弃窗口（目标分 9，玩家1 持 9 分牌）
    expect(g.follow).not.toBeNull();
    // 玩家1 故意点错牌（slot 1 是 6 分，不是 9 分）→ 跟弃失败 → 罚牌
    const before = g.players[1].handSlots.length;
    g = applyAction(g, { type: 'TRY_FOLLOW', playerId: 1, slot: 1 });
    expect(g.lastPenalty).not.toBeNull();
    expect(g.lastPenalty!.actor).toBe(1);
    expect(g.players[1].handSlots[g.lastPenalty!.slot]).not.toBeNull();
    expect(g.players[1].handSlots.length).toBe(before + 1);
    expect(g.discardPile).toContainEqual(card('9'));
  });

  it('牌堆已空时跟弃失败：不写 lastPenalty（无牌可补）', () => {
    const s = makeGame(
      [
        [card('A'), card('2'), card('3'), card('4')],
        [card('9'), card('6'), card('7'), card('8')],
      ],
      { deck: [card('9')], currentPlayer: 0 },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'DISCARD_DRAWN' });
    expect(g.lastPenalty).toBeNull();
    g = applyAction(g, { type: 'TRY_FOLLOW', playerId: 1, slot: 1 });
    expect(g.lastPenalty).toBeNull();
    expect(g.players[1].handSlots.length).toBe(4); // 没有多牌
  });
});

describe('lastMove 动画数据', () => {
  it('直接弃牌：写入 discard 动画数据（含操作者与被弃牌面，弃牌公开进弃牌堆）', () => {
    const s = makeGame([[card('A'), card('2'), card('3'), card('4')]], { deck: [card('9')] });
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'DISCARD_DRAWN' });
    expect(g.lastMove).toMatchObject({ kind: 'discard', actor: 0, card: card('9') });
  });

  it('替换手牌：写入 replace 动画数据（含槽位与被替换旧牌面；新牌保密不含）', () => {
    const s = makeGame([[card('A'), card('2'), card('3'), card('4')]], { deck: [card('9')] });
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'REPLACE', slot: 2 });
    expect(g.lastMove).toMatchObject({ kind: 'replace', actor: 0, slot: 2, replaced: card('3') });
    // 被替换的旧牌进弃牌堆，新牌进槽位
    expect(g.players[0].handSlots[2]).toEqual(card('9'));
    expect(g.discardPile).toContainEqual(card('3'));
  });

  it('9/10 看他人牌：记录被看槽位（lastViewed 不含牌面）', () => {
    const s = makeGame(
      [[card('A'), card('2'), card('3'), card('4')], [card('5'), card('6'), card('7'), card('8')]],
      { deck: [card('9')], currentPlayer: 0 },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'USE_ABILITY' });
    g = applyAction(g, { type: 'PICK_OTHER', playerId: 1, slot: 2 });
    expect(g.lastViewed).toMatchObject({ actor: 0, targetPlayer: 1, targetSlot: 2 });
  });

  it('7/8 看自己牌：记录目标槽位（lastViewed 指向自己，UI 播拿起动画）', () => {
    const s = makeGame([[card('A'), card('2'), card('3'), card('4')]], { deck: [card('7')], currentPlayer: 0 });
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'USE_ABILITY' });
    g = applyAction(g, { type: 'PICK_SELF_SLOT', slot: 2 });
    expect(g.lastViewed).toMatchObject({ actor: 0, targetPlayer: 0, targetSlot: 2 });
    expect(g.pending?.kind).toBe('revealDone');
  });

  it('K 明换查看对方：记录被看槽位（lastViewed 不含牌面）', () => {
    const s = makeGame(
      [[card('A'), card('2'), card('3'), card('4')], [card('5'), card('6'), card('7'), card('8')]],
      { deck: [card('K')], currentPlayer: 0 },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'USE_ABILITY' });
    g = applyAction(g, { type: 'PICK_SELF_SLOT', slot: 0 });
    g = applyAction(g, { type: 'PICK_OTHER', playerId: 1, slot: 1 });
    expect(g.lastViewed).toMatchObject({ actor: 0, targetPlayer: 1, targetSlot: 1 });
    expect(g.pending?.kind).toBe('confirmReveal');
  });
});

describe('定牌奖励（两档占比）', () => {
  function declaredGame(deckSize: number, playerCount: number, bonus: boolean) {
    const hands = Array.from({ length: playerCount }, () => [
      card('K'), card('Q'), card('J'), card('10'),
    ]);
    return makeGame(hands, {
      deck: [],
      declaredPlayer: 0,
      declaredDeckCount: deckSize,
      declareBonus: bonus,
      phase: 'final',
    });
  }

  it('2 人局：牌堆剩余 30（>=60%）减 2 分', () => {
    const s = declaredGame(30, 2, true);
    const ended = settle(s);
    expect(ended.players[0].score).toBe(handScore(ended.players[0].handSlots) - 2);
    expect(ended.winner).toContain(0);
  });

  it('2 人局：牌堆剩余 20（35%~60%）减 1 分', () => {
    const s = declaredGame(20, 2, true);
    const ended = settle(s);
    expect(ended.players[0].score).toBe(handScore(ended.players[0].handSlots) - 1);
  });

  it('2 人局：牌堆剩余 10（<35%）无奖励', () => {
    const s = declaredGame(10, 2, true);
    const ended = settle(s);
    expect(ended.players[0].score).toBe(handScore(ended.players[0].handSlots));
  });

  it('4 人局：牌堆剩余 23（>=60%）减 2 分', () => {
    const s = declaredGame(23, 4, true);
    const ended = settle(s);
    expect(ended.players[0].score).toBe(handScore(ended.players[0].handSlots) - 2);
  });

  it('4 人局：牌堆剩余 14（35%~60%）减 1 分', () => {
    const s = declaredGame(14, 4, true);
    const ended = settle(s);
    expect(ended.players[0].score).toBe(handScore(ended.players[0].handSlots) - 1);
  });

  it('未启用定牌奖励时无奖励', () => {
    const s = declaredGame(30, 2, false);
    const ended = settle(s);
    expect(ended.players[0].score).toBe(handScore(ended.players[0].handSlots));
  });

  it('无定牌者（牌堆耗尽结算）不触发奖励', () => {
    const s = makeGame(
      [[card('A'), card('2'), card('3'), card('4')], [card('5'), card('6'), card('7'), card('8')]],
      { deck: [], declaredPlayer: null, declaredDeckCount: 0, declareBonus: true, phase: 'playing' },
    );
    const ended = settle(s);
    expect(ended.players[0].score).toBe(handScore(ended.players[0].handSlots));
  });

  it('奖励使同分并列变为定牌者独赢', () => {
    const s = makeGame(
      [[card('A'), card('A'), card('A'), card('A')], [card('A'), card('A'), card('A'), card('A')]],
      { deck: [], declaredPlayer: 0, declaredDeckCount: 30, declareBonus: true, phase: 'final' },
    );
    const ended = settle(s);
    expect(ended.winner).toEqual([0]); // 定牌者 -2 后分数更低，并列变独赢
  });
});

describe('allowSelfFollow 开关', () => {
  it('关闭时：弃牌者直接 pass，其他玩家可跟弃', () => {
    const s = makeGame(
      [[card('A'), card('2'), card('3'), card('4')], [card('5'), card('6'), card('7'), card('8')]],
      { deck: [card('A'), card('5')], currentPlayer: 0, allowSelfFollow: false },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'DISCARD_DRAWN' });
    expect(g.phase).toBe('follow');
    expect(g.follow!.decisions[0]).toBe('pass'); // 弃牌者不可跟
    expect(g.follow!.decisions[1]).toBe('pending'); // 其他玩家可跟
    // 玩家 1 有同分 5？A=1 分，玩家 1 无 1 分牌 → 尝试跟弃失败罚牌
    const after = applyAction(g, { type: 'TRY_FOLLOW', playerId: 1, slot: 0 });
    expect(after.lastPenalty).not.toBeNull();
  });

  it('开启（默认）时：弃牌者也可跟弃（连弃两张同分）', () => {
    const s = makeGame(
      [[card('A'), card('A'), card('3'), card('4')], [card('5'), card('6'), card('7'), card('8')]],
      { deck: [card('A')], currentPlayer: 0 },
    );
    let g = applyAction(s, { type: 'DRAW' });
    g = applyAction(g, { type: 'DISCARD_DRAWN' }); // 弃 A(1 分)，玩家0 手牌还有 A
    expect(g.follow!.decisions[0]).toBe('pending');
    const after = applyAction(g, { type: 'TRY_FOLLOW', playerId: 0, slot: 0 });
    expect(after.follow?.submitted).toContain(0); // 弃牌者跟弃自己成功
  });
});

describe('引导局固定牌序', () => {
  it('玩家 1 前 4 次摸牌依次为 7/9/J/K', () => {
    const s = createGame({ playerCount: 2, botCount: 1, guided: true }, () => 0.5);
    // 2 人局回合交替：玩家 0 的摸牌位置 = deck[0]/[2]/[4]/[6]
    expect(s.deck[0].rank).toBe('7');
    expect(s.deck[2].rank).toBe('9');
    expect(s.deck[4].rank).toBe('J');
    expect(s.deck[6].rank).toBe('K');
    expect(countCards(s)).toBe(54);
  });

  it('引导局摸牌实际按剧本推进', () => {
    let s = createGame({ playerCount: 2, botCount: 1, guided: true }, () => 0.5);
    s = applyAction(s, { type: 'CONFIRM_DEAL', playerId: 0 });
    const ranks: string[] = [];
    let guard = 0;
    while (ranks.length < 4 && guard < 60) {
      guard++;
      if (s.pending?.kind === 'drawn') {
        if (s.currentPlayer === 0) ranks.push(s.pending.card.rank);
        s = applyAction(s, { type: 'DISCARD_DRAWN' });
      } else if (s.phase === 'follow' && s.follow) {
        for (const id of Object.keys(s.follow.decisions)) {
          const pid = Number(id);
          if (s.follow!.decisions[pid] === 'pending') s = applyAction(s, { type: 'PASS_FOLLOW', playerId: pid });
        }
      } else if (s.phase === 'playing') {
        s = applyAction(s, { type: 'DRAW' });
      } else {
        break;
      }
    }
    expect(ranks).toEqual(['7', '9', 'J', 'K']);
  });
});

describe('定牌奖励（declare 记录牌堆剩余，settle 结算减分）', () => {
  it('定牌时牌堆剩余 ≥60%：结算时定牌者手牌总分 −2', () => {
    const init = createGame({ playerCount: 2, botCount: 0, playerNames: ['甲', '乙'], declareBonus: true });
    // 完成发牌（真人直接确认）
    let g = applyAction(init, { type: 'CONFIRM_DEAL', playerId: 0 });
    g = applyAction(g, { type: 'CONFIRM_DEAL', playerId: 1 });
    // 定牌：牌堆剩余 54 - 8 = 46（>= 60%）
    g = applyAction(g, { type: 'DECLARE' });
    expect(g.declaredDeckCount).toBe(g.deck.length);
    const end = settle(g);
    const declared = end.players[end.declaredPlayer!];
    const rawScore = handScore(declared.handSlots);
    expect(declared.score).toBe(rawScore - 2);
  });

  it('未开启定牌奖励：不结算减分', () => {
    const init = createGame({ playerCount: 2, botCount: 0, playerNames: ['甲', '乙'], declareBonus: false });
    let g = applyAction(init, { type: 'CONFIRM_DEAL', playerId: 0 });
    g = applyAction(g, { type: 'CONFIRM_DEAL', playerId: 1 });
    g = applyAction(g, { type: 'DECLARE' });
    const end = settle(g);
    const declared = end.players[end.declaredPlayer!];
    expect(declared.score).toBe(handScore(declared.handSlots));
  });
});
