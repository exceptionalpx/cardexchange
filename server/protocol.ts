// 联机协议：客户端 ↔ 服务器消息类型
import type { Action, Card, GameState, LogEntry, PendingAction, Phase, PlayerState } from '../src/core/types';
import type { PlayerView } from '../src/core/view';

/** 大厅座位信息 */
export interface RoomSeatInfo {
  id: number;
  name: string;
  isBot: boolean;
  taken: boolean;
}

/** 服务器下发给单个玩家的对局视图（per-viewer 脱敏） */
export interface ClientGameView {
  viewerId: number;
  /** 牌堆剩余张数（不泄露牌面） */
  deckCount: number;
  /** 弃牌堆（公开） */
  discardPile: Card[];
  /** 玩家状态（knowledge 已清空，牌面由 view 槽位 + pending 控制） */
  players: PlayerState[];
  currentPlayer: number;
  phase: Phase;
  declaredPlayer: number | null;
  /** 挂起交互：牌面字段仅对有权查看的玩家可见，其余为 undefined */
  pending: PendingAction | null;
  lastSwap: GameState['lastSwap'];
  finalRemaining: number;
  winner: number[] | null;
  log: LogEntry[];
  /** 该玩家视角的槽位视图（含自身 knowledge 的牌面） */
  view: PlayerView;
}

export type ClientMessage =
  | { type: 'createRoom'; name: string; totalPlayers: number; botCount: number }
  | { type: 'joinRoom'; code: string; name: string }
  | { type: 'startGame' }
  | { type: 'action'; action: Action }
  | { type: 'restart' }
  | { type: 'rejoin'; code: string; playerId: number; name: string };

export type ServerMessage =
  | {
      type: 'joined';
      code: string;
      playerId: number;
      hostId: number;
      seats: RoomSeatInfo[];
      totalPlayers: number;
      botCount: number;
      canStart: boolean;
    }
  | { type: 'roomUpdate'; code: string; hostId: number; seats: RoomSeatInfo[]; canStart: boolean }
  | { type: 'gameStart'; myId: number }
  | { type: 'view'; view: ClientGameView }
  | { type: 'roomClosed'; message: string }
  | { type: 'error'; message: string };
