import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameConfigUI } from '../App';
import type { Action, GameState } from '../core/types';
import { applyAction, createGame } from '../core/engine';
import { aiDecide } from '../core/ai';
import { buildView, type ViewPlayer } from '../core/view';
import type { ClientGameView } from '../../server/protocol';
import PlayerSeat from './PlayerSeat';
import ActionPanel from './ActionPanel';
import LogPanel from './LogPanel';
import RulesPanel from './RulesPanel';
import DiscardPile from './DiscardPile';
import UsedPile from './UsedPile';
import ResultScreen from './ResultScreen';
import SwapAnim from './SwapAnim';
import MoveAnim from './MoveAnim';
import PeekAnim from './PeekAnim';
import SettingsModal from './SettingsModal';
import { playSfx } from '../core/sfx';

/** 联机模式属性：服务器权威视图 + 动作发送 */
export interface OnlineGameProps {
  view: ClientGameView;
  myId: number;
  send: (a: Action) => void;
  onRestart: () => void;
  canRestart: boolean;
  /** 发送快捷表情（联机） */
  sendEmoji?: (label: string) => void;
  /** 收到的他人表情事件（from=对局内玩家 id） */
  emojiEvent?: { from: number; label: string; ts: number } | null;
  onExit: () => void;
  /** 对局中退出（联机）：座位保留、服务器托管，回到房间页 */
  onExitGame?: () => void;
  /** 主动托管开关（联机）：开启后本玩家回合由服务器 AI 代打，可随时关闭 */
  setAutopilot?: (on: boolean) => void;
}

interface Props {
  config?: GameConfigUI;
  online?: OnlineGameProps;
  onExit: () => void;
}

const PHASE_LABEL: Record<GameState['phase'], string> = {
  deal: '发牌（看牌盖牌）',
  playing: '对局中',
  follow: '对局中', // 跟弃窗口：提示"可跟弃"，是否跟弃由玩家自行判断
  final: '定牌终局',
  end: '已结束',
};

const REVEAL_MS = 5000; // 翻看展示限时
const FOLLOW_WINDOW_MS = 3000; // 跟弃窗口固定时长（3 秒：反应+回忆刚好，点放弃可提前关闭）
/** 热座/单机多局累计积分（localStorage，按真人玩家名累计） */
const TOTAL_KEY = 'cardexchange-total-scores';
/** 快捷表情预设（8 个：表情+短语） */
const EMOJIS = ['😤 跟！', '😏 记不住', '🤝 好牌', '💪 加油', '😂 哈哈', '😅 失误', '🙈 看不见', '🎯 定牌！'];
/** 引导局教学提示：功能牌能力说明 */
const GUIDE_TIP: Record<string, string> = {
  '7': '摸到 7：可以看自己的一张牌',
  '8': '摸到 8：可以看自己的一张牌',
  '9': '摸到 9：可以看其他玩家的一张牌',
  '10': '摸到 10：可以看其他玩家的一张牌',
  J: '摸到 J：暗换（用自己的牌换别人的牌）',
  Q: '摸到 Q：暗换（用自己的牌换别人的牌）',
  K: '摸到 K：明换（看完双方牌再决定换不换）',
};
/** 摸到普通分数牌：讲解弃牌规则（引导局教学） */
const GUIDE_PLAIN = '这是分数牌：可直接弃掉（弃掉后相同分数可跟弃），或替换手牌里的牌';

/** 定牌奖励门槛（张数，与引擎 ratio>=0.6 / >=0.35 一致，向上取整） */
function bonusThresholds(playerCount: number): { n2: number; n1: number } {
  const initDeck = 54 - 4 * playerCount;
  return { n2: Math.ceil(initDeck * 0.6), n1: Math.ceil(initDeck * 0.35) };
}

/**
 * 计算翻看/明换展示中需要强制正面的牌。
 * 信息隐藏：只有"真人"发动者（revealDone.viewer / confirmReveal 时 currentPlayer）能看到牌面；
 * 机器人发动的翻看/明换不向玩家亮牌，玩家只能通过行为推理。
 * 联机脱敏后牌面字段可能为 undefined（非查看者客户端），需守卫。
 */
export function computeFaceUpIds(
  pending: GameState['pending'],
  players: GameState['players'],
  currentPlayer: number,
): Set<string> {
  const set = new Set<string>();
  const viewerIsBot =
    (pending?.kind === 'revealDone' && players[pending.viewer]?.isBot) ||
    (pending?.kind === 'confirmReveal' && players[currentPlayer]?.isBot);
  if (pending?.kind === 'revealDone' && !viewerIsBot && pending.card) {
    set.add(pending.card.id);
  }
  if (pending?.kind === 'confirmReveal' && !viewerIsBot && pending.selfCard && pending.otherCard) {
    set.add(pending.selfCard.id);
    set.add(pending.otherCard.id);
  }
  return set;
}

export default function GameScreen({ config, online, onExit }: Props) {
  const isOnline = !!online;
  const [localState, setLocalState] = useState<GameState>(() =>
    config
      ? createGame({
          playerCount: config.playerCount,
          botCount: config.botCount,
          avatars: config.avatars,
          followWindowMs: config.followWindowMs,
          declareBonus: config.declareBonus,
          allowSelfFollow: config.allowSelfFollow,
          botMemory: config.botMemory,
          guided: config.guided,
        })
      : (null as unknown as GameState),
  );
  const [replaceMode, setReplaceMode] = useState(false);
  const [kDeciding, setKDeciding] = useState(false);
  // 规则/游戏进程面板：点击按钮展开，默认收起
  const [showRules, setShowRules] = useState(false);
  const [showLog, setShowLog] = useState(false);
  // 对局中设置弹窗（页面风格/音量/托管）
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiText, setEmojiText] = useState("");
  // 热座/单机多局累计（本地 localStorage）
  const [localTotals, setLocalTotals] = useState<{ games: number; scores: Record<string, number> } | null>(null);
  const scoredRef = useRef(false);
  // 跟弃窗口剩余秒数（倒计时显示）
  const [followLeft, setFollowLeft] = useState(0);
  // 联机：已点放弃（窗口需等其他玩家决策，避免误以为按钮无效）
  const [gaveUp, setGaveUp] = useState(false);
  // 快捷表情 toast（本机显示）
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const toastIdRef = useRef(0);
  // 表情消息已处理守卫：state.players 每次变化都会触发 effect，防止同一条消息重复弹
  const lastEmojiTsRef = useRef(0);
  const showToast = useCallback((text: string) => {
    const id = ++toastIdRef.current;
    setToasts((ts) => [...ts, { id, text }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3200);
  }, []);

  // 跟弃窗口时长：联机读房间设置，本地默认 3 秒
  const followWindowMs = isOnline && online ? online.view.followWindowMs : FOLLOW_WINDOW_MS;
  // 联机：状态来自服务器视图；本地：内部 reducer
  const state = isOnline && online ? (online.view as unknown as GameState) : localState;

  const dispatch = useCallback(
    (a: Action) => {
      if (online) online.send(a);
      else setLocalState((s) => applyAction(s, a));
    },
    [online],
  );

  const restart = useCallback(() => {
    if (online) {
      online.onRestart();
      return;
    }
    setReplaceMode(false);
    setKDeciding(false);
    if (config)
      setLocalState(
        createGame({
          playerCount: config.playerCount,
          botCount: config.botCount,
          avatars: config.avatars,
          followWindowMs: config.followWindowMs,
          declareBonus: config.declareBonus,
          allowSelfFollow: config.allowSelfFollow,
          botMemory: config.botMemory,
          guided: config.guided,
        }),
      );
  }, [online, config]);

  // ---- 机器人自动行动调度（仅本地模式；联机由服务器调度） ----
  useEffect(() => {
    if (isOnline) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const current = state.players[state.currentPlayer];

    // 发牌阶段：机器人开局已确认（dealConfirmed=true），无需调度
    if ((state.phase === 'playing' || state.phase === 'final') && current.isBot) {
      timers.push(setTimeout(() => dispatch(aiDecide(state, current.id)), 700));
    } else if (state.phase === 'follow' && state.follow) {
      for (const [idStr, d] of Object.entries(state.follow.decisions)) {
        const id = Number(idStr);
        if (d === 'pending' && state.players[id].isBot) {
          // 机器人跟弃反应：0.5~2.5 秒随机，模拟"速度最快者成功"
          const delay = 500 + Math.random() * 2000;
          timers.push(setTimeout(() => dispatch(aiDecide(state, id)), delay));
        }
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [state, dispatch, isOnline]);

  // ---- 跟弃窗口 4 秒超时：未操作的真人均视为放弃（仅本地模式） ----
  const followStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (isOnline) return;
    if (state.phase !== 'follow' || !state.follow) {
      followStartRef.current = null;
      return;
    }
    if (followStartRef.current === null) followStartRef.current = Date.now();
    const remaining = Math.max(0, followWindowMs - (Date.now() - followStartRef.current));
    const t = setTimeout(() => {
      setLocalState((s) => {
        if (s.phase !== 'follow' || !s.follow) return s;
        let ns = s;
        for (const [idStr, d] of Object.entries(s.follow.decisions)) {
          const id = Number(idStr);
          if (d === 'pending' && !s.players[id].isBot) {
            ns = applyAction(ns, { type: 'PASS_FOLLOW', playerId: id });
          }
        }
        return ns;
      });
    }, remaining);
    return () => clearTimeout(t);
  }, [state.phase, state.follow, isOnline, followWindowMs]);

  // ---- 跟弃窗口倒计时（显示剩余秒数，点放弃可提前关闭） ----
  const prevTickRef = useRef(-1);
  useEffect(() => {
    if (state.phase !== 'follow' || !state.follow) {
      followStartRef.current = null;
      setGaveUp(false);
      setFollowLeft(0);
      prevTickRef.current = -1;
      return;
    }
    const iv = setInterval(() => {
      if (followStartRef.current === null) followStartRef.current = Date.now();
      const start = followStartRef.current ?? Date.now();
      const rem = Math.max(0, Math.ceil((followWindowMs - (Date.now() - start)) / 1000));
      setFollowLeft(rem);
      // 倒计时滴答：剩余秒数变化时响一次（0 秒不响）
      if (rem !== prevTickRef.current) {
        prevTickRef.current = rem;
        if (rem > 0) playSfx('countdown');
      }
    }, 200);
    return () => clearInterval(iv);
  }, [state.phase, state.follow, followWindowMs]);

  // ---- 音效：摸牌/盖牌/看牌/换牌/替换/弃牌/罚牌/定牌/跟弃成功（按动画事件 seq 与状态变化各触发一次） ----
  // 联机视图不含 animSeq，改用 lastSwap/lastMove/lastPenalty 各自的 seq 组合键防重（本地/联机通用）
  const animKeyRef = useRef('');
  const prevPendingKindRef = useRef<string | null>(null);
  const prevDeclaredRef = useRef<number | null>(null);
  const prevDealKeyRef = useRef<string | null>(null);
  const prevFollowSubRef = useRef<number | null>(null);
  useEffect(() => {
    // 动画事件：与别人换牌 / 主动弃牌 / 替换手牌 / 跟弃失败罚牌（seq 递增防重）
    const animKey = `${state.lastSwap?.seq ?? 0}|${state.lastMove?.seq ?? 0}|${state.lastPenalty?.seq ?? 0}`;
    if (animKey !== animKeyRef.current) {
      animKeyRef.current = animKey;
      if (state.lastSwap) {
        playSfx('swap_other'); // 与别人换牌（J/Q/K）
      } else if (state.lastMove) {
        playSfx(state.lastMove.kind === 'discard' ? 'discard' : 'swap_self');
      }
      if (state.lastPenalty) playSfx('follow_fail'); // 跟弃失败罚牌
    }
    // 摸牌 / 看牌
    const pk = state.pending?.kind ?? null;
    if (pk !== prevPendingKindRef.current) {
      prevPendingKindRef.current = pk;
      if (pk === 'drawn') playSfx('card_draw');
      if (pk === 'revealDone') playSfx('peek');
    }
    // 宣布定牌
    if (state.declaredPlayer !== prevDeclaredRef.current) {
      prevDeclaredRef.current = state.declaredPlayer;
      if (state.declaredPlayer !== null) playSfx('declare');
    }
    // 盖牌（dealConfirmed 出现 true 时播一次；首次渲染不播）
    // 联机视图含 dealConfirmed；防御性兜底防止 undefined
    const dealKey = (state.dealConfirmed ?? []).join(',');
    if (dealKey !== prevDealKeyRef.current) {
      if (prevDealKeyRef.current !== null && dealKey.includes('true')) playSfx('card_cover');
      prevDealKeyRef.current = dealKey;
    }
    // 跟弃成功：跟弃窗口关闭时存在提交成功者
    // 注意：联机视图的 follow 不含 submitted（只有本地引擎状态才有），必须防御
    const sub = Array.isArray(state.follow?.submitted) ? state.follow.submitted.length : 0;
    if (prevFollowSubRef.current !== null && prevFollowSubRef.current > 0 && !state.follow) {
      playSfx('follow_success');
    }
    prevFollowSubRef.current = sub;
  }, [state]);

  // ---- 翻看（7/8、9/10）5 秒限时：到点自动收起（联机也由客户端主动提交，服务器兜底） ----
  useEffect(() => {
    if (state.pending?.kind !== 'revealDone') return;
    const t = setTimeout(() => dispatch({ type: 'REVEAL_DONE' }), REVEAL_MS);
    return () => clearTimeout(t);
  }, [state.pending, dispatch]);

  // ---- K 明换 5 秒展示后自动进入决定界面 ----
  useEffect(() => {
    if (state.pending?.kind !== 'confirmReveal') {
      setKDeciding(false);
      return;
    }
    const t = setTimeout(() => setKDeciding(true), REVEAL_MS);
    return () => clearTimeout(t);
  }, [state.pending]);

  // ---- 热座/单机：结算时把本局手牌总分累加到本地累计（按真人玩家名） ----
  useEffect(() => {
    if (isOnline) return;
    if (state.phase === 'deal') {
      scoredRef.current = false; // 新局开始，重置防重标记
      return;
    }
    if (state.phase !== 'end' || scoredRef.current) return;
    scoredRef.current = true;
    try {
      const raw = localStorage.getItem(TOTAL_KEY);
      const prev = raw ? (JSON.parse(raw) as { games: number; scores: Record<string, number> }) : { games: 0, scores: {} };
      const scores = { ...prev.scores };
      for (const p of state.players) {
        scores[p.name] = (scores[p.name] ?? 0) + (p.score ?? 0);
      }
      const next = { games: (prev.games ?? 0) + 1, scores };
      localStorage.setItem(TOTAL_KEY, JSON.stringify(next));
      setLocalTotals(next);
    } catch {
      /* localStorage 不可用时静默跳过累计 */
    }
  }, [state.phase, state.players, isOnline]);

  // ---- 其他玩家进入托管（退出对局/掉线/主动托管）→ 提示（不含自己，自己在设置里可见） ----
  const aiControlled = isOnline && online ? new Set(online.view.aiControlled ?? []) : new Set<number>();
  const lastAiRef = useRef<string>('');
  useEffect(() => {
    if (isOnline && aiControlled.size > 0) {
      const others = [...aiControlled].filter((id) => id !== online?.myId).sort();
      const ids = others.join(',');
      if (others.length > 0 && ids !== lastAiRef.current) {
        lastAiRef.current = ids;
        const names = others
          .map((id) => state.players[id]?.name ?? `玩家${id + 1}`)
          .join('、');
        showToast(`${names} 已进入托管（AI 代打）`);
      }
    }
  }, [isOnline, aiControlled, state.players, showToast, online?.myId]);

  // ---- 收到他人快捷表情 → 本地 toast ----
  useEffect(() => {
    if (!online?.emojiEvent) return;
    const ev = online.emojiEvent;
    if (ev.ts <= lastEmojiTsRef.current) return; // 已处理过，避免重复弹
    lastEmojiTsRef.current = ev.ts;
    const name = state.players[ev.from]?.name ?? `玩家${ev.from + 1}`;
    showToast(`${name}：${ev.label}`);
  }, [online?.emojiEvent, state.players, showToast]);

  // ---- 视角：本地为当前行动玩家；联机用服务器按 viewer 生成的视图 ----
  const view = useMemo(
    () => (isOnline && online ? online.view.view : buildView(state, state.currentPlayer)),
    [state, isOnline, online],
  );

  // 翻看/明换展示中的牌（强制正面）
  // 信息隐藏：机器人发动的翻看/明换不向玩家亮牌（只有发动者能看到，玩家只能通过行为推理）
  const faceUpIds = useMemo(
    () => computeFaceUpIds(state.pending, state.players, state.currentPlayer),
    [state.pending, state.currentPlayer, state.players],
  );

  const deckCount = isOnline && online ? online.view.deckCount : state.deck.length;
  const declareBonusOn = isOnline && online ? online.view.declareBonus : state.declareBonus;
  const pend = state.pending;
  const selectableSelf =
    pend?.kind === 'chooseSelfSlot' ||
    pend?.kind === 'chooseSwap' ||
    (pend?.kind === 'drawn' && replaceMode);
  const selectableOther = pend?.kind === 'chooseOtherSlot' || pend?.kind === 'chooseSwap';

  function handleSlotClick(playerId: number, slot: number) {
    if (pend?.kind === 'chooseSelfSlot') {
      if (playerId === state.currentPlayer) dispatch({ type: 'PICK_SELF_SLOT', slot });
    } else if (pend?.kind === 'chooseOtherSlot') {
      if (playerId !== state.currentPlayer) dispatch({ type: 'PICK_OTHER', playerId, slot });
    } else if (pend?.kind === 'chooseSwap') {
      // 换牌：任意顺序选自己/对方的牌，两张都选齐引擎自动执行
      if (playerId === state.currentPlayer) dispatch({ type: 'PICK_SELF_SLOT', slot });
      else dispatch({ type: 'PICK_OTHER', playerId, slot });
    } else if (pend?.kind === 'drawn' && replaceMode) {
      if (playerId === state.currentPlayer) {
        dispatch({ type: 'REPLACE', slot });
        setReplaceMode(false);
      }
    }
  }

  // ---- 跟弃窗口：放弃（联机=放弃自己；热座=全体玩家含机器人放弃，立即关闭窗口） ----
  const passFollowAll = useCallback(() => {
    if (!state.follow) return;
    if (isOnline && online) {
      dispatch({ type: 'PASS_FOLLOW', playerId: online.myId });
      setGaveUp(true);
      return;
    }
    let ns = state;
    for (const [idStr, d] of Object.entries(state.follow.decisions)) {
      const id = Number(idStr);
      if (d === 'pending') {
        ns = applyAction(ns, { type: 'PASS_FOLLOW', playerId: id });
      }
    }
    setLocalState(ns);
  }, [state, isOnline, online, dispatch]);
  if (state.phase === 'end') {
    // 热座本地累计 → 按玩家 id 对齐
    let localScores: Record<number, number> | null = null;
    if (!isOnline && localTotals) {
      localScores = {};
      for (const p of state.players) {
        if (localTotals.scores[p.name] !== undefined) localScores[p.id] = localTotals.scores[p.name];
      }
    }
    // 胜负判定：联机看自己是否在胜者名单；本地热座看是否有真人获胜
    const winners = state.winner ?? [];
    const myWin = isOnline && online ? winners.includes(online.myId) : state.players.some((p) => !p.isBot && winners.includes(p.id));
    return (
      <ResultScreen
        state={state}
        onRestart={restart}
        canRestart={isOnline ? online.canRestart : true}
        onExit={onExit}
        totalScores={isOnline && online ? online.view.totalScores : localScores}
        gamesPlayed={isOnline && online ? online.view.gamesPlayed : localTotals?.games}
        myWin={myWin}
      />
    );
  }

  // 记忆考验：平时一律背面，只有发牌看牌、翻看限时、K 明换展示中的牌正面
  // 信息隐藏：发牌亮牌仅限"本人"且未确认（本地热座=当前待确认真人；联机=自己座位），已盖牌立即转背面；机器人无需亮牌
  const dealReveal = state.phase === 'deal';
  const viewPlayers: ViewPlayer[] = view.players.map((vp, i) => ({
    ...vp,
    slots: vp.slots.map((s) => {
      if (!s.card) return s;
      const faceUp =
        (dealReveal &&
          !state.dealConfirmed[i] &&
          !state.players[i].isBot &&
          (online ? i === online.myId : i === state.currentPlayer)) ||
        faceUpIds.has(s.card.id);
      return { card: s.card, known: faceUp };
    }),
  }));

  return (
    <div className="game">
      <div className="game-header">
        <div className="game-title">换牌王</div>
        <div className="game-status">
          <span className="badge">{PHASE_LABEL[state.phase]}</span>
          {state.declaredPlayer !== null && (
            <span className="badge badge-declared">{state.players[state.declaredPlayer].name} 已定牌</span>
          )}
          <span className="badge badge-deck">牌堆剩余 {deckCount} 张</span>
        </div>
        <div className="header-tools">
          <button
            className={`btn btn-small ${showRules ? 'btn-active' : ''}`}
            onClick={() => setShowRules((v) => !v)}
          >
            规则
          </button>
          <button
            className={`btn btn-small ${showLog ? 'btn-active' : ''}`}
            onClick={() => setShowLog((v) => !v)}
          >
            记录
          </button>
          <button className="btn btn-small" onClick={() => setSettingsOpen(true)}>
            ⚙️ 设置
          </button>
        </div>
        <button className="btn btn-small" onClick={() => (online ? online.onExitGame?.() : onExit())}>
          退出
        </button>
      </div>

      {showRules && <RulesPanel />}

      {/* 快捷表情：按钮展开 + 自定义输入 */}
      <button className="emoji-fab" onClick={() => setEmojiOpen((v) => !v)} aria-label="快捷表情">
        💬
      </button>
      {emojiOpen && (
        <div className="emoji-panel">
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button key={e} className="emoji-btn" onClick={() => {
                showToast(`你：${e}`);
                online?.sendEmoji?.(e);
                setEmojiOpen(false);
              }}>
                {e}
              </button>
            ))}
          </div>
          <div className="emoji-custom">
            <input
              value={emojiText}
              maxLength={20}
              placeholder="输入想说的话…"
              onChange={(ev) => setEmojiText(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && emojiText.trim()) {
                  const t = emojiText.trim();
                  showToast(`你：${t}`);
                  online?.sendEmoji?.(t);
                  setEmojiText("");
                  setEmojiOpen(false);
                }
              }}
            />
            <button className="btn btn-primary" disabled={!emojiText.trim()} onClick={() => {
              const t = emojiText.trim();
              if (!t) return;
              showToast(`你：${t}`);
              online?.sendEmoji?.(t);
              setEmojiText("");
              setEmojiOpen(false);
            }}>
              发送
            </button>
          </div>
        </div>
      )}
      {/* 表情 toast 层 */}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">{t.text}</div>
        ))}
      </div>
      <div className="game-main">
        <div className="table">
          {state.phase === 'follow' && state.follow && (
            <div className="follow-bar">
              <span className="follow-timer">可跟弃 · {followLeft}s</span>
              <button className="btn btn-small" onClick={passFollowAll} disabled={isOnline && gaveUp}>
                {isOnline && gaveUp ? '已放弃（等待其他玩家）' : '放弃'}
              </button>
            </div>
          )}
          <div className="center-area">
            {config?.guided && state.phase === 'deal' && (
              <div className="guided-card">
                <div className="guided-card-title">🎓 教学局开始</div>
                <ul>
                  <li>目标：终局手牌总分<b>最小</b>者胜（并列同时胜出）</li>
                  <li>计分：大小王 0 分 · ♥K −1 分 · A~K = 1~13 分</li>
                  <li>每人 4 张牌：看牌后盖牌，之后<b>凭记忆</b>打牌，不可再翻看</li>
                </ul>
              </div>
            )}
            {config?.guided && state.phase === 'playing' && !state.pending && !state.follow && (() => {
              const humanId = state.players.findIndex((p) => !p.isBot);
              if (state.currentPlayer !== humanId) return null;
              return <div className="guided-tip">💡 轮到你：可摸牌；也可宣布<b>定牌</b>（之后其他人各操作一轮，亮牌总分最小者胜）</div>;
            })()}
            {declareBonusOn && (() => {
              const { n2, n1 } = bonusThresholds(state.players.length);
              return (
                <div className="declare-bonus-hint">
                  定牌奖励：牌堆剩余 ≥{n2} 张 −2 分 · ≥{n1} 张 −1 分
                </div>
              );
            })()}
            <div className="deck-stub">
              <div className="deck-stack" aria-hidden>
                <div className="deck-card deck-card-1" />
                <div className="deck-card deck-card-2" />
                <div className="deck-card deck-card-3" />
              </div>
              <div className="deck-count">{deckCount} 张</div>
            </div>
            {/* "可跟弃"标签：始终固定在最新弃牌（黑框牌）正上方 */}
            <DiscardPile state={state} />
            <UsedPile state={state} />
            {/* 引导局教学提示：跟随牌桌流式显示，不遮挡顶部功能区 */}
            {config?.guided && state.pending?.kind === "drawn" && state.pending.card && (() => {
              const r = String(state.pending.card.rank);
              const isFunc = ["7", "8", "9", "10", "J", "Q", "K"].includes(r);
              return <div className="guided-tip">💡 {isFunc ? (GUIDE_TIP[r] ?? "") : GUIDE_PLAIN}</div>;
            })()}
            {config?.guided && state.phase === "follow" && state.follow && (
              <div className="guided-tip">💡 有玩家弃牌了：手中有相同分数牌的玩家可在 {Math.round((config.followWindowMs ?? 3000) / 1000)} 秒内跟弃（点自己手牌下的"弃"抢先成功；失败罚补 1 张；点"放弃"可提前关闭窗口）</div>
            )}
          </div>

          <div className="seats">
            {viewPlayers.map((vp) => {
              const declared = state.declaredPlayer === vp.id;
              // 弃牌按钮：联机=仅自己座位；热座=所有真人座位（共用屏幕，任何真人随时可跟弃）；持续显示
              const showDiscard =
                (isOnline ? vp.id === (online && online.myId) : !vp.isBot) &&
                state.phase !== 'deal' && state.phase !== 'end';
              return (
                <PlayerSeat
                  key={vp.id}
                  player={vp}
                  isCurrent={vp.id === state.currentPlayer}
                  isDeclared={declared}
                  selectable={
                    (selectableSelf && vp.id === state.currentPlayer) ||
                    (selectableOther && vp.id !== state.currentPlayer)
                  }
                  onSlotClick={(slot) => handleSlotClick(vp.id, slot)}
                  showDiscard={showDiscard}
                  onDiscard={(slot) => dispatch({ type: 'TRY_FOLLOW', playerId: vp.id, slot })}
                  aiControlled={aiControlled.has(vp.id)}
                />
              );
            })}
          </div>
        </div>

        <SwapAnim lastSwap={state.lastSwap} players={state.players} />
        <MoveAnim lastMove={state.lastMove} lastPenalty={state.lastPenalty} players={state.players} />
        <PeekAnim lastViewed={state.lastViewed} mySeat={isOnline && online ? online.myId : undefined} />

        <ActionPanel
          state={state}
          dispatch={dispatch}
          replaceMode={replaceMode}
          setReplaceMode={setReplaceMode}
          kDeciding={kDeciding}
          setKDeciding={setKDeciding}
          myId={isOnline && online ? online.myId : undefined}
        />

        {showLog && <LogPanel state={state} />}
      </div>

      {/* 对局中设置弹窗：页面风格 / BGM 音量 / 音效音量 / 托管开关（仅联机） */}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          extra={
            isOnline && online?.setAutopilot ? (
              (() => {
                const myControlled = online.view.aiControlled?.includes(online.myId) ?? false;
                return (
                  <div className="settings-group">
                    <div className="settings-label">🤖 托管（AI 代打你的回合）</div>
                    <button
                      className={myControlled ? 'btn btn-primary' : 'btn'}
                      onClick={() => online.setAutopilot?.(!myControlled)}
                    >
                      {myControlled ? '托管中 · 点击关闭' : '开启托管'}
                    </button>
                    <p className="hint">开启后你的回合由 AI 自动决策，可随时关闭</p>
                  </div>
                );
              })()
            ) : undefined
          }
        />
      )}
    </div>
  );
}
