// 被看牌提示动画：
// - 别人用 9/10 看他人 / K 明换查看时，被看的那张牌（背面）在原地"拿起 - 晃动 - 放下"，提示哪一张被看了；
// - 自己用 7/8 看自己牌时同样播放（牌面只对自己展示，其他玩家只见背面被拿起）；
// - 联机：只有"被看者本人"（targetPlayer === mySeat）的客户端播放，避免第三人看到他人被看哪张牌（信息边界）；
// - 热座（mySeat 为空）：共享屏幕，直接播放。
import { useEffect, useRef } from 'react';
import type { GameState } from '../core/types';

interface Props {
  lastViewed: GameState['lastViewed'];
  /** 联机模式传入自己的座位号；热座模式不传（共享屏幕，直接播放） */
  mySeat?: number;
}

export default function PeekAnim({ lastViewed, mySeat }: Props) {
  const sigRef = useRef('');

  useEffect(() => {
    if (!lastViewed) return;
    // 联机：只有被看者本人需要看到动画（第三人不应得知"哪张牌被看了"）
    if (mySeat !== undefined && lastViewed.targetPlayer !== mySeat) return;
    // 内容级防重：联机广播引用常变，内容相同不重播
    const sig = JSON.stringify(lastViewed);
    if (sig === sigRef.current) return;
    sigRef.current = sig;
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
  }, [lastViewed, mySeat]);

  return null;
}
