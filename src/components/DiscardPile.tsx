import type { GameState } from '../core/types';
import CardView from './CardView';

/** 弃牌堆：显示最近 4 张，最新一张黑色描边标记；"可跟弃"标签始终固定显示在最新弃牌（黑框牌）正上方 */
export default function DiscardPile({ state }: { state: GameState }) {
  const recent = state.discardPile.slice(-4).reverse();
  return (
    <div className="discard-pile">
      <div className="pile-label">弃牌堆 {state.discardPile.length} 张</div>
      <div className="pile-cards">
        {recent.length === 0 && <div className="pile-empty">空</div>}
        {recent.map((c, i) => {
          const card = (
            <CardView key={c.id} card={c} known extraClass={i === 0 ? 'card-newest' : undefined} />
          );
          // 最新弃牌（黑框牌）外包一层相对定位容器，标签固定在其正上方
          return i === 0 ? (
            <div key={c.id} className="pile-newest-wrap">
              {card}
              <div className="follow-tag" role="status">
                可跟弃
              </div>
            </div>
          ) : (
            card
          );
        })}
      </div>
    </div>
  );
}
