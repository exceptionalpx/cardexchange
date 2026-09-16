// 房间管理：座位、开局、服务器权威调度（AI + 超时）、per-viewer 广播
// 房间模型：固定 4 个座位，建房只占房主 1 座；房主可添加/移除机器人，真人加入坐空位；
// 所有真人"准备"后房主才能开局；对局后按座位累计总分（多局连打，总分最小者最终胜）。
import type { WebSocket } from 'ws';
import type { Action, GameConfig, GameState } from '../src/core/types';
import { applyAction, createGame } from '../src/core/engine';
import { aiDecide } from '../src/core/ai';
import { buildClientView } from './sanitize';
import type { RoomSeatInfo } from './protocol';

export interface Seat {
  id: number;
  name: string;
  isBot: boolean;
  /** 头像：内置 emoji 或 dataURL */
  avatar?: string;
  ws: WebSocket | null;
  /** 真人准备状态（机器人恒 true） */
  ready: boolean;
}

export interface Room {
  code: string;
  seats: Seat[];
  hostId: number;
  state: GameState | null;
  /** 对局内座位号 → 玩家 id 映射（压缩连续 id；未参与对局为 -1） */
  pidBySeat: number[] | null;
  timers: Set<ReturnType<typeof setTimeout>>;
  /** 按座位累计的手牌总分（多局连打） */
  totalScores: Record<number, number>;
  gamesPlayed: number;
  /** 本局是否已累计（restart 时重置，防止重复累加） */
  scoringDone: boolean;
  /** 房间游戏设置（跟弃窗口/定牌奖励/跟弃自己/机器人难度） */
  config: Partial<GameConfig>;
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const MAX_SEATS = 4;

export function genCode(exists: (code: string) => boolean): string {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (exists(code));
  return code;
}

export function emptySeat(id: number): Seat {
  return { id, name: '', isBot: false, ws: null, ready: false };
}

/** 建房：只占房主 1 座，其余 3 座为空位，人数/机器人由房主后续调整 */
export function createRoom(code: string, name: string, avatar?: string, config: Partial<GameConfig> = {}): Room {
  const seats: Seat[] = [
    { id: 0, name, isBot: false, ws: null, avatar, ready: false },
    emptySeat(1),
    emptySeat(2),
    emptySeat(3),
  ];
  return {
    code,
    seats,
    hostId: 0,
    state: null,
    pidBySeat: null,
    timers: new Set(),
    totalScores: {},
    gamesPlayed: 0,
    scoringDone: false,
    config,
  };
}

/** 找一个真人空位加入（房主座位 0 已占），返回座位号；房间已满返回 null */
export function joinRoom(room: Room, name: string, avatar?: string): number | null {
  const idx = room.seats.findIndex((s) => !s.isBot && !s.ws);
  if (idx < 0) return null;
  room.seats[idx].name = name;
  room.seats[idx].avatar = avatar;
  room.seats[idx].ready = false;
  return idx;
}

/** 房主添加一个机器人（把第一个空位变机器人）；无空位返回 false */
export function addBot(room: Room): boolean {
  if (room.state) return false; // 对局中锁定
  const idx = room.seats.findIndex((s) => !s.isBot && !s.ws);
  if (idx < 0) return false;
  const botN = room.seats.filter((s) => s.isBot).length + 1;
  room.seats[idx] = { id: idx, name: `机器人${botN}`, isBot: true, ws: null, ready: true };
  return true;
}

/** 房主移除最后一个机器人（变回空位）；无机器人返回 false */
export function removeBot(room: Room): boolean {
  if (room.state) return false; // 对局中锁定
  let idx = -1;
  for (let i = room.seats.length - 1; i >= 0; i--) {
    if (room.seats[i].isBot) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return false;
  room.seats[idx] = emptySeat(idx);
  return true;
}

/** 真人切换准备状态；机器人/对局中忽略 */
export function setReady(room: Room, seatId: number, ready: boolean): boolean {
  if (room.state) return false;
  const s = room.seats[seatId];
  if (!s || s.isBot || !s.ws) return false;
  s.ready = ready;
  return true;
}

export function seatInfo(room: Room): RoomSeatInfo[] {
  return room.seats.map((s) => ({
    id: s.id,
    name: s.name,
    isBot: s.isBot,
    avatar: s.avatar,
    taken: s.isBot || !!s.ws,
    ready: s.ready,
  }));
}

/** 大厅展示用的房间摘要（不含任何牌面/座位明细） */
export interface RoomLite {
  code: string;
  hostName: string;
  /** 已加入的真人人数 */
  humanFilled: number;
  /** 真人位总数（4 - 机器人数量，机器人占位不可加入） */
  humanTotal: number;
  inGame: boolean;
}

export function roomLiteInfo(room: Room): RoomLite {
  const humans = room.seats.filter((s) => !s.isBot);
  const bots = room.seats.filter((s) => s.isBot).length;
  return {
    code: room.code,
    hostName: room.seats[0]?.name ?? '',
    humanFilled: humans.filter((s) => !!s.ws).length,
    humanTotal: MAX_SEATS - bots,
    inGame: !!room.state,
  };
}

/** 能否开局：等待中 + 总人数 ≥2 + 至少 1 真人 + 所有真人已准备（空位不参与） */
export function canStart(room: Room): boolean {
  if (room.state) return false;
  const humans = room.seats.filter((s) => !s.isBot && !!s.ws);
  const occupied = room.seats.filter((s) => s.isBot || !!s.ws);
  if (occupied.length < 2 || humans.length === 0) return false;
  return humans.every((s) => s.ready);
}

export function clearTimers(room: Room): void {
  for (const t of room.timers) clearTimeout(t);
  room.timers.clear();
}

// ---------- 调度：AI 决策与超时 ----------

/** 对房间当前状态重新调度（清理旧定时器，幂等） */
function schedule(room: Room): void {
  clearTimers(room);
  const state = room.state;
  if (!state || state.phase === 'end') return;
  const cur = state.players[state.currentPlayer];

  // 发牌阶段：机器人开局已确认（createGame dealConfirmed=true），真人各自点击确认，无需服务器调度
  // 正常回合：机器人决策
  if ((state.phase === 'playing' || state.phase === 'final') && cur.isBot) {
    room.timers.add(setTimeout(() => step(room, aiDecide(state, cur.id)), 700));
    return;
  }
  // 翻看展示：机器人立即收起；真人 5 秒兜底超时（客户端也会主动提交，幂等）
  if (state.pending?.kind === 'revealDone') {
    const viewer = state.players[state.pending.viewer];
    const delay = viewer.isBot ? 300 : 5000;
    room.timers.add(setTimeout(() => step(room, { type: 'REVEAL_DONE' }), delay));
    return;
  }
  // K 明换：机器人自动决策；真人决定界面始终可见（不自动，等玩家操作）
  if (state.pending?.kind === 'confirmReveal') {
    if (cur.isBot) room.timers.add(setTimeout(() => step(room, aiDecide(state, cur.id)), 500));
    return;
  }
  // 跟弃窗口：机器人随机反应 0.5~2.5s；真人未决策 4 秒视为放弃
  if (state.phase === 'follow' && state.follow) {
    let hasHumanPending = false;
    for (const [idStr, d] of Object.entries(state.follow.decisions)) {
      const id = Number(idStr);
      if (d !== 'pending') continue;
      if (state.players[id].isBot) {
        room.timers.add(setTimeout(() => step(room, aiDecide(state, id)), 500 + Math.random() * 2000));
      } else {
        hasHumanPending = true;
      }
    }
    if (hasHumanPending) {
      room.timers.add(
        setTimeout(() => {
          const s = room.state;
          if (!s || s.phase !== 'follow' || !s.follow) return;
          let ns = s;
          for (const [idStr, d] of Object.entries(s.follow.decisions)) {
            if (d === 'pending' && !s.players[Number(idStr)].isBot) {
              ns = applyAction(ns, { type: 'PASS_FOLLOW', playerId: Number(idStr) });
            }
          }
          if (ns !== s) {
            room.state = ns;
            schedule(room);
            scoreIfEnded(room);
            broadcastView(room);
          }
        }, room.config.followWindowMs ?? 3000),
      );
    }
  }
}

function step(room: Room, action: Action): void {
  const state = room.state;
  if (!state) return;
  const next = applyAction(state, action);
  if (next === state) return; // 非法或无变化（幂等）
  room.state = next;
  schedule(room);
  scoreIfEnded(room);
  broadcastView(room);
}

// ---------- 玩家动作入口（服务器权威，基本防作弊） ----------

/** 动作是否允许该玩家提交 */
function allowed(room: Room, playerId: number, action: Action): boolean {
  const state = room.state;
  if (!state) return false;
  switch (action.type) {
    case 'CONFIRM_DEAL':
      // 发牌阶段：真人可确认自己（联机并行确认，不要求是 currentPlayer）
      return (
        state.phase === 'deal' &&
        !state.players[playerId].isBot &&
        !state.dealConfirmed[playerId]
      );
    case 'TRY_FOLLOW':
    case 'PASS_FOLLOW':
      return action.playerId === playerId;
    default:
      return state.currentPlayer === playerId;
  }
}

export function handleAction(room: Room, playerId: number, action: Action): void {
  if (!allowed(room, playerId, action)) return;
  // 联机发牌：确认动作归属注入为发送者座位（客户端无需自行传座位号）
  const effective: Action =
    action.type === 'CONFIRM_DEAL' ? { type: 'CONFIRM_DEAL', playerId } : action;
  step(room, effective);
}

// ---------- 对局生命周期 ----------

/** 开局：把占用座位压缩为连续玩家 id（座位号 → pid 映射进 pidBySeat） */
export function startGame(room: Room): void {
  if (!canStart(room)) return;
  const occupied = room.seats.filter((s) => s.isBot || !!s.ws);
  if (occupied.length < 2) return;
  const count = occupied.length;
  room.pidBySeat = room.seats.map((s) => {
    const i = occupied.indexOf(s);
    return i >= 0 ? i : -1;
  });
  room.scoringDone = false;
  room.state = createGame({
    ...room.config,
    playerCount: count,
    botCount: occupied.filter((s) => s.isBot).length,
    playerNames: occupied.map((s) => s.name),
    avatars: occupied.map((s) => s.avatar),
    bots: occupied.map((s) => s.isBot),
  });
  schedule(room);
  broadcastView(room);
}

export function restartGame(room: Room): void {
  if (!room.state) return;
  const occupied = room.seats.filter((s) => s.isBot || !!s.ws);
  if (occupied.length < 2) return;
  const count = occupied.length;
  room.pidBySeat = room.seats.map((s) => {
    const i = occupied.indexOf(s);
    return i >= 0 ? i : -1;
  });
  room.scoringDone = false;
  room.state = createGame({
    ...room.config,
    playerCount: count,
    botCount: occupied.filter((s) => s.isBot).length,
    playerNames: occupied.map((s) => s.name),
    avatars: occupied.map((s) => s.avatar),
    bots: occupied.map((s) => s.isBot),
  });
  schedule(room);
  broadcastView(room);
}

/** 结算：对局结束且本局未累计过 → 按座位累加手牌总分 */
export function scoreIfEnded(room: Room): void {
  const st = room.state;
  if (!st || st.phase !== 'end' || room.scoringDone) return;
  room.scoringDone = true;
  room.gamesPlayed += 1;
  for (let pid = 0; pid < st.players.length; pid++) {
    const seatId = room.seats.findIndex((s) => room.pidBySeat?.[s.id] === pid);
    if (seatId >= 0) {
      room.totalScores[seatId] = (room.totalScores[seatId] ?? 0) + (st.players[pid].score ?? 0);
    }
  }
}

// ---------- 广播 ----------

export function broadcastView(room: Room): void {
  const state = room.state;
  if (!state) return;
  // 累计分按"对局内玩家 id"对齐下发（结算页 players 用 pid，座位号与 pid 不同）
  const metaTotal: Record<number, number> = {};
  for (const [seatIdStr, v] of Object.entries(room.totalScores)) {
    const pid = room.pidBySeat?.[Number(seatIdStr)] ?? -1;
    if (pid >= 0) metaTotal[pid] = v;
  }
  for (const seat of room.seats) {
    if (seat.isBot || !seat.ws || seat.ws.readyState !== 1) continue;
    const pid = room.pidBySeat?.[seat.id] ?? -1;
    if (pid < 0) continue;
    seat.ws.send(
      JSON.stringify({
        type: 'view',
        view: buildClientView(state, pid, { totalScores: metaTotal, gamesPlayed: room.gamesPlayed, config: room.config }),
      }),
    );
  }
}

/** 对局中表情广播：发给同房其他真人（发送者本地自己显示 toast） */
export function broadcastEmoji(room: Room, fromSeat: number, emoji: string): void {
  if (!room.state) return;
  const fromPid = room.pidBySeat?.[fromSeat] ?? -1;
  if (fromPid < 0) return;
  for (const seat of room.seats) {
    if (seat.isBot || !seat.ws || seat.ws.readyState !== 1) continue;
    if (seat.id === fromSeat) continue; // 发送者本地已显示，避免重复
    seat.ws.send(JSON.stringify({ type: 'emoji', from: fromPid, emoji }));
  }
}

export function broadcastRoom(room: Room): void {
  const seats = seatInfo(room);
  const canStartFlag = canStart(room);
  const totalScores = room.totalScores;
  const gamesPlayed = room.gamesPlayed;
  for (const seat of room.seats) {
    if (seat.isBot || !seat.ws || seat.ws.readyState !== 1) continue;
    seat.ws.send(
      JSON.stringify({
        type: 'roomUpdate',
        code: room.code,
        hostId: room.hostId,
        seats,
        canStart: canStartFlag,
        totalScores,
        gamesPlayed,
      }),
    );
  }
}
