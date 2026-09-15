import type { GameState } from '../core/types';
import CardView from './CardView';

/** 弃牌堆：显示最近 4 张，最新一张黑色描边标记 */
export default function DiscardPile({ state }: { state: GameState }) {
  const recent = state.discardPile.slice(-4).reverse();
  return (
    <div className="discard-pile">
      <div className="pile-label">弃牌堆 {state.discardPile.length} 张</div>
      <div className="pile-cards">
        {recent.length === 0 && <div className="pile-empty">空</div>}
        {recent.map((c, i) => (
          <CardView key={c.id} card={c} known extraClass={i === 0 ? 'card-newest' : undefined} />
        ))}
      </div>
    </div>
  );
}
