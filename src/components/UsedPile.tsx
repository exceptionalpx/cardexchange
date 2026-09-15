import type { GameState } from '../core/types';
import CardView, { abilityDesc } from './CardView';

/** 功能区：发动过功能的牌（7/8/9/10/J/Q/K 用掉后进入，不混入弃牌堆），牌面展示功能标签 */
export default function UsedPile({ state }: { state: GameState }) {
  const recent = state.usedPile.slice(-4).reverse();
  return (
    <div className="discard-pile used-pile">
      <div className="pile-label">功能区 {state.usedPile.length} 张</div>
      <div className="pile-cards">
        {recent.length === 0 && <div className="pile-empty">空</div>}
        {recent.map((c) => (
          <CardView key={c.id} card={c} known footNote={abilityDesc(c) ?? undefined} />
        ))}
      </div>
    </div>
  );
}
