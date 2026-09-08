import { useCallback, useEffect, useMemo, useState } from 'react';
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
  follow: '跟弃窗口',
  final: '定牌终局',
  end: '已结束',
};

export default function GameScreen({ config, onExit }: Props) {
  const [state, setState] = useState<GameState>(() =>
    createGame({ playerCount: config.playerCount, botCount: config.botCount }),
  );
  const [replaceMode, setReplaceMode] = useState(false);

  const dispatch = useCallback((a: Action) => {
    setState((s) => applyAction(s, a));
  }, []);

  const restart = useCallback(() => {
    setReplaceMode(false);
    setState(createGame({ playerCount: config.playerCount, botCount: config.botCount }));
  }, [config]);

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
          // 随机延迟模拟"速度最快者成功"
          const delay = 500 + Math.random() * 1200;
          timers.push(setTimeout(() => dispatch(aiDecide(state, id)), delay));
        }
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [state, dispatch]);

  // ---- 视角（始终为当前行动玩家，防止热座泄露） ----
  const view = useMemo(() => buildView(state, state.currentPlayer), [state]);

  const pend = state.pending;
  const selectableSelf =
    pend?.kind === 'chooseSelfSlot' || (pend?.kind === 'drawn' && replaceMode);
  const selectableOther = pend?.kind === 'chooseOtherSlot';

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

  // 发牌阶段：当前玩家需要看到自己的真实手牌（knowledge 尚未写入）
  const dealReveal = state.phase === 'deal';
  const viewPlayers: ViewPlayer[] = view.players.map((vp, i) =>
    dealReveal && i === state.currentPlayer
      ? { ...vp, slots: state.players[i].handSlots.map((c) => ({ card: c, known: true })) }
      : vp,
  );

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
                />
              );
            })}
          </div>
        </div>

        <ActionPanel state={state} dispatch={dispatch} replaceMode={replaceMode} setReplaceMode={setReplaceMode} />

        <LogPanel state={state} />
      </div>
    </div>
  );
}
