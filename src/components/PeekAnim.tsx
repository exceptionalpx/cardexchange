// 被看牌提示动画：别人的 9/10 看他人牌 / K 明换查看时，
// 被看的那张牌（背面）在原地"拿起 - 晃动 - 放下"，提示哪一张被看了；不展示牌面。
import { useEffect } from 'react';
import type { GameState } from '../core/types';

export default function PeekAnim({ lastViewed }: { lastViewed: GameState['lastViewed'] }) {
  useEffect(() => {
    if (!lastViewed) return;
    const cardEl = document.querySelector(
      `[data-player="${lastViewed.targetPlayer}"][data-slot="${lastViewed.targetSlot}"] .card`,
    );
    if (!(cardEl instanceof HTMLElement)) return;
    cardEl.classList.add('peek-lift');
    const anim = cardEl.animate(
      [
        { transform: 'translate(0px, 0px) rotate(0deg)' },
        { transform: 'translate(0px, -30px) rotate(-5deg)', offset: 0.25 },
        { transform: 'translate(0px, -30px) rotate(4deg)', offset: 0.5 },
        { transform: 'translate(0px, -22px) rotate(-3deg)', offset: 0.72 },
        { transform: 'translate(0px, 0px) rotate(0deg)', offset: 1 },
      ],
      { duration: 950, easing: 'ease-in-out', composite: 'add' },
    );
    const t = setTimeout(() => cardEl.classList.remove('peek-lift'), 1000);
    return () => {
      anim.cancel();
      clearTimeout(t);
      cardEl.classList.remove('peek-lift');
    };
  }, [lastViewed]);

  return null;
}
