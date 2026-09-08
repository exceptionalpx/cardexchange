import type { GameState } from '../core/types';
import CardView from './CardView';

export default function DiscardPile({ state }: { state: GameState }) {
  const recent = state.discardPile.slice(-4).reverse();
  return (
    <div className="discard-pile">
      <div className="pile-label">弃牌堆 {state.discardPile.length} 张</div>
      <div className="pile-cards">
        {recent.length === 0 && <div className="pile-empty">空</div>}
        {recent.map((c) => (
          <CardView key={c.id} card={c} known />
        ))}
      </div>
    </div>
  );
}
