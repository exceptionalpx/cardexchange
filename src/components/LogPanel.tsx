import { useEffect, useRef } from 'react';
import type { GameState } from '../core/types';

export default function LogPanel({ state }: { state: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [state.log.length]);

  return (
    <div className="log-panel" ref={ref}>
      <div className="pile-label">游戏进程</div>
      {state.log.slice(-40).map((entry, i) => (
        <div key={i} className={`log-entry ${entry.playerId < 0 ? 'log-system' : ''}`}>
          {entry.text}
        </div>
      ))}
    </div>
  );
}
