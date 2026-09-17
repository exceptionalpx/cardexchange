// 联机协议：客户端 ↔ 服务器消息类型
import type { Action, Card, GameConfig, GameState, LogEntry, PendingAction, Phase, PlayerState } from '../src/core/types';
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
  /** 跟弃窗口时长（客户端倒计时用，来自房间设置） */
  followWindowMs: number;
  /** 对局中已被托管（退出/掉线）的玩家 id 列表：其他玩家可见"托管中"标志 */
  aiControlled: number[];
  /** 是否启用定牌奖励（客户端据此显示牌堆上方的奖励门槛提示） */
  declareBonus: boolean;
  /** 本局定牌奖励分（0/1/2，结算页拆解"手牌分−定牌奖励=总分"用） */
  settleBonus: number;
}


/** 观战视图（全牌面）：观战者不在本局中，可看到所有玩家手牌与操作（方案A） */
export interface WatchView {
  type: 'watchView';
  roomCode: string;
  /** 全牌面玩家（槽位含牌面；score 在 end 阶段有值） */
  players: { id: number; name: string; avatar?: string; isBot: boolean; slots: (Card | null)[]; score?: number }[];
  deckCount: number;
  discardPile: Card[];
  usedPile: Card[];
  currentPlayer: number;
  phase: Phase;
  declaredPlayer: number | null;
  /** 挂起交互（全牌面，不脱敏） */
  pending: PendingAction | null;
  lastSwap: GameState['lastSwap'];
  lastMove: GameState['lastMove'];
  lastViewed: GameState['lastViewed'];
  lastPenalty: GameState['lastPenalty'];
  lastDiscard: GameState['lastDiscard'];
  /** 跟弃窗口公开信息（谁弃的、同分多少；不泄露他人决策细节） */
  follow: { discarder: number; targetScore: number } | null;
  finalRemaining: number;
  winner: number[] | null;
  /** 本局定牌奖励（结算页拆解用） */
  settleBonus: number;
  /** 是否启用定牌奖励（观战也显示牌堆上方奖励门槛提示） */
  declareBonus: boolean;
  totalScores: Record<number, number>;
  gamesPlayed: number;
  followWindowMs: number;
  aiControlled: number[];
}
export type ClientMessage =
  | { type: 'createRoom'; name: string; avatar?: string; config?: Partial<GameConfig> }
  | { type: 'joinRoom'; code: string; name: string; avatar?: string; config?: Partial<GameConfig> }
  | { type: 'addBot' }
  | { type: 'removeBot' }
  | { type: 'ready'; ready: boolean }
  | { type: 'startGame' }
  | { type: 'action'; action: Action }
  | { type: 'restart' }
  | { type: 'rejoin'; code: string; playerId: number; name: string; avatar?: string; config?: Partial<GameConfig> }
  | { type: 'emoji'; emoji: string }
  | { type: 'leave' }
  | { type: 'exitGame' }
  | { type: 'watchRoom'; code: string; name?: string }
  | { type: 'watchLeave' }
  | { type: 'checkSession'; code: string; playerId: number }
  | { type: 'watchEmoji'; code: string; text: string };

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
      inGame: boolean;
    }
  | {
      type: 'roomUpdate';
      code: string;
      hostId: number;
      seats: RoomSeatInfo[];
      canStart: boolean;
      totalScores: Record<number, number>;
      gamesPlayed: number;
      inGame: boolean;
    }
  | { type: 'gameStart'; myId: number }
  | {
      type: 'exitGame';
      code: string;
      playerId: number;
      hostId: number;
      seats: RoomSeatInfo[];
      canStart: boolean;
      totalScores: Record<number, number>;
      gamesPlayed: number;
      /** 是否仍在对局中（true=对局进行中，可回到对局） */
      inGame: boolean;
    }
  | { type: 'view'; view: ClientGameView }
  | { type: 'watchStart'; code: string; hostName: string }
  | { type: 'watchView'; view: WatchView }
  | { type: 'watchClosed'; message: string }
  | { type: 'roomClosed'; message: string }
  | { type: 'emoji'; from: number; emoji: string }
  | { type: 'sessionCheck'; valid: boolean; message?: string }
  | { type: 'chat'; name: string; text: string }
  | { type: 'error'; message: string };
