// 联机协议：客户端 ↔ 服务器消息类型
import type { Action, Card, GameState, LogEntry, PendingAction, Phase, PlayerState } from '../src/core/types';
import type { PlayerView } from '../src/core/view';

/** 大厅座位信息 */
export interface RoomSeatInfo {
  id: number;
  name: string;
  isBot: boolean;
  /** 头像（emoji 或 dataURL，本机保存随座位同步） */
  avatar?: string;
  taken: boolean;
  /** 真人准备状态（机器人恒 true） */
  ready: boolean;
}

/** 服务器下发给单个玩家的对局视图（per-viewer 脱敏） */
export interface ClientGameView {
  viewerId: number;
  /** 牌堆剩余张数（不泄露牌面） */
  deckCount: number;
  /** 弃牌堆（公开） */
  discardPile: Card[];
  /** 功能区：发动过功能的牌（公开） */
  usedPile: Card[];
  /** 玩家状态（knowledge 已清空，牌面由 view 槽位 + pending 控制） */
  players: PlayerState[];
  currentPlayer: number;
  phase: Phase;
  /** 发牌阶段各玩家是否已确认盖牌（客户端据此显示"自己是否已盖/等待他人"） */
  dealConfirmed: boolean[];
  declaredPlayer: number | null;
  /** 挂起交互：牌面字段仅对有权查看的玩家可见，其余为 undefined */
  pending: PendingAction | null;
  lastSwap: GameState['lastSwap'];
  lastMove: GameState['lastMove'];
  lastViewed: GameState['lastViewed'];
  lastPenalty: GameState['lastPenalty'];
  /** 最新一次弃牌（黑框 + "可跟弃"提示用；公开信息） */
  lastDiscard: GameState['lastDiscard'];
  /** 跟弃窗口脱敏信息（不泄露他人是否可跟） */
  follow: { discarder: number; targetScore: number; canFollow: boolean } | null;
  finalRemaining: number;
  winner: number[] | null;
  log: LogEntry[];
  /** 该玩家视角的槽位视图（含自身 knowledge 的牌面） */
  view: PlayerView;
  /** 多局累计总分（按座位，公开结算信息） */
  totalScores: Record<number, number>;
  /** 已玩局数 */
  gamesPlayed: number;
}

export type ClientMessage =
  | { type: 'createRoom'; name: string; avatar?: string }
  | { type: 'joinRoom'; code: string; name: string; avatar?: string }
  | { type: 'addBot' }
  | { type: 'removeBot' }
  | { type: 'ready'; ready: boolean }
  | { type: 'startGame' }
  | { type: 'action'; action: Action }
  | { type: 'restart' }
  | { type: 'rejoin'; code: string; playerId: number; name: string; avatar?: string };

export type ServerMessage =
  | {
      type: 'joined';
      code: string;
      playerId: number;
      hostId: number;
      seats: RoomSeatInfo[];
      canStart: boolean;
      totalScores: Record<number, number>;
      gamesPlayed: number;
    }
  | {
      type: 'roomUpdate';
      code: string;
      hostId: number;
      seats: RoomSeatInfo[];
      canStart: boolean;
      totalScores: Record<number, number>;
      gamesPlayed: number;
    }
  | { type: 'gameStart'; myId: number }
  | { type: 'view'; view: ClientGameView }
  | { type: 'roomClosed'; message: string }
  | { type: 'error'; message: string };
