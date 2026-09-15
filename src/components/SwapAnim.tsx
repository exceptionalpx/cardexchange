// 换牌动画（猫爪方案 A · 背面版）：
// 猫爪抓住"自己换出的牌"（背面）沿弧线飞向对方牌位，对方牌（背面）反向飞回。
// 一次性播放（约 1.5s），动画期间覆盖层锁定交互，播完不留任何标记。
// 信息边界：飞行副本一律背面，不展示牌面内容。
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../core/types';
import PawSvg from './Paw';

const DURATION = 1500;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AnimPlan {
  selfFrom: Rect;
  selfTo: Rect;
  otherFrom: Rect;
  otherTo: Rect;
}

export default function SwapAnim({ lastSwap }: { lastSwap: GameState['lastSwap'] }) {
  const [plan, setPlan] = useState<AnimPlan | null>(null);
  const pawRef = useRef<HTMLDivElement>(null);
  const otherRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef('');

  useEffect(() => {
    if (!lastSwap) return;
    // 内容级防重：联机广播引用常变，内容相同不重播
    const sig = JSON.stringify(lastSwap);
    if (sig === sigRef.current) return;
    sigRef.current = sig;
    const selfCard = document.querySelector(
      `[data-player="${lastSwap.selfPlayer}"][data-slot="${lastSwap.selfSlot}"] .card`,
    );
    const otherCard = document.querySelector(
      `[data-player="${lastSwap.otherPlayer}"][data-slot="${lastSwap.otherSlot}"] .card`,
    );
    if (!(selfCard instanceof HTMLElement) || !(otherCard instanceof HTMLElement)) return;
    const sr = selfCard.getBoundingClientRect();
    const or = otherCard.getBoundingClientRect();
    // 空槽：动画期间两张牌"离开"原位，槽位显示为空（更真实），动画结束恢复显示换后的牌
    selfCard.classList.add('slot-hide');
    otherCard.classList.add('slot-hide');
    setPlan({
      selfFrom: { x: sr.left, y: sr.top, w: sr.width, h: sr.height },
      selfTo: { x: or.left, y: or.top, w: or.width, h: or.height },
      otherFrom: { x: or.left, y: or.top, w: or.width, h: or.height },
      otherTo: { x: sr.left, y: sr.top, w: sr.width, h: sr.height },
    });
    const t = setTimeout(() => {
      setPlan(null);
      selfCard.classList.remove('slot-hide');
      otherCard.classList.remove('slot-hide');
    }, DURATION);
    return () => {
      clearTimeout(t);
      selfCard.classList.remove('slot-hide');
      otherCard.classList.remove('slot-hide');
    };
  }, [lastSwap]);

  // 播放位移动画（WAAPI）：自己牌+猫爪先飞，对方牌延迟反向飞
  useEffect(() => {
    if (!plan) return;
    const paw = pawRef.current;
    const other = otherRef.current;
    if (!paw || !other) return;

    const dx = plan.selfTo.x - plan.selfFrom.x;
    const dy = plan.selfTo.y - plan.selfFrom.y;
    const mx = dx / 2;
    const my = Math.min(plan.selfFrom.y, plan.selfTo.y) - 80 - plan.selfFrom.y;

    paw.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)' },
        { transform: `translate(${mx}px, ${my}px) scale(1.05)`, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.12)`, offset: 0.92 },
        { transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: 1 },
      ],
      { duration: 1150, easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)' },
    );

    const odx = plan.otherTo.x - plan.otherFrom.x;
    const ody = plan.otherTo.y - plan.otherFrom.y;
    const omx = odx / 2;
    const omy = Math.min(plan.otherFrom.y, plan.otherTo.y) - 80 - plan.otherFrom.y;

    other.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)' },
        { transform: `translate(${omx}px, ${omy}px) scale(1.05)`, offset: 0.5 },
        { transform: `translate(${odx}px, ${ody}px) scale(1.12)`, offset: 0.94 },
        { transform: `translate(${odx}px, ${ody}px) scale(1)`, offset: 1 },
      ],
      { duration: 900, delay: 260, easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)' },
    );
  }, [plan]);

  if (!plan) return null;

  return (
    <div className="swap-anim-layer" aria-hidden>
      <div
        ref={pawRef}
        className="swap-fly"
        style={{ left: plan.selfFrom.x, top: plan.selfFrom.y, width: plan.selfFrom.w, height: plan.selfFrom.h }}
      >
        <div className="swap-paw" aria-hidden>
          <PawSvg />
        </div>
        <div className="swap-fly-card card card-back">?</div>
      </div>
      <div
        ref={otherRef}
        className="swap-fly"
        style={{ left: plan.otherFrom.x, top: plan.otherFrom.y, width: plan.otherFrom.w, height: plan.otherFrom.h }}
      >
        <div className="swap-fly-card card card-back">?</div>
      </div>
    </div>
  );
}
