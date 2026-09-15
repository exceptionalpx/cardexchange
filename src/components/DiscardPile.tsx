import type { GameState } from '../core/types';
import CardView from './CardView';

/** 弃牌堆：显示最近 4 张，最新一张黑色描边标记；跟弃窗口期在最新牌正上方显示常亮"可跟弃"标签 */
export default function DiscardPile({
  state,
  followHint,
}: {
  state: GameState;
  followHint?: { name: string; cardLabel: string } | null;
}) {
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
      {followHint && (
        <div className="follow-tag" role="status">
          可跟弃
        </div>
      )}
    </div>
  );
}
