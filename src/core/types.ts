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
  /** 头像：内置 emoji 或上传头像的 dataURL（本机保存，联机随座位同步） */
  avatar?: string;
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
  | { kind: 'chooseSelfSlot'; purpose: 'view'; ability: Ability } // 选自己一张槽位（7/8 看自己）
  | { kind: 'chooseOtherSlot'; purpose: 'view'; ability: Ability } // 选其他玩家+槽位（9/10 看他人）
  | {
      kind: 'chooseSwap';
      ability: Ability; // J/Q/K 换牌：自己与对方各选一张，任意顺序；选完即执行（K 进入 confirmReveal）
      selfSlot: number | null;
      otherPlayer: number | null;
      otherSlot: number | null;
    }
  | {
      kind: 'confirmReveal';
      selfSlot: number;
      selfCard: Card;
      otherPlayer: number;
      otherSlot: number;
      otherCard: Card;
    } // K 明换：双方牌已展示，决定换/不换
  | { kind: 'revealDone'; card: Card; viewer: number }; // 7/8、9/10 翻看：牌面已展示，等待确认收起（限时）；viewer 为查看者（机器人查看不向玩家亮牌）

export interface LogEntry {
  playerId: number;
  text: string;
}

export interface GameState {
  deck: Card[];
  discardPile: Card[];
  /** 发动过功能的牌（7/8/9/10/J/Q/K 用掉后进入已使用功能牌区，不混入弃牌堆） */
  usedPile: Card[];
  players: PlayerState[];
  currentPlayer: number;
  phase: Phase;
  /** 发牌阶段各玩家是否已确认盖牌（机器人开局即 true；真人各自确认，联机可并行） */
  dealConfirmed: boolean[];
  declaredPlayer: number | null;
  /** 触发跟弃窗口的弃牌（最近一次弃牌） */
  lastDiscard: Card | null;
  follow: FollowState | null;
  pending: PendingAction | null;
  /** 最近一次换牌（暗换 J/Q、明换 K 交换）双方换入的槽位，UI 据此标记 3 秒；seq 单调递增供动画防重 */
  lastSwap: {
    actor: number;
    selfPlayer: number;
    selfSlot: number;
    otherPlayer: number;
    otherSlot: number;
    seq: number;
  } | null;
  /** 最近一次弃牌/替换动作（动画数据：弃牌/被替换旧牌会公开进弃牌堆，故可含牌面；替换新牌保密不含） */
  lastMove:
    | { kind: 'discard'; actor: number; card: Card; seq: number } // 弃牌：座位 → 弃牌堆（真实牌面）
    | { kind: 'replace'; actor: number; slot: number; replaced: Card; seq: number } // 替换：新牌（背面）座位 → 槽位；被替换旧牌（真实牌面）槽位 → 弃牌堆
    | null;
  /** 最近一次"看牌"动作（9/10 看他人 / K 明换查看对方），目标牌被拿起放下提示动画；不含牌面 */
  lastViewed: { actor: number; targetPlayer: number; targetSlot: number; seq: number } | null;
  /** 最近一次跟弃失败的惩罚补牌（牌从牌堆飞入被罚玩家槽位，背面飞行，不含牌面） */
  lastPenalty: { actor: number; slot: number; seq: number } | null;
  /** 动画事件号：每次写 lastSwap/lastMove/lastViewed/lastPenalty 时 +1（客户端按 seq 防重，内容相同的新事件也播放） */
  animSeq: number;
  /** 定牌后剩余待操作轮次（不含定牌玩家） */
  finalRemaining: number;
  /** 定牌时牌堆剩余张数（结算定牌奖励用） */
  declaredDeckCount?: number;
  /** 本局实际生效的定牌奖励分（0/1/2，结算时写入，结算页拆解展示用） */
  settleBonus: number;
  /** 是否允许弃牌者自己跟弃（引擎规则开关，默认 true） */
  allowSelfFollow: boolean;
  /** 是否启用定牌奖励（引擎规则开关） */
  declareBonus: boolean;
  /** 机器人记忆误差概率（AI 决策用，0=完美记忆） */
  botMemory: number;
  winner: number[] | null;
  log: LogEntry[];
}

export interface GameConfig {
  /** 总人数 2~4 */
  playerCount: number;
  /** 机器人数量，0 ~ playerCount-1（默认 1 名真人，其余为机器人；与 bots 二选一，bots 优先） */
  botCount: number;
  playerNames?: string[];
  /** 各座位头像（emoji 或 dataURL，可选，与座位号对齐；未设置的座位为 undefined） */
  avatars?: (string | undefined)[];
  /** 各座位是否机器人（可选：联机房间座位可任意位置混坐；缺省按 botCount 让机器人坐末尾） */
  bots?: boolean[];
  /** 跟弃窗口毫秒（2000/3000/4000，默认 3000） */
  followWindowMs?: number;
  /** 启用定牌奖励：提前定牌按牌堆剩余占比结算减分（默认 false） */
  declareBonus?: boolean;
  /** 是否允许弃牌者自己跟弃（默认 true） */
  allowSelfFollow?: boolean;
  /** 机器人记忆误差概率（0/0.2/0.4，默认 0=完美记忆） */
  botMemory?: number;
  /** 引导局：固定剧本牌序（玩家 1 前 4 次摸牌为 7/9/J/K）+ 步骤提示 */
  guided?: boolean;
}

// ---- 动作定义 ----

export type Action =
  | { type: 'CONFIRM_DEAL'; playerId?: number } // 发牌阶段确认盖牌（联机传自己的座位号；热座可不传，按当前玩家）
  | { type: 'DECLARE' } // 宣布定牌
  | { type: 'DRAW' } // 摸牌
  | { type: 'DISCARD_DRAWN' } // 弃掉刚摸到的牌
  | { type: 'REPLACE'; slot: number } // 用摸到的牌替换手牌槽位
  | { type: 'USE_ABILITY' } // 发动刚摸到的功能牌
  | { type: 'PICK_SELF_SLOT'; slot: number } // 选择自己的槽位（7/8 看自己；换牌选择其一）
  | { type: 'PICK_OTHER'; playerId: number; slot: number } // 选择其他玩家槽位（9/10 看他人；换牌选择其一）
  | { type: 'SWAP' } // 明换：确认交换
  | { type: 'KEEP' } // 明换：不交换
  | { type: 'TRY_FOLLOW'; playerId: number; slot: number } // 点击手牌下方"弃"按钮：尝试跟弃（失败则惩罚补牌）
  | { type: 'PASS_FOLLOW'; playerId: number } // 跟弃窗口：放弃
  | { type: 'REVEAL_DONE' }; // 翻看确认：收起牌面并结束回合
