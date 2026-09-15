// 房间管理：座位、开局、服务器权威调度（AI + 超时）、per-viewer 广播
import type { WebSocket } from 'ws';
import type { Action, GameState } from '../src/core/types';
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
}

export interface Room {
  code: string;
  seats: Seat[];
  totalPlayers: number;
  botCount: number;
  hostId: number;
  state: GameState | null;
  timers: Set<ReturnType<typeof setTimeout>>;
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function genCode(exists: (code: string) => boolean): string {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (exists(code));
  return code;
}

export function createRoom(
  code: string,
  name: string,
  totalPlayers: number,
  botCount: number,
  avatar?: string,
): Room {
  const seats: Seat[] = [];
  for (let i = 0; i < totalPlayers; i++) {
    const isBot = i >= totalPlayers - botCount;
    seats.push({ id: i, name: isBot ? `机器人${i + 1}` : `玩家${i + 1}`, isBot, ws: null });
  }
  seats[0].name = name;
  seats[0].avatar = avatar;
  return { code, seats, totalPlayers, botCount, hostId: 0, state: null, timers: new Set() };
}

/** 找一个真人空位加入（房主座位 0 保留），返回座位号；房间已满返回 null */
export function joinRoom(room: Room, name: string, avatar?: string): number | null {
  const idx = room.seats.findIndex((s) => s.id !== room.hostId && !s.isBot && !s.ws);
  if (idx < 0) return null;
  room.seats[idx].name = name;
  room.seats[idx].avatar = avatar;
  return idx;
}

export function seatInfo(room: Room): RoomSeatInfo[] {
  return room.seats.map((s) => ({
    id: s.id,
    name: s.name,
    isBot: s.isBot,
    avatar: s.avatar,
    taken: s.isBot || !!s.ws,
  }));
}

/** 大厅展示用的房间摘要（不含任何牌面/座位明细） */
export interface RoomLite {
  code: string;
  hostName: string;
  /** 已加入的真人人数 */
  humanFilled: number;
  /** 真人位总数 */
  humanTotal: number;
  inGame: boolean;
}

export function roomLiteInfo(room: Room): RoomLite {
  const humans = room.seats.filter((s) => !s.isBot);
  return {
    code: room.code,
    hostName: room.seats[0]?.name ?? '',
    humanFilled: humans.filter((s) => !!s.ws).length,
    humanTotal: humans.length,
    inGame: !!room.state,
  };
}

export function canStart(room: Room): boolean {
  return room.state === null && room.seats.every((s) => s.isBot || !!s.ws);
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

  // 发牌：机器人自动看牌确认
  if (state.phase === 'deal' && cur.isBot) {
    room.timers.add(setTimeout(() => step(room, { type: 'CONFIRM_DEAL' }), 600));
    return;
  }
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
            broadcastView(room);
          }
        }, 4000),
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
  broadcastView(room);
}

// ---------- 玩家动作入口（服务器权威，基本防作弊） ----------

/** 动作是否允许该玩家提交 */
function allowed(room: Room, playerId: number, action: Action): boolean {
  const state = room.state;
  if (!state) return false;
  switch (action.type) {
    case 'TRY_FOLLOW':
    case 'PASS_FOLLOW':
      return action.playerId === playerId;
    default:
      return state.currentPlayer === playerId;
  }
}

export function handleAction(room: Room, playerId: number, action: Action): void {
  if (!allowed(room, playerId, action)) return;
  step(room, action);
}

// ---------- 对局生命周期 ----------

export function startGame(room: Room): void {
  if (!canStart(room)) return;
  room.state = createGame({
    playerCount: room.totalPlayers,
    botCount: room.botCount,
    playerNames: room.seats.map((s) => s.name),
    avatars: room.seats.map((s) => s.avatar),
  });
  schedule(room);
  broadcastView(room);
}

export function restartGame(room: Room): void {
  if (!room.state) return;
  room.state = createGame({
    playerCount: room.totalPlayers,
    botCount: room.botCount,
    playerNames: room.seats.map((s) => s.name),
    avatars: room.seats.map((s) => s.avatar),
  });
  schedule(room);
  broadcastView(room);
}

// ---------- 广播 ----------

export function broadcastView(room: Room): void {
  const state = room.state;
  if (!state) return;
  for (const seat of room.seats) {
    if (seat.isBot || !seat.ws || seat.ws.readyState !== 1) continue;
    seat.ws.send(JSON.stringify({ type: 'view', view: buildClientView(state, seat.id) }));
  }
}

export function broadcastRoom(room: Room): void {
  const seats = seatInfo(room);
  const canStartFlag = canStart(room);
  for (const seat of room.seats) {
    if (seat.isBot || !seat.ws || seat.ws.readyState !== 1) continue;
    seat.ws.send(
      JSON.stringify({
        type: 'roomUpdate',
        code: room.code,
        hostId: room.hostId,
        seats,
        canStart: canStartFlag,
      }),
    );
  }
}
