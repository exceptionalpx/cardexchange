// 联机服务器测试：房间管理（建房不锁人数/机器人增删/准备开局）+ 累计积分 + 每玩家视角脱敏
import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/core/types';
import { applyAction, createGame } from '../src/core/engine';
import { aiDecide } from '../src/core/ai';
import { buildClientView, buildWatchView, sanitizePending } from '../server/sanitize';
import {
  addBot,
  canStart,
  createRoom,
  genCode,
  joinRoom,
  removeBot,
  restartGame,
  roomLiteInfo,
  scoreIfEnded,
  seatInfo,
  setReady,
  startGame,
  handleAction,
  exitGame,
  takeover,
  uncontrol,
  leaveRoom,
  watchAllowed,
} from '../server/rooms';

function toState(s: unknown): GameState {
  return s as GameState;
}

describe('房间管理（建房不锁人数）', () => {
  it('创建房间：房主占 0 号位，其余 3 座为空位', () => {
    const room = createRoom('ABCD', '小明');
    expect(room.hostId).toBe(0);
    expect(room.seats[0].name).toBe('小明');
    expect(room.seats[0].isBot).toBe(false);
    expect(room.seats[0].ready).toBe(true); // 房主免准备：建房即已准备
    const info = seatInfo(room);
    for (let i = 1; i < 4; i++) {
      expect(info[i].taken).toBe(false); // 空位可加入
    }
    expect(canStart(room)).toBe(false); // 只有 1 人
  });

  it('添加/移除机器人：房主可把空位变机器人，也可移除', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    expect(addBot(room)).toBe(true);
    expect(room.seats[1].isBot).toBe(true);
    expect(room.seats[1].ready).toBe(true); // 机器人恒已准备
    expect(addBot(room)).toBe(true);
    expect(room.seats[2].isBot).toBe(true);
    // 房主免准备（已准备）+ 2 机器人 = 3 人全已准备 → 可直接开始
    expect(canStart(room)).toBe(true);
    // 移除机器人：从最后一个机器人开始
    expect(removeBot(room)).toBe(true);
    expect(room.seats[2].isBot).toBe(false);
    expect(removeBot(room)).toBe(true);
    expect(removeBot(room)).toBe(false); // 没有机器人了
  });

  it('对局中禁止添加/移除机器人', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    setReady(room, 0, true);
    startGame(room);
    expect(room.state).toBeTruthy();
    expect(addBot(room)).toBe(false);
    expect(removeBot(room)).toBe(false);
  });

  it('准备机制：所有真人准备 + 总人数≥2 才能开始', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room); // 房主 + 机器人
    setReady(room, 0, true);
    expect(canStart(room)).toBe(true); // 1 真人已准备 + 1 机器人 = 2 人

    // 真人加入后未准备 → 不可开始（机器人已占 1 号位，真人坐 2 号位）
    const seat2 = joinRoom(room, '小红');
    expect(seat2).toBe(2);
    if (seat2 !== null) room.seats[seat2].ws = {} as never;
    expect(canStart(room)).toBe(false);
    setReady(room, 2, true);
    expect(canStart(room)).toBe(true);
    // 取消准备 → 不可开始
    setReady(room, 2, false);
    expect(canStart(room)).toBe(false);
  });

  it('真人加入占据空位，满员后无法再加入', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    const s1 = joinRoom(room, '小红');
    if (s1 !== null) room.seats[s1].ws = {} as never;
    const s2 = joinRoom(room, '小刚');
    if (s2 !== null) room.seats[s2].ws = {} as never;
    const s3 = joinRoom(room, '小丽');
    if (s3 !== null) room.seats[s3].ws = {} as never;
    expect([s1, s2, s3]).toEqual([1, 2, 3]);
    expect(joinRoom(room, '第五人')).toBe(null); // 4 座已满
  });

  it('房间码生成：4 位且不重复', () => {
    const seen = new Set<string>(['ABCD']);
    const code = genCode((c) => seen.has(c));
    expect(code).toHaveLength(4);
    expect(code).not.toBe('ABCD');
  });

  it('座位信息：机器人与真人连接都视为已占，含准备状态', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    const info = seatInfo(room);
    expect(info[0].taken).toBe(true);
    expect(info[0].ready).toBe(true); // 房主免准备：建房即已准备
    expect(info[1].taken).toBe(true); // 机器人
    expect(info[1].ready).toBe(true);
    expect(info[2].taken).toBe(false); // 空位
  });

  it('房间摘要：公开可加入信息，不泄露座位明细', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    const lite = roomLiteInfo(room);
    expect(lite.code).toBe('ABCD');
    expect(lite.hostName).toBe('小明');
    expect(lite.humanTotal).toBe(3); // 4 - 1 机器人
    expect(lite.humanFilled).toBe(1); // 房主已连接
    expect(lite.inGame).toBe(false);
  });
});

describe('开局与座位映射', () => {
  it('机器人可任意座位：房主 + 机器人坐 1 号位，玩家 id 压缩连续', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    // 让真人加入坐 2 号位，机器人坐 1 号位 → 座位 2 真人、座位 1 机器人
    const seat2 = joinRoom(room, '小红');
    expect(seat2).toBe(1);
    room.seats[1].ws = {} as never;
    addBot(room); // 机器人坐 2 号位
    setReady(room, 0, true);
    setReady(room, 1, true);
    expect(canStart(room)).toBe(true);
    startGame(room);
    expect(room.state).toBeTruthy();
    expect(room.pidBySeat).toEqual([0, 1, 2, -1]);
    const s = toState(room.state);
    expect(s.players.length).toBe(3);
    expect(s.players[0].isBot).toBe(false); // 小明
    expect(s.players[1].isBot).toBe(false); // 小红
    expect(s.players[2].isBot).toBe(true); // 机器人
  });

  it('startGame：机器人坐任意位置时 isBot 按座位正确分配', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room); // 机器人 1 号位
    addBot(room); // 机器人 2 号位
    setReady(room, 0, true);
    startGame(room);
    const s = toState(room.state);
    expect(s.players.length).toBe(3);
    expect(s.players.map((p) => p.isBot)).toEqual([false, true, true]);
    // 机器人发牌自动确认，真人需确认
    expect(s.dealConfirmed).toEqual([false, true, true]);
  });
});

describe('多局累计积分', () => {
  function endedState(base: GameState, scores: number[]): GameState {
    return toState({
      ...base,
      phase: 'end',
      winner: [0],
      players: base.players.map((p, i) => ({ ...p, score: scores[i] ?? 0 })),
    });
  }

  it('对局结束累加手牌总分，重复调用不重复累加；再来一局后重新累计', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    setReady(room, 0, true);
    startGame(room);
    const base = toState(room.state);
    room.state = endedState(base, [10, 20]);
    scoreIfEnded(room);
    expect(room.gamesPlayed).toBe(1);
    expect(room.totalScores[0]).toBe(10);
    expect(room.totalScores[1]).toBe(20);
    // 幂等：同一局不再重复累加
    scoreIfEnded(room);
    expect(room.gamesPlayed).toBe(1);
    expect(room.totalScores[0]).toBe(10);

    // 再来一局：累计保留，第二局继续累加
    restartGame(room);
    expect(room.state?.phase).toBe('deal');
    const base2 = toState(room.state);
    room.state = endedState(base2, [5, 15]);
    scoreIfEnded(room);
    expect(room.gamesPlayed).toBe(2);
    expect(room.totalScores[0]).toBe(15);
    expect(room.totalScores[1]).toBe(35);
  });

  it('buildClientView 下发累计分时按对局玩家 id 对齐（座位号≠玩家 id）', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    setReady(room, 0, true);
    startGame(room);
    const base = toState(room.state);
    room.state = endedState(base, [10, 20]);
    scoreIfEnded(room);
    // 手动构造一次广播视图（与 broadcastView 相同口径）
    const view = buildClientView(toState(room.state), 0, {
      totalScores: { 0: 10, 1: 20 },
      gamesPlayed: 1,
    });
    expect(view.totalScores[0]).toBe(10);
    expect(view.totalScores[1]).toBe(20);
    expect(view.gamesPlayed).toBe(1);
  });
});

describe('视角脱敏 sanitize', () => {
  it('联机发牌并行确认：handleAction 注入发送者座位，非 currentPlayer 的真人也可确认自己', () => {
    const room = createRoom('WXYZ', '小明');
    room.seats[0].ws = {} as never;
    const seat1 = joinRoom(room, '小红');
    expect(seat1).toBe(1);
    if (seat1 !== null) room.seats[seat1].ws = {} as never;
    setReady(room, 0, true);
    setReady(room, 1, true);
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

  it('buildClientView：透传 lastDiscard；follow 脱敏（只告知本人是否可跟）', () => {
    const g = toState(createGame({ playerCount: 2, botCount: 0 }));
    const followState = toState({
      ...g,
      phase: 'follow',
      lastDiscard: { id: 'h6', suit: 'hearts', rank: '6' },
      follow: {
        discarder: 0,
        targetScore: 6,
        decisions: { 0: 'pass', 1: 'pending' },
        submitted: false,
      },
    });
    const v0 = buildClientView(followState, 0);
    expect(v0.lastDiscard?.id).toBe('h6'); // 最新弃牌公开透传（黑框/可跟弃标签）
    expect(v0.follow?.discarder).toBe(0);
    expect(v0.follow?.targetScore).toBe(6);
    expect(v0.follow?.canFollow).toBe(false); // 玩家 0 是 pass
    expect((v0.follow as unknown as { decisions?: unknown }).decisions).toBeUndefined(); // 不泄露他人 pending

    const v1 = buildClientView(followState, 1);
    expect(v1.follow?.canFollow).toBe(true); // 玩家 1 是 pending
    expect((v1.follow as unknown as { decisions?: unknown }).decisions).toBeUndefined();
  });
});

describe('退出对局与托管', () => {
  it('exitGame：对局中退出 → 该玩家进入托管集合；非对局返回 false', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    setReady(room, 0, true);
    expect(exitGame(room, 0)).toBe(false); // 未开局不能退出对局
    startGame(room);
    expect(room.state).toBeTruthy();
    expect(exitGame(room, 0)).toBe(true);
    expect(room.aiControlled.has(0)).toBe(true); // 房主 pid=0 进入托管
  });

  it('uncontrol：真人重进对局时解除托管', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    setReady(room, 0, true);
    startGame(room);
    exitGame(room, 0);
    expect(room.aiControlled.has(0)).toBe(true);
    uncontrol(room, 0);
    expect(room.aiControlled.has(0)).toBe(false);
  });

  it('takeover：轮到真人等待操作时退出，AI 立即接手不卡局（定时器调度）', async () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    setReady(room, 0, true);
    startGame(room);
    const human = room.pidBySeat![0];
    // 真人确认盖牌进入 playing
    handleAction(room, human, { type: 'CONFIRM_DEAL' });
    expect(room.state?.phase).toBe('playing');
    // 手动推进到真人回合（若轮到机器人则让其出招）
    let guard = 0;
    let st = room.state!;
    while (st.players[st.currentPlayer].isBot && guard < 30) {
      st = applyAction(st, aiDecide(st, st.currentPlayer));
      guard++;
    }
    // 真人摸牌，进入"等待真人选择"（drawn）——此时正是会卡住的场景
    st = applyAction(st, { type: 'DRAW' });
    room.state = st;
    expect(room.state.currentPlayer).toBe(human);
    expect(room.state.pending?.kind).toBe('drawn');
    // 真人退出 → 托管接管 → 立即调度 AI 出招
    exitGame(room, 0);
    takeover(room, human);
    await new Promise((r) => setTimeout(r, 1300)); // AI 700ms + 余量
    const after = room.state!;
    const stillStuck = after.pending?.kind === 'drawn' && after.currentPlayer === human;
    expect(stillStuck).toBe(false); // 不再卡在等待真人：AI 已接手推进
  });

  it('exitGame（主动退出）：座位标记 quit（本局不可 rejoin），与掉线区分', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    setReady(room, 0, true);
    startGame(room);
    exitGame(room, 0);
    expect(room.seats[0].quit).toBe(true); // 主动退出标记
    expect(room.seats[0].left).toBe(true); // 座位保留（托管代打）
    // 掉线（onDisconnect 路径）不设 quit：掉线玩家仍可 rejoin
    const room2 = createRoom('EFGH', '小红');
    room2.seats[0].ws = {} as never;
    addBot(room2);
    setReady(room2, 0, true);
    startGame(room2);
    // 模拟掉线：仅托管 + 断开连接，不调用 exitGame
    room2.aiControlled.add(0);
    room2.seats[0].ws = null;
    room2.seats[0].left = true;
    expect(room2.seats[0].quit).toBeUndefined();
  });

  it('restartGame：本局结束后释放主动退出者的座位为空位（可重新加入）', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    setReady(room, 0, true);
    startGame(room);
    exitGame(room, 0); // 房主主动退出
    expect(room.seats[0].quit).toBe(true);
    restartGame(room); // 本局结束再来一局
    expect(room.seats[0].quit).toBeUndefined(); // quit 标记清除
    expect(seatInfo(room)[0].taken).toBe(false); // 座位释放为空位
  });

  it('watchAllowed：对局参与者（含已退出）禁止观战本房间；路人放行', () => {
    const room = createRoom('WATC', '小明');
    room.seats[0].ws = {} as never;
    const s1 = joinRoom(room, '小红');
    expect(s1).toBe(1);
    if (s1 !== null) room.seats[s1].ws = {} as never;
    setReady(room, 0, true);
    setReady(room, 1, true);
    startGame(room);
    // 对局中参与者（座位号 → pid ≥ 0）→ 拒绝
    expect(watchAllowed(room, 0)).not.toBeNull();
    expect(watchAllowed(room, 1)).not.toBeNull();
    // 路人（无 playerId / 不属于本房间的座位号）→ 放行
    expect(watchAllowed(room, undefined)).toBeNull();
    expect(watchAllowed(room, 3)).toBeNull(); // 空位不是参与者
    // 主动退出后仍禁止观战（退出者既不能看牌也不能回来）
    exitGame(room, 0);
    expect(watchAllowed(room, 0)).not.toBeNull();
  });

  it('leaveRoom：仅大厅状态清空座位（名字/准备/连接）；对局中拒绝', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    setReady(room, 0, true);
    expect(leaveRoom(room, 0)).toBe(true);
    expect(room.seats[0].name).toBe('');
    expect(room.seats[0].ws).toBeNull();
    expect(room.seats[0].ready).toBe(false);
    // 对局中不可离开房间
    const room2 = createRoom('EFGH', '小明');
    room2.seats[0].ws = {} as never;
    addBot(room2);
    setReady(room2, 0, true);
    startGame(room2);
    expect(leaveRoom(room2, 0)).toBe(false);
  });

  it('buildClientView：透传 aiControlled（托管标志对局内所有玩家可见）', () => {
    const room = createRoom('ABCD', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    setReady(room, 0, true);
    startGame(room);
    exitGame(room, 0);
    const st = room.state;
    if (!st) throw new Error('state 缺失');
    const v0 = buildClientView(st, 1, {
      totalScores: {},
      gamesPlayed: 0,
      config: room.config,
      aiControlled: [...room.aiControlled],
    });
    expect(v0.aiControlled).toContain(0);
    expect(v0.aiControlled).toHaveLength(1);
  });
});

describe('观战视图（方案A 全牌面）', () => {
  it('buildWatchView：所有玩家手牌牌面、pending、弃牌堆全部可见；不脱敏', () => {
    const room = createRoom('WATC', '小明');
    room.seats[0].ws = {} as never;
    addBot(room);
    setReady(room, 0, true);
    startGame(room);
    const st = room.state;
    if (!st) throw new Error('state 缺失');
    const metaTotal: Record<number, number> = {};
    for (const [sid, v] of Object.entries(room.totalScores)) {
      const pid = room.pidBySeat?.[Number(sid)] ?? -1;
      if (pid >= 0) metaTotal[pid] = v;
    }
    const wv = buildWatchView(st, {
      roomCode: room.code,
      totalScores: metaTotal,
      gamesPlayed: room.gamesPlayed,
      followWindowMs: 3000,
      aiControlled: [...room.aiControlled],
      declareBonus: !!room.config.declareBonus,
    });
    expect(wv.type).toBe('watchView');
    expect(wv.players[0].slots.length).toBe(4);
    // 所有玩家牌面可见（观战者无信息隐藏）
    for (const p of wv.players) {
      for (const c of p.slots) {
        if (c) expect(c.id).toBeTruthy();
      }
    }
    expect(wv.deckCount).toBe(st.deck.length);
    expect(wv.discardPile).toEqual(st.discardPile);
    expect(wv.pending).toEqual(st.pending);
  });
});
