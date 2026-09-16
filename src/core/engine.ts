// 规则引擎：不可变状态机
// MVP 口径：
//  1. 功能牌发动功能后进入弃牌堆，不触发跟弃窗口（视为功能消耗而非分数弃牌）。
//  2. 跟弃不连锁：跟弃成功的牌不再触发新的跟弃窗口。
//  3. 惩罚补牌：从牌堆盲摸一张（不写入 knowledge），手牌满 4 张时追加槽位。
//  4. final 阶段（定牌后）不能再定牌，且换牌目标不能是已定牌玩家。
//  5. 点击手牌下方"弃"按钮即尝试跟弃：窗口内 + 该牌同分 + 抢到第一则成功，否则失败惩罚补牌。
//  6. 7/8、9/10 翻看后进入 revealDone 待确认（UI 限时展示牌面，确认后才结束回合）。
//  7. 跟弃窗口不主动提示（日志仅记录弃牌信息），是否跟弃由玩家自行判断。
import type {
  Action,
  Card,
  FollowDecision,
  FollowState,
  GameConfig,
  GameState,
  LogEntry,
  PlayerState,
} from './types';
import { buildDeck, drawCard, shuffle } from './deck';
import { handScore, scoreOf } from './score';

export const ABILITY_RANKS = new Set(['7', '8', '9', '10', 'J', 'Q', 'K']);

// ---------- 工具 ----------

function nextPlayer(state: GameState, from: number): number {
  return (from + 1) % state.players.length;
}

function log(_state: GameState, playerId: number, text: string): LogEntry {
  return { playerId, text };
}

function removeKnowledge(p: PlayerState, cardId: string): PlayerState {
  if (!(cardId in p.knowledge)) return p;
  const knowledge = { ...p.knowledge };
  delete knowledge[cardId];
  return { ...p, knowledge };
}

function addKnowledge(p: PlayerState, card: Card): PlayerState {
  return { ...p, knowledge: { ...p.knowledge, [card.id]: card } };
}

/** 盲摸一张惩罚牌：空槽优先，满槽追加；牌堆空则无牌可补；返回落位 slot（未补到为 -1） */
function addPenaltyCard(
  p: PlayerState,
  deck: Card[],
): { player: PlayerState; deck: Card[]; got: Card | null; slot: number } {
  const [card, rest] = drawCard(deck);
  if (!card) return { player: p, deck: rest, got: null, slot: -1 };
  const slots = [...p.handSlots];
  const idx = slots.findIndex((s) => s === null);
  if (idx >= 0) {
    slots[idx] = card;
  } else {
    slots.push(card);
  }
  return { player: { ...p, handSlots: slots }, deck: rest, got: card, slot: idx >= 0 ? idx : slots.length - 1 };
}


function playerName(state: GameState, id: number): string {
  return state.players[id].name;
}

function cardLabel(card: Card): string {
  if (card.rank === 'JOKER_BIG') return '大王';
  if (card.rank === 'JOKER_SMALL') return '小王';
  const suitMap: Record<string, string> = {
    spades: '♠',
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
  };
  return `${suitMap[card.suit as string]}${card.rank}`;
}

// ---------- 初始化 ----------

/** 真人玩家默认头像池（未选择/未配置时按座位自动取，保证对局中每人都有头像） */
const PLAYER_AVATARS = ['🐯', '🦁', '🐼', '🐨', '🦊', '🐸', '🐧', '🐰', '🐶', '🐱', '🦄', '🐻'];

export function createGame(config: GameConfig, rng: () => number = Math.random): GameState {
  const count = Math.min(4, Math.max(2, config.playerCount));
  const botCount = Math.min(count - 1, Math.max(0, config.botCount));
  let deck = shuffle(buildDeck(), rng);
  if (config.guided) deck = buildGuidedDeck(deck, count);

  const players: PlayerState[] = [];
  const bots = config.bots; // 联机房间：机器人可任意座位
  for (let i = 0; i < count; i++) {
    // 真人玩家优先为前几位；若提供 bots 数组则按数组判定（支持任意位置混坐）
    const isBot = bots ? !!bots[i] : i >= count - botCount;
    const name = config.playerNames?.[i] ?? (isBot ? `机器人${i + 1}` : `玩家${i + 1}`);
    // 头像：机器人统一用机器人头像；真人优先用自己选的，空串/未配置从真人默认池按座位分配
    const chosen = (config.avatars?.[i] || '').trim();
    const avatar = isBot ? '🤖' : chosen || PLAYER_AVATARS[i % PLAYER_AVATARS.length];
    const handSlots: (Card | null)[] = deck.slice(i * 4, i * 4 + 4);
    players.push({ id: i, name, isBot, avatar, handSlots, knowledge: {} });
  }
  const remainingDeck = deck.slice(count * 4);

  return {
    deck: remainingDeck,
    discardPile: [],
    usedPile: [],
    players,
    currentPlayer: 0,
    phase: 'deal',
    dealConfirmed: players.map((p) => p.isBot), // 机器人发牌无需看牌，开局即确认
    declaredPlayer: null,
    lastDiscard: null,
    follow: null,
    pending: null,
    lastSwap: null,
    lastMove: null,
    lastViewed: null,
    lastPenalty: null,
    animSeq: 0,
    finalRemaining: 0,
    declaredDeckCount: undefined,
    allowSelfFollow: config.allowSelfFollow !== false,
    declareBonus: !!config.declareBonus,
    botMemory: config.botMemory ?? 0,
    winner: null,
    log: [],
  };
}


/** 引导局固定剧本：抽出 7/9/J/K 各一张，放到玩家 1 前 4 次摸牌位置（牌堆顶部），依次演示 看自己→看他人→暗换→明换 */
function buildGuidedDeck(deck: Card[], count: number): Card[] {
  const picks: (Card | null)[] = [null, null, null, null];
  const rest: Card[] = [];
  const want = ['7', '9', 'J', 'K'];
  for (const c of deck) {
    const wi = want.indexOf(c.rank);
    if (wi >= 0 && !picks[wi]) picks[wi] = c;
    else rest.push(c);
  }
  const ordered = picks as Card[]; // 顺序即 7,9,J,K
  const head = rest.slice(0, count * 4); // 初始发牌区
  const tail = rest.slice(count * 4); // 摸牌区
  return [...head, ...ordered, ...tail];
}

// ---------- 校验 ----------

export function canApply(state: GameState, action: Action): boolean {
  switch (action.type) {
    case 'CONFIRM_DEAL': {
      if (state.phase !== 'deal') return false;
      const pid = action.playerId ?? state.currentPlayer;
      const p = state.players[pid];
      return !!p && !p.isBot && !state.dealConfirmed[pid];
    }
    case 'DECLARE':
      return (
        state.phase === 'playing' &&
        state.pending === null &&
        state.declaredPlayer === null
      );
    case 'DRAW':
      return (state.phase === 'playing' || state.phase === 'final') && state.pending === null;
    case 'DISCARD_DRAWN':
      return state.pending?.kind === 'drawn';
    case 'REPLACE': {
      if (state.pending?.kind !== 'drawn') return false;
      const me = state.players[state.currentPlayer];
      return action.slot >= 0 && action.slot < me.handSlots.length && me.handSlots[action.slot] !== null;
    }
    case 'USE_ABILITY': {
      const drawn = state.pending;
      if (drawn?.kind !== 'drawn' || !ABILITY_RANKS.has(drawn.card.rank)) return false;
      // J/Q/K 换牌功能要求存在合法换牌目标（不能是自己或已定牌玩家，且手牌非空）
      if (drawn.card.rank === 'J' || drawn.card.rank === 'Q' || drawn.card.rank === 'K') {
        return state.players.some(
          (p) =>
            p.id !== state.currentPlayer &&
            p.id !== state.declaredPlayer &&
            p.handSlots.some((c) => c !== null),
        );
      }
      return true;
    }
    case 'PICK_SELF_SLOT': {
      const pend = state.pending;
      if (!pend) return false;
      if (pend.kind !== 'chooseSelfSlot' && pend.kind !== 'chooseSwap') return false;
      const me = state.players[state.currentPlayer];
      return action.slot >= 0 && action.slot < me.handSlots.length && me.handSlots[action.slot] !== null;
    }
    case 'PICK_OTHER': {
      const pend = state.pending;
      if (!pend) return false;
      if (pend.kind !== 'chooseOtherSlot' && pend.kind !== 'chooseSwap') return false;
      if (action.playerId < 0 || action.playerId >= state.players.length) return false;
      if (action.playerId === state.currentPlayer) return false;
      const target = state.players[action.playerId];
      if (action.slot < 0 || action.slot >= target.handSlots.length) return false;
      if (target.handSlots[action.slot] === null) return false;
      // 定牌后不能对已定牌玩家换牌（看牌允许）
      if (pend.kind === 'chooseSwap' && state.declaredPlayer === action.playerId) return false;
      return true;
    }
    case 'SWAP':
    case 'KEEP':
      return state.pending?.kind === 'confirmReveal';
    case 'TRY_FOLLOW': {
      // 点击“弃”按钮：仅在跟弃窗口内且自己待决策时有效；窗口外点击无响应（不罚牌）
      if (state.phase !== 'follow' || !state.follow) return false;
      if (state.follow.decisions[action.playerId] !== 'pending') return false;
      if (state.pending !== null) return false; // 有挂起交互时不响应
      const me = state.players[action.playerId];
      return action.slot >= 0 && action.slot < me.handSlots.length && me.handSlots[action.slot] !== null;
    }
    case 'PASS_FOLLOW': {
      if (state.phase !== 'follow' || !state.follow) return false;
      return state.follow.decisions[action.playerId] === 'pending';
    }
    case 'REVEAL_DONE':
      return state.pending?.kind === 'revealDone';
    default:
      return false;
  }
}

// ---------- 状态流转 ----------

export function applyAction(state: GameState, action: Action): GameState {
  if (!canApply(state, action)) return state;
  switch (action.type) {
    case 'CONFIRM_DEAL':
      return confirmDeal(state, action.playerId);
    case 'DECLARE':
      return declare(state);
    case 'DRAW':
      return draw(state);
    case 'DISCARD_DRAWN':
      return discardDrawn(state);
    case 'REPLACE':
      return replace(state, action.slot);
    case 'USE_ABILITY':
      return useAbility(state);
    case 'PICK_SELF_SLOT':
      return pickSelfSlot(state, action.slot);
    case 'PICK_OTHER':
      return pickOther(state, action.playerId, action.slot);
    case 'SWAP':
      return confirmSwap(state, true);
    case 'KEEP':
      return confirmSwap(state, false);
    case 'TRY_FOLLOW':
      return tryFollow(state, action.playerId, action.slot);
    case 'PASS_FOLLOW':
      return passFollow(state, action.playerId);
    case 'REVEAL_DONE':
      return revealDone(state);
    default:
      return state;
  }
}

// ---- deal ----

function confirmDeal(state: GameState, playerId?: number): GameState {
  const pid = playerId ?? state.currentPlayer;
  const me = state.players[pid];
  if (!me || me.isBot || state.dealConfirmed[pid]) return state;
  // 看牌：将自己 4 张牌写入 knowledge
  let updated = me;
  for (const card of me.handSlots) {
    if (card) updated = addKnowledge(updated, card);
  }
  const players = state.players.map((p) => (p.id === pid ? updated : p));
  const confirmed = [...state.dealConfirmed];
  confirmed[pid] = true;
  const allHumansConfirmed = state.players.every((p) => p.isBot || confirmed[p.id]);
  if (!allHumansConfirmed) {
    // 还有真人未盖牌：currentPlayer 指向下一个未确认真人（供热座轮流 UI），联机并行确认互不阻塞
    const next = state.players.findIndex((p) => !p.isBot && !confirmed[p.id]);
    return {
      ...state,
      players,
      dealConfirmed: confirmed,
      currentPlayer: next >= 0 ? next : state.currentPlayer,
      log: [...state.log, log(state, pid, `${playerName(state, pid)} 看过并盖好手牌`)],
    };
  }
  // 全部真人确认完毕，进入 playing，从玩家 0 开始
  return {
    ...state,
    players,
    dealConfirmed: confirmed,
    currentPlayer: 0,
    phase: 'playing',
    log: [...state.log, log(state, pid, `${playerName(state, pid)} 看过并盖好手牌`)],
  };
}

// ---- 定牌 ----

function declare(state: GameState): GameState {
  const dp = state.currentPlayer;
  const others = state.players.length - 1;
  return {
    ...state,
    phase: 'final',
    declaredPlayer: dp,
    currentPlayer: nextPlayer(state, dp),
    finalRemaining: others,
    pending: null,
    log: [...state.log, log(state, dp, `${playerName(state, dp)} 宣布定牌！`)],
  };
}

// ---- 摸牌 ----

function draw(state: GameState): GameState {
  const [card, rest] = drawCard(state.deck);
  if (!card) {
    // 牌堆耗尽：立即结算
    return settle(state);
  }
  return {
    ...state,
    deck: rest,
    pending: { kind: 'drawn', card },
    log: [...state.log, log(state, state.currentPlayer, `${playerName(state, state.currentPlayer)} 摸了一张牌`)],
  };
}

// ---- 弃掉摸到的牌 ----

function discardDrawn(state: GameState): GameState {
  const pend = state.pending;
  if (pend?.kind !== 'drawn') return state;
  const card = pend.card;
  const discardPile = [...state.discardPile, card];
  return afterDiscard(
    {
      ...state,
      pending: null,
      discardPile,
      lastDiscard: card,
      animSeq: state.animSeq + 1,
      lastMove: { kind: 'discard', actor: state.currentPlayer, card, seq: state.animSeq + 1 },
    },
    card,
  );
}

// ---- 替换手牌槽位 ----

function replace(state: GameState, slot: number): GameState {
  const pend = state.pending;
  if (pend?.kind !== 'drawn') return state;
  const me = state.players[state.currentPlayer];
  const replaced = me.handSlots[slot];
  if (!replaced) return state;

  const handSlots = [...me.handSlots];
  handSlots[slot] = pend.card;
  let updated: PlayerState = { ...me, handSlots };
  updated = addKnowledge(updated, pend.card); // 摸到的牌玩家见过
  updated = removeKnowledge(updated, replaced.id); // 被替换的牌离开手牌

  const players = state.players.map((p) => (p.id === me.id ? updated : p));
  const discardPile = [...state.discardPile, replaced];
  return afterDiscard(
    {
      ...state,
      players,
      pending: null,
      discardPile,
      lastDiscard: replaced,
      animSeq: state.animSeq + 1,
      lastMove: { kind: 'replace', actor: state.currentPlayer, slot, replaced, seq: state.animSeq + 1 },
    },
    replaced,
  );
}

// ---- 发动功能 ----

function useAbility(state: GameState): GameState {
  const pend = state.pending;
  if (pend?.kind !== 'drawn') return state;
  const card = pend.card;
  const rank = card.rank as string;

  // 功能牌进入已使用功能牌区（功能消耗，不触发跟弃窗口；不混入弃牌堆）
  const base: GameState = {
    ...state,
    usedPile: [...state.usedPile, card],
    pending: null,
  };

  if (rank === '7' || rank === '8') {
    return { ...base, pending: { kind: 'chooseSelfSlot', purpose: 'view', ability: rank } };
  }
  if (rank === '9' || rank === '10') {
    return { ...base, pending: { kind: 'chooseOtherSlot', purpose: 'view', ability: rank } };
  }
  if (rank === 'J' || rank === 'Q' || rank === 'K') {
    // 换牌：自己与对方各选一张，任意顺序（chooseSwap），选完即执行
    return {
      ...base,
      pending: { kind: 'chooseSwap', ability: rank, selfSlot: null, otherPlayer: null, otherSlot: null },
    };
  }
  return base;
}

// ---- 选择自己槽位 ----

function pickSelfSlot(state: GameState, slot: number): GameState {
  const pend = state.pending;
  if (!pend) return state;
  const me = state.players[state.currentPlayer];
  const card = me.handSlots[slot];
  if (!card) return state;

  if (pend.kind === 'chooseSwap') {
    // 换牌选择：记录自己的牌，若对方也已选则执行
    if (pend.selfSlot === slot) return state;
    const next: GameState = { ...state, pending: { ...pend, selfSlot: slot } };
    return maybeExecuteSwap(next);
  }

  if (pend.kind !== 'chooseSelfSlot') return state;
  if (pend.purpose !== 'view') return state;

  // 7/8 查看自己一张牌：展示牌面（pending revealDone，UI 限时后确认收起）
  // 日志不写具体牌面（记忆考验：翻看后不标记，联机日志对所有玩家安全）
  const updated = addKnowledge(me, card);
  const players = state.players.map((p) => (p.id === me.id ? updated : p));
  return {
    ...state,
    players,
    pending: { kind: 'revealDone', card, viewer: me.id },
    // 看自己牌也记录目标槽位：UI 播放拿起-晃动-放下（牌面仅对自己展示）
    animSeq: state.animSeq + 1,
    lastViewed: { actor: me.id, targetPlayer: me.id, targetSlot: slot, seq: state.animSeq + 1 },
    log: [...state.log, log(state, me.id, `${playerName(state, me.id)} 查看了自己的一张牌`)],
  };
}

// ---- 选择其他玩家槽位 ----

function pickOther(state: GameState, playerId: number, slot: number): GameState {
  const pend = state.pending;
  if (!pend) return state;
  const me = state.players[state.currentPlayer];
  const target = state.players[playerId];
  const card = target.handSlots[slot];
  if (!card) return state;

  if (pend.kind === 'chooseSwap') {
    // 换牌选择：记录对方的牌，若自己也已选则执行
    if (pend.otherPlayer === playerId && pend.otherSlot === slot) return state;
    const next: GameState = { ...state, pending: { ...pend, otherPlayer: playerId, otherSlot: slot } };
    return maybeExecuteSwap(next);
  }

  if (pend.kind !== 'chooseOtherSlot' || pend.purpose !== 'view') return state;

  // 9/10 查看其他玩家一张牌：展示牌面（pending revealDone，UI 限时后确认收起）
  // 日志不写牌面（联机日志对所有玩家安全，不透露被看牌的具体点数）
  const updated = addKnowledge(me, card);
  const players = state.players.map((p) => (p.id === me.id ? updated : p));
  return {
    ...state,
    players,
    pending: { kind: 'revealDone', card, viewer: me.id },
    // 被看者需要知道"哪一张被看了"：记录目标槽位（不含牌面），UI 播放拿起放下动画
    animSeq: state.animSeq + 1,
    lastViewed: { actor: me.id, targetPlayer: playerId, targetSlot: slot, seq: state.animSeq + 1 },
    log: [
      ...state.log,
      log(state, me.id, `${playerName(state, me.id)} 查看了 ${playerName(state, playerId)} 的一张牌`),
    ],
  };
}

/**
 * 换牌选择（chooseSwap）两张都选齐后执行：
 * - J/Q 暗换：直接交换双方牌
 * - K 明换：先展示双方牌进入 confirmReveal，由玩家决定换不换
 */
function maybeExecuteSwap(state: GameState): GameState {
  const pend = state.pending;
  if (pend?.kind !== 'chooseSwap') return state;
  if (pend.selfSlot === null || pend.otherPlayer === null || pend.otherSlot === null) return state;
  const me = state.players[state.currentPlayer];
  const selfCard = me.handSlots[pend.selfSlot];
  const otherCard = state.players[pend.otherPlayer]?.handSlots[pend.otherSlot];
  if (!selfCard || !otherCard) return state;

  if (pend.ability === 'K') {
    // 明换：先展示双方牌
    const updated = addKnowledge(addKnowledge(me, selfCard), otherCard);
    const players = state.players.map((p) => (p.id === me.id ? updated : p));
    // 信息隐藏：日志统一不写牌面（联机时对所有玩家安全）
    return {
      ...state,
      players,
      pending: {
        kind: 'confirmReveal',
        selfSlot: pend.selfSlot,
        selfCard,
        otherPlayer: pend.otherPlayer,
        otherSlot: pend.otherSlot,
        otherCard,
      },
      // 被看者需要知道"哪一张被看了"：记录目标槽位（不含牌面）
      animSeq: state.animSeq + 1,
      lastViewed: { actor: me.id, targetPlayer: pend.otherPlayer, targetSlot: pend.otherSlot, seq: state.animSeq + 1 },
      log: [
        ...state.log,
        log(
          state,
          me.id,
          `${playerName(state, me.id)} 使用 K 明换，查看了 ${playerName(state, pend.otherPlayer)} 的一张牌`,
        ),
      ],
    };
  }

  // 暗换（J/Q）：直接交换
  return swapCards(state, pend.selfSlot, pend.otherPlayer, pend.otherSlot, `暗换（${pend.ability}）`);
}

/** 执行交换并清理双方被换走牌的知识 */
function swapCards(
  state: GameState,
  selfSlot: number,
  otherPlayerId: number,
  otherSlot: number,
  label: string,
): GameState {
  const me = state.players[state.currentPlayer];
  const other = state.players[otherPlayerId];
  const selfCard = me.handSlots[selfSlot];
  const otherCard = other.handSlots[otherSlot];
  if (!selfCard || !otherCard) return state;

  const mySlots = [...me.handSlots];
  mySlots[selfSlot] = otherCard;
  const otherSlots = [...other.handSlots];
  otherSlots[otherSlot] = selfCard;

  let meUpdated: PlayerState = { ...me, handSlots: mySlots };
  let otherUpdated: PlayerState = { ...other, handSlots: otherSlots };
  // 暗换：换进来的牌双方都不知道 → 清掉被换走牌的知识
  meUpdated = removeKnowledge(meUpdated, selfCard.id);
  otherUpdated = removeKnowledge(otherUpdated, otherCard.id);

  const players = state.players.map((p) => {
    if (p.id === me.id) return meUpdated;
    if (p.id === otherPlayerId) return otherUpdated;
    return p;
  });

  return finishAbility(
    {
      ...state,
      players,
      animSeq: state.animSeq + 1,
      lastSwap: {
        actor: me.id,
        selfPlayer: me.id,
        selfSlot,
        otherPlayer: otherPlayerId,
        otherSlot,
        seq: state.animSeq + 1,
      },
    },
    `${playerName(state, me.id)} 与 ${playerName(state, otherPlayerId)} ${label}`,
  );
}

// ---- K 明换确认 ----

function confirmSwap(state: GameState, doSwap: boolean): GameState {
  const pend = state.pending;
  if (pend?.kind !== 'confirmReveal') return state;
  if (doSwap) {
    return swapCards(state, pend.selfSlot, pend.otherPlayer, pend.otherSlot, '明换，完成交换');
  }
  return finishAbility(state, `${playerName(state, state.currentPlayer)} 明换后选择不交换`);
}

/** 完成一次功能牌动作：清 pending 并结束回合 */
function finishAbility(state: GameState, message: string): GameState {
  const withPending = { ...state, pending: null, log: [...state.log, log(state, state.currentPlayer, message)] };
  return endTurn(withPending);
}

// ---- 弃牌后的跟弃窗口 ----

function afterDiscard(state: GameState, discarded: Card): GameState {
  const score = scoreOf(discarded);
  const discarder = state.currentPlayer;
  const decisions: Record<number, FollowDecision> = {};
  // 每次弃牌都开启跟弃窗口：所有玩家（含弃牌者本人）均可尝试，点错/抢慢由引擎判定并惩罚
  for (const p of state.players) {
    decisions[p.id] = 'pending';
  }
  if (state.allowSelfFollow === false) decisions[discarder] = 'pass';
  const follow: FollowState = { discarder, targetScore: score, decisions, submitted: [] };
  return {
    ...state,
    phase: 'follow',
    follow,
    log: [...state.log, log(state, discarder, `${playerName(state, discarder)} 弃掉了 ${cardLabel(discarded)}`)],
  };
}

// ---- 跟弃（点击手牌下方"弃"按钮） ----

function tryFollow(state: GameState, playerId: number, slot: number): GameState {
  const follow = state.follow;
  const me = state.players[playerId];
  const card = me.handSlots[slot];

  // 成功条件：跟弃窗口开着 + 该玩家待决策 + 该牌同分 + 抢先第一个提交
  const canSucceed =
    state.phase === 'follow' &&
    !!follow &&
    follow.decisions[playerId] === 'pending' &&
    !!card &&
    scoreOf(card) === follow.targetScore &&
    follow.submitted.length === 0;

  if (canSucceed) {
    const slots = [...me.handSlots];
    slots[slot] = null;
    const players = state.players.map((p) => (p.id === playerId ? { ...p, handSlots: slots } : p));
    const nextState: GameState = {
      ...state,
      players,
      discardPile: [...state.discardPile, card],
      follow: follow
        ? { ...follow, decisions: { ...follow.decisions, [playerId]: 'follow' }, submitted: [...follow.submitted, playerId] }
        : null,
      log: [...state.log, log(state, playerId, `${playerName(state, playerId)} 跟弃成功，弃掉 ${cardLabel(card)}`)],
    };
    return closeFollowIfDone(nextState);
  }

  // 失败：惩罚补牌（点错牌 / 窗口未开 / 抢弃太慢）
  const res = addPenaltyCard(me, state.deck);
  const players = state.players.map((p) => (p.id === playerId ? res.player : p));
  const decisions: Record<number, FollowDecision> | undefined = follow
    ? { ...follow.decisions, [playerId]: 'follow' }
    : undefined;
  const nextState: GameState = {
    ...state,
    players,
    deck: res.deck,
    follow: follow && decisions ? { ...follow, decisions } : state.follow,
    // 罚牌动画数据：只记罚给谁、落在哪个槽（牌面保密）
    animSeq: res.got ? state.animSeq + 1 : state.animSeq,
    lastPenalty: res.got
      ? { actor: playerId, slot: res.slot, seq: state.animSeq + 1 }
      : state.lastPenalty,
    log: [
      ...state.log,
      log(
        state,
        playerId,
        res.got
          ? `${playerName(state, playerId)} 跟弃失败，被罚补一张牌`
          : `${playerName(state, playerId)} 跟弃失败，但牌堆已空无法补牌`,
      ),
    ],
  };
  return closeFollowIfDone(nextState);
}

/** 跟弃窗口若已无待决策玩家则关闭并推进回合 */
function closeFollowIfDone(state: GameState): GameState {
  if (state.phase !== 'follow' || !state.follow) return state;
  if (!isFollowClosed(state)) return state;
  const next = { ...state, phase: resumePhase(state), follow: null };
  return endTurn(next);
}

/** 跟弃窗口关闭后恢复的阶段 */
function resumePhase(state: GameState): GameState['phase'] {
  return state.declaredPlayer !== null ? 'final' : 'playing';
}

function isFollowClosed(state: GameState): boolean {
  const follow = state.follow;
  if (!follow) return true;
  return Object.values(follow.decisions).every((d) => d !== 'pending');
}

function passFollow(state: GameState, playerId: number): GameState {
  const follow = state.follow;
  if (!follow) return state;
  const decisions: Record<number, FollowDecision> = { ...follow.decisions, [playerId]: 'pass' };
  let nextState: GameState = {
    ...state,
    follow: { ...follow, decisions },
    log: [...state.log, log(state, playerId, `${playerName(state, playerId)} 放弃跟弃`)],
  };
  if (isFollowClosed(nextState)) {
    nextState = { ...nextState, phase: resumePhase(state), follow: null };
    nextState = endTurn(nextState);
  }
  return nextState;
}

// ---- 翻看确认（7/8、9/10） ----

function revealDone(state: GameState): GameState {
  if (state.pending?.kind !== 'revealDone') return state;
  return endTurn({ ...state, pending: null });
}

// ---- 回合推进 ----

function endTurn(state: GameState): GameState {
  if (state.phase === 'final') {
    const remaining = state.finalRemaining - 1;
    if (remaining <= 0) {
      return settle(state);
    }
    return { ...state, finalRemaining: remaining, currentPlayer: nextPlayer(state, state.currentPlayer) };
  }
  return { ...state, currentPlayer: nextPlayer(state, state.currentPlayer) };
}

// ---- 结算 ----

export function settle(state: GameState): GameState {
  // 定牌奖励：牌堆剩余占比 >=60% 减 2 分、>=35% 减 1 分（鼓励提前定牌，反拖延）
  let bonus = 0;
  if (state.declareBonus && state.declaredPlayer !== null && state.declaredDeckCount !== undefined) {
    const initDeck = 54 - 4 * state.players.length;
    const ratio = initDeck > 0 ? state.declaredDeckCount / initDeck : 0;
    if (ratio >= 0.6) bonus = 2;
    else if (ratio >= 0.35) bonus = 1;
  }
  const players = state.players.map((p) => ({ ...p, score: handScore(p.handSlots) }));
  if (bonus > 0 && state.declaredPlayer !== null) {
    const dp = state.declaredPlayer;
    players[dp] = { ...players[dp], score: (players[dp].score ?? 0) - bonus };
  }
  const min = Math.min(...players.map((p) => p.score ?? 0));
  const winner = players.filter((p) => (p.score ?? 0) === min).map((p) => p.id);
  return {
    ...state,
    players,
    phase: 'end',
    pending: null,
    follow: null,
    winner,
    log: [
      ...state.log,
      log(state, -1, `终局：${winner.map((id) => playerName(state, id)).join('、')} 获胜（并列同时胜出）`),
    ],
  };
}
