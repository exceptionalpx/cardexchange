import { useEffect, useRef } from 'react';
import type { GameState, LogKind } from '../core/types';

/** 真人按座位取色板（蓝/橙/绿/紫），机器人统一灰色 */
const PLAYER_COLOR_KEYS = ['pc-0', 'pc-1', 'pc-2', 'pc-3'];

export default function LogPanel({ state }: { state: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [state.log.length]);

  return (
    <div className="log-panel" ref={ref}>
      <div className="pile-label">游戏进程</div>
      {state.log.slice(-40).map((entry, i) => {
        // 玩家名用玩家色：从完整文本里剥离 name 前缀，动作部分按操作类型着色
        const player = entry.playerId >= 0 ? state.players[entry.playerId] : undefined;
        const name = player?.name ?? '';
        const body = name && entry.text.startsWith(name) ? entry.text.slice(name.length) : '';
        const rest = body ? body : entry.text;
        const colorKey =
          entry.playerId < 0
            ? ''
            : player?.isBot
              ? 'pc-bot'
              : PLAYER_COLOR_KEYS[entry.playerId % PLAYER_COLOR_KEYS.length];
        const kind: LogKind = entry.kind ?? 'info';
        return (
          <div key={i} className={`log-entry ${entry.playerId < 0 ? 'log-system' : ''}`}>
            {name && <span className={`log-player ${colorKey}`}>{name}</span>}
            <span className={`log-action ok-${kind}`}>{rest}</span>
          </div>
        );
      })}
    </div>
  );
}
