import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameConfigUI } from '../App';
import type { Action, GameState } from '../core/types';
import { applyAction, createGame } from '../core/engine';
import { aiDecide } from '../core/ai';
import { buildView, type ViewPlayer } from '../core/view';
import PlayerSeat from './PlayerSeat';
import ActionPanel from './ActionPanel';
import LogPanel from './LogPanel';
import DiscardPile from './DiscardPile';
import ResultScreen from './ResultScreen';

interface Props {
  config: GameConfigUI;
  onExit: () => void;
}

const PHASE_LABEL: Record<GameState['phase'], string> = {
  deal: '发牌（轮流看牌盖牌）',
  playing: '对局中',
  follow: '对局中', // 跟弃窗口不主动提示，是否跟弃由玩家自行判断
  final: '定牌终局',
  end: '已结束',
};

const REVEAL_MS = 5000; // 翻看展示限时
const FOLLOW_WINDOW_MS = 4000; // 跟弃窗口固定时长

/**
 * 计算翻看/明换展示中需要强制正面的牌。
 * 信息隐藏：只有"真人"发动者（revealDone.viewer / confirmReveal 时 currentPlayer）能看到牌面；
 * 机器人发动的翻看/明换不向玩家亮牌，玩家只能通过行为推理。
 */
export function computeFaceUpIds(
  pending: GameState['pending'],
  players: GameState['players'],
  currentPlayer: number,
): Set<string> {
  const set = new Set<string>();
  const viewerIsBot =
    (pending?.kind === 'revealDone' && players[pending.viewer].isBot) ||
    (pending?.kind === 'confirmReveal' && players[currentPlayer].isBot);
  if (pending?.kind === 'revealDone' && !viewerIsBot) {
    set.add(pending.card.id);
  }
  if (pending?.kind === 'confirmReveal' && !viewerIsBot) {
    set.add(pending.selfCard.id);
    set.add(pending.otherCard.id);
  }
  return set;
}

export default function GameScreen({ config, onExit }: Props) {
  const [state, setState] = useState<GameState>(() =>
    createGame({ playerCount: config.playerCount, botCount: config.botCount }),
  );
  const [replaceMode, setReplaceMode] = useState(false);
  const [kDeciding, setKDeciding] = useState(false);
  // 最近一次换牌换入的槽位标记（展示 3 秒后清除，不持续）
  const [swapMark, setSwapMark] = useState<{ playerId: number; slot: number }[] | null>(null);

  const dispatch = useCallback((a: Action) => {
    setState((s) => applyAction(s, a));
  }, []);

  const restart = useCallback(() => {
    setReplaceMode(false);
    setKDeciding(false);
    setSwapMark(null);
    setState(createGame({ playerCount: config.playerCount, botCount: config.botCount }));
  }, [config]);

  // ---- 换牌标记：监听 lastSwap 变化，高亮双方换入的槽位 3 秒后自动清除 ----
  useEffect(() => {
    if (!state.lastSwap) return;
    const { selfPlayer, selfSlot, otherPlayer, otherSlot } = state.lastSwap;
    setSwapMark([
      { playerId: selfPlayer, slot: selfSlot },
      { playerId: otherPlayer, slot: otherSlot },
    ]);
    const t = setTimeout(() => setSwapMark(null), 3000);
    return () => clearTimeout(t);
  }, [state.lastSwap]);

  // ---- 机器人自动行动调度 ----
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const current = state.players[state.currentPlayer];

    if (state.phase === 'deal' && current.isBot) {
      timers.push(setTimeout(() => dispatch({ type: 'CONFIRM_DEAL' }), 600));
    } else if ((state.phase === 'playing' || state.phase === 'final') && current.isBot) {
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
  }, [state, dispatch]);

  // ---- 跟弃窗口 4 秒超时：未操作的真人均视为放弃 ----
  const followStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (state.phase !== 'follow' || !state.follow) {
      followStartRef.current = null;
      return;
    }
    if (followStartRef.current === null) followStartRef.current = Date.now();
    const remaining = Math.max(0, FOLLOW_WINDOW_MS - (Date.now() - followStartRef.current));
    const t = setTimeout(() => {
      setState((s) => {
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
  }, [state.phase, state.follow]);

  // ---- 翻看（7/8、9/10）5 秒限时：到点自动收起 ----
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

  // ---- 视角（始终为当前行动玩家，防止热座泄露） ----
  const view = useMemo(() => buildView(state, state.currentPlayer), [state]);

  // 翻看/明换展示中的牌（强制正面）
  // 信息隐藏：机器人发动的翻看/明换不向玩家亮牌（只有发动者能看到，玩家只能通过行为推理）
  const faceUpIds = useMemo(
    () => computeFaceUpIds(state.pending, state.players, state.currentPlayer),
    [state.pending, state.currentPlayer, state.players],
  );

  const pend = state.pending;
  const selectableSelf =
    pend?.kind === 'chooseSelfSlot' || (pend?.kind === 'drawn' && replaceMode);
  const selectableOther = pend?.kind === 'chooseOtherSlot';

  // 当前可操作真人（跟弃窗口：第一个待决策真人；平时：当前真人玩家）
  const activeHumanId = useMemo(() => {
    if (state.phase === 'follow' && state.follow) {
      const e = Object.entries(state.follow.decisions).find(
        ([id, d]) => d === 'pending' && !state.players[Number(id)].isBot,
      );
      return e ? Number(e[0]) : null;
    }
    const cur = state.players[state.currentPlayer];
    return cur.isBot ? null : state.currentPlayer;
  }, [state]);

  function handleSlotClick(playerId: number, slot: number) {
    if (pend?.kind === 'chooseSelfSlot') {
      if (playerId === state.currentPlayer) dispatch({ type: 'PICK_SELF_SLOT', slot });
    } else if (pend?.kind === 'chooseOtherSlot') {
      if (playerId !== state.currentPlayer) dispatch({ type: 'PICK_OTHER', playerId, slot });
    } else if (pend?.kind === 'drawn' && replaceMode) {
      if (playerId === state.currentPlayer) {
        dispatch({ type: 'REPLACE', slot });
        setReplaceMode(false);
      }
    }
  }

  if (state.phase === 'end') {
    return <ResultScreen state={state} onRestart={restart} onExit={onExit} />;
  }

  // 记忆考验：平时一律背面，只有发牌看牌、翻看限时、K 明换展示中的牌正面
  // 信息隐藏：发牌亮牌仅限"真人"当前玩家（机器人看牌时自动确认，绝不亮牌）
  const dealReveal = state.phase === 'deal';
  const viewPlayers: ViewPlayer[] = view.players.map((vp, i) => ({
    ...vp,
    slots: vp.slots.map((s) => {
      if (!s.card) return s;
      const faceUp =
        (dealReveal && i === state.currentPlayer && !state.players[i].isBot) ||
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
          <span className="badge">牌堆剩余 {state.deck.length} 张</span>
        </div>
        <button className="btn btn-small" onClick={onExit}>
          退出
        </button>
      </div>

      <div className="rules-panel">
        <div className="pile-label">规则</div>
        <ul>
          <li>定牌后手牌总分<b>最小</b>者胜（并列同胜）</li>
          <li>大小王 0 分 · ♥K -1 分 · A~K = 1~13</li>
          <li>7/8 看自己 · 9/10 看别人 · J/Q 暗换 · K 明换</li>
          <li>弃牌不补牌；同分可跟弃，抢先成功，失败罚补 1 张</li>
          <li>自己回合可定牌，其余人各操作一轮后终局</li>
          <li>牌堆耗尽：总分最低者胜</li>
        </ul>
      </div>

      <div className="game-main">
        <div className="table">
          <div className="center-area">
            <div className="deck-stub">
              <div className="pile-label">牌堆</div>
              <div className="deck-count">{state.deck.length} 张</div>
            </div>
            <DiscardPile state={state} />
          </div>

          <div className="seats">
            {viewPlayers.map((vp) => {
              const declared = state.declaredPlayer === vp.id;
              const showDiscard =
                vp.id === activeHumanId &&
                state.pending === null &&
                state.phase !== 'deal' &&
                state.phase !== 'end';
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
                  swapSlots={swapMark?.filter((m) => m.playerId === vp.id).map((m) => m.slot)}
                />
              );
            })}
          </div>
        </div>

        <ActionPanel
          state={state}
          dispatch={dispatch}
          replaceMode={replaceMode}
          setReplaceMode={setReplaceMode}
          kDeciding={kDeciding}
          setKDeciding={setKDeciding}
        />

        <LogPanel state={state} />
      </div>
    </div>
  );
}
