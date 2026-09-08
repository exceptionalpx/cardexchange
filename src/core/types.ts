// 换牌王核心类型定义

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'JOKER_SMALL'
  | 'JOKER_BIG';

export interface Card {
  id: string;
  suit: Suit | 'joker';
  rank: Rank;
}

/** 有功能的点数 */
export type Ability = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export type Phase = 'deal' | 'playing' | 'follow' | 'final' | 'end';

export interface PlayerState {
  id: number;
  name: string;
  isBot: boolean;
  /** 固定槽位，null 表示空；惩罚补牌在满槽时追加 */
  handSlots: (Card | null)[];
  /** 该玩家已确认看到的牌：cardId -> Card */
  knowledge: Record<string, Card>;
  /** 结算分数（end 阶段写入） */
  score?: number;
}

export type FollowDecision = 'pending' | 'follow' | 'pass';

/** 跟弃窗口状态 */
export interface FollowState {
  /** 弃牌者（不需要决策） */
  discarder: number;
  /** 可跟弃的同分数 */
  targetScore: number;
  /** 每个玩家的决策状态（key: 玩家 id） */
  decisions: Record<number, FollowDecision>;
  /** 按提交顺序记录的玩家 id，第一个为成功者 */
  submitted: number[];
}

/** 挂起的多步交互 */
export type PendingAction =
  | { kind: 'drawn'; card: Card } // 刚摸到的牌，等待处理
  | { kind: 'chooseSelfSlot'; purpose: 'view' | 'swap'; ability: Ability } // 选自己一张槽位
  | { kind: 'chooseOtherSlot'; purpose: 'view' | 'swap'; ability: Ability; selfSlot?: number } // 选其他玩家+槽位
  | {
      kind: 'confirmReveal';
      selfSlot: number;
      selfCard: Card;
      otherPlayer: number;
      otherSlot: number;
      otherCard: Card;
    }; // K 明换：双方牌已展示，决定换/不换

export interface LogEntry {
  playerId: number;
  text: string;
}

export interface GameState {
  deck: Card[];
  discardPile: Card[];
  players: PlayerState[];
  currentPlayer: number;
  phase: Phase;
  declaredPlayer: number | null;
  /** 触发跟弃窗口的弃牌（最近一次弃牌） */
  lastDiscard: Card | null;
  follow: FollowState | null;
  pending: PendingAction | null;
  /** 定牌后剩余待操作轮次（不含定牌玩家） */
  finalRemaining: number;
  winner: number[] | null;
  log: LogEntry[];
}

export interface GameConfig {
  /** 总人数 2~4 */
  playerCount: number;
  /** 机器人数量，0 ~ playerCount-1（默认 1 名真人，其余为机器人） */
  botCount: number;
  playerNames?: string[];
}

// ---- 动作定义 ----

export type Action =
  | { type: 'CONFIRM_DEAL' } // 发牌阶段确认盖牌
  | { type: 'DECLARE' } // 宣布定牌
  | { type: 'DRAW' } // 摸牌
  | { type: 'DISCARD_DRAWN' } // 弃掉刚摸到的牌
  | { type: 'REPLACE'; slot: number } // 用摸到的牌替换手牌槽位
  | { type: 'USE_ABILITY' } // 发动刚摸到的功能牌
  | { type: 'PICK_SELF_SLOT'; slot: number } // 选择自己的槽位（viewSelf / swap 前半）
  | { type: 'PICK_OTHER'; playerId: number; slot: number } // 选择其他玩家槽位（viewOther / swap 后半）
  | { type: 'SWAP' } // 明换：确认交换
  | { type: 'KEEP' } // 明换：不交换
  | { type: 'FOLLOW_DISCARD'; playerId: number } // 跟弃窗口：提交跟弃
  | { type: 'PASS_FOLLOW'; playerId: number }; // 跟弃窗口：放弃
