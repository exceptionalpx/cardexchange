// 联机服务器测试：房间管理 + 每玩家视角脱敏
import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/core/types';
import { applyAction, createGame } from '../src/core/engine';
import { buildClientView, sanitizePending } from '../server/sanitize';
import { canStart, createRoom, genCode, joinRoom, roomLiteInfo, seatInfo, startGame, handleAction } from '../server/rooms';

function toState(s: unknown): GameState {
  return s as GameState;
}

describe('房间管理', () => {
  it('创建房间：房主占 0 号位，机器人占尾座', () => {
    const room = createRoom('ABCD', '小明', 4, 1);
    expect(room.hostId).toBe(0);
    expect(room.seats[0].name).toBe('小明');
    expect(room.seats[0].isBot).toBe(false);
    expect(room.seats[3].isBot).toBe(true);
    expect(room.seats[1].isBot).toBe(false);
    expect(room.seats[2].isBot).toBe(false);
  });

  it('真人加入占据空位，满员后可开始', () => {
    const room = createRoom('ABCD', '小明', 4, 1);
    room.seats[0].ws = {} as never; // 房主已连接
    expect(canStart(room)).toBe(false);
    const seat1 = joinRoom(room, '小红');
    expect(seat1).toBe(1);
    if (seat1 !== null) room.seats[seat1].ws = {} as never; // 模拟连接
    expect(canStart(room)).toBe(false);
    const seat2 = joinRoom(room, '小刚');
    expect(seat2).toBe(2);
    if (seat2 !== null) room.seats[seat2].ws = {} as never;
    expect(canStart(room)).toBe(true); // 4 人：小明+小红+小刚+1 机器人 = 满
    expect(joinRoom(room, '第四人')).toBe(null); // 已满
  });

  it('房间码生成：4 位且不重复', () => {
    const seen = new Set<string>(['ABCD']);
    const code = genCode((c) => seen.has(c));
    expect(code).toHaveLength(4);
    expect(code).not.toBe('ABCD');
  });

  it('座位信息：机器人视为已占', () => {
    const room = createRoom('ABCD', '小明', 3, 1);
    const info = seatInfo(room);
    expect(info[0].taken).toBe(false); // 房主已连接但 ws 未设置前不算
    expect(info[2].taken).toBe(true); // 机器人
  });

  it('头像：房主带头像创建，加入者头像随座位更新', () => {
    const room = createRoom('ABCD', '小明', 3, 0, '🐱');
    expect(room.seats[0].avatar).toBe('🐱');
    const idx = joinRoom(room, '小红', '🦊');
    expect(idx).toBe(1);
    expect(room.seats[1].avatar).toBe('🦊');
    const info = seatInfo(room);
    expect(info[0].avatar).toBe('🐱');
    expect(info[1].avatar).toBe('🦊');
  });

  it('房间摘要：公开可加入信息，不泄露座位明细', () => {
    const room = createRoom('ABCD', '小明', 3, 1);
    room.seats[0].ws = {} as never;
    const lite = roomLiteInfo(room);
    expect(lite.code).toBe('ABCD');
    expect(lite.hostName).toBe('小明');
    expect(lite.humanTotal).toBe(2); // 3 人 - 1 机器人
    expect(lite.humanFilled).toBe(1); // 房主已连接
    expect(lite.inGame).toBe(false);
  });
});

describe('视角脱敏 sanitize', () => {
  it('联机发牌并行确认：handleAction 注入发送者座位，非 currentPlayer 的真人也可确认自己', () => {
    const room = createRoom('WXYZ', '小明', 2, 0);
    room.seats[0].ws = {} as never;
    joinRoom(room, '小红');
    room.seats[1].ws = {} as never;
    startGame(room);
    const s = toState(room.state);
    expect(s.phase).toBe('deal');
    expect(s.dealConfirmed).toEqual([false, false]);
    // 座位 1（小红）先确认，不是 currentPlayer(0)——服务器应注入其座位并放行
    handleAction(room, 1, { type: 'CONFIRM_DEAL' });
    expect(toState(room.state).dealConfirmed).toEqual([false, true]);
    expect(toState(room.state).phase).toBe('deal');
    // 座位 0（小明）确认后开局
    handleAction(room, 0, { type: 'CONFIRM_DEAL' });
    expect(toState(room.state).phase).toBe('playing');
    expect(toState(room.state).dealConfirmed).toEqual([true, true]);
    // 已确认玩家重复确认被拒（幂等）
    handleAction(room, 0, { type: 'CONFIRM_DEAL' });
    expect(toState(room.state).phase).toBe('playing');
  });

  it('drawn 摸牌：只有当前玩家可见牌面，其他玩家拿不到', () => {
    const s = toState(createGame({ playerCount: 2, botCount: 0 }));
    const s2 = toState(applyAction(s, { type: 'CONFIRM_DEAL' }));
    const s3 = toState(applyAction(s2, { type: 'CONFIRM_DEAL' }));
    const s4 = toState(applyAction(s3, { type: 'DRAW' }));
    expect(s4.pending?.kind).toBe('drawn');
    const pend = s4.pending!;

    // 当前玩家（0）看到真实牌
    const mine = sanitizePending(pend, 0, s4.currentPlayer);
    expect(mine?.kind === 'drawn' && mine.card).toBeTruthy();
    // 其他玩家（1）看不到牌面
    const theirs = sanitizePending(pend, 1, s4.currentPlayer);
    if (theirs?.kind === 'drawn') {
      expect(theirs.card).toBeUndefined();
    }
  });

  it('revealDone 翻看：只有查看者可见牌面', () => {
    const pend: import('../src/core/types').PendingAction = {
      kind: 'revealDone',
      card: { id: 'h7', suit: 'hearts', rank: '7' },
      viewer: 0,
    };
    // 查看者本人（viewer === 0）
    const viewer = sanitizePending(pend, 0, 0);
    expect(viewer?.kind === 'revealDone' && viewer.card).toBeTruthy();
    // 其他玩家看不到牌面
    const outsider = sanitizePending(pend, 1, 0);
    if (outsider?.kind === 'revealDone') {
      expect(outsider.card).toBeUndefined();
    }
  });

  it('buildClientView：knowledge 清空、deck 不下发、日志安全', () => {
    const s = toState(createGame({ playerCount: 2, botCount: 1, playerNames: ['小明', '机器人2'] }));
    // 发牌完成（仅真人小明确认；机器人开局已确认）
    let g = toState(applyAction(s, { type: 'CONFIRM_DEAL' }));
    // 摸一张牌进入 drawn
    g = toState(applyAction(g, { type: 'DRAW' }));

    const v0 = buildClientView(g, 0);
    expect(v0.deckCount).toBe(g.deck.length);
    expect(v0.players[0].knowledge).toEqual({});
    expect(v0.players[1].knowledge).toEqual({});
    // 功能区 / 动画数据透传（公开信息）
    expect(v0.usedPile).toEqual(g.usedPile);
    expect(v0.lastMove).toEqual(g.lastMove);
    // 玩家 0 自己视角：槽位可见自己的牌
    expect(v0.view.players[0].slots[0].known).toBe(true);
    // pending 牌面：玩家 0 是当前玩家 → 可见
    expect(v0.pending?.kind).toBe('drawn');
    if (v0.pending?.kind === 'drawn') expect(v0.pending.card).toBeTruthy();

    // 机器人视角（不向其推送，但验证脱敏逻辑对任意 viewer 成立）
    const v1 = buildClientView(g, 1);
    if (v1.pending?.kind === 'drawn') expect(v1.pending.card).toBeUndefined();
  });
});
