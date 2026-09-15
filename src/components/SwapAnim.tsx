// 换牌动画（猫爪方案 A · 背面版）：
// 猫爪抓住"自己换出的牌"（背面）沿弧线飞向对方牌位，对方牌（背面）反向飞回。
// 一次性播放（约 1.5s），动画期间覆盖层锁定交互，播完不留任何标记。
// 信息边界：飞行副本一律背面，不展示牌面内容。
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../core/types';
import { pawForAvatar } from '../core/pawAssets';

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
  /** 空槽恢复用：双方槽位定位键（player-slot） */
  selfKey: string;
  otherKey: string;
}

export default function SwapAnim({
  lastSwap,
  players,
}: {
  lastSwap: GameState['lastSwap'];
  /** 换牌者头像来源（座位头像在各端视图已同步），缺省时用猫爪兜底 */
  players?: GameState['players'];
}) {
  const [plan, setPlan] = useState<AnimPlan | null>(null);
  const pawRef = useRef<HTMLDivElement>(null);
  const otherRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!lastSwap) return;
    // 按 seq 防重：联机广播引用常变；内容相同但事件不同（同槽位二次换牌）也要播放
    if (lastSwap.seq <= seqRef.current) return;
    seqRef.current = lastSwap.seq;
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
      selfKey: `${lastSwap.selfPlayer}-${lastSwap.selfSlot}`,
      otherKey: `${lastSwap.otherPlayer}-${lastSwap.otherSlot}`,
    });
    // 空槽恢复交给播放 effect（动画播完即恢复）
    return () => {
      selfCard.classList.remove('slot-hide');
      otherCard.classList.remove('slot-hide');
    };
  }, [lastSwap]);

  // 播放位移动画（WAAPI）：自己牌+猫爪先飞，对方牌延迟反向飞；
  // 播完（finished）立即恢复空槽并清理动画层，避免"小牌停留/跳回"残留
  useEffect(() => {
    if (!plan) return;
    const paw = pawRef.current;
    const other = otherRef.current;
    if (!paw || !other) return;

    const dx = plan.selfTo.x - plan.selfFrom.x;
    const dy = plan.selfTo.y - plan.selfFrom.y;
    const mx = dx / 2;
    const my = Math.min(plan.selfFrom.y, plan.selfTo.y) - 80 - plan.selfFrom.y;

    const a1 = paw.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)' },
        { transform: `translate(${mx}px, ${my}px) scale(1.05)`, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.12)`, offset: 0.92 },
        { transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: 1 },
      ],
      { duration: 1150, fill: 'forwards', easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)' },
    );

    const odx = plan.otherTo.x - plan.otherFrom.x;
    const ody = plan.otherTo.y - plan.otherFrom.y;
    const omx = odx / 2;
    const omy = Math.min(plan.otherFrom.y, plan.otherTo.y) - 80 - plan.otherFrom.y;

    const a2 = other.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)' },
        { transform: `translate(${omx}px, ${omy}px) scale(1.05)`, offset: 0.5 },
        { transform: `translate(${odx}px, ${ody}px) scale(1.12)`, offset: 0.94 },
        { transform: `translate(${odx}px, ${ody}px) scale(1)`, offset: 1 },
      ],
      { duration: 900, delay: 260, fill: 'forwards', easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)' },
    );

    const restoreSlots = () => {
      const selfCard = document.querySelector(
        `[data-player="${plan.selfKey.split('-')[0]}"][data-slot="${plan.selfKey.split('-')[1]}"] .card`,
      );
      const otherCard = document.querySelector(
        `[data-player="${plan.otherKey.split('-')[0]}"][data-slot="${plan.otherKey.split('-')[1]}"] .card`,
      );
      selfCard?.classList.remove('slot-hide');
      otherCard?.classList.remove('slot-hide');
    };
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      restoreSlots();
      setPlan(null);
    };
    Promise.allSettled([a1.finished, a2.finished]).then(cleanup);
    const t = setTimeout(cleanup, 2200);
    return () => {
      clearTimeout(t);
      a1.cancel();
      a2.cancel();
      restoreSlots();
    };
  }, [plan]);

  if (!plan || !lastSwap) return null;

  // 换牌者头像 → 爪型素材（机器人=机械手，自定义头像/未知=猫爪兜底）
  const actorAvatar = players?.[lastSwap.actor]?.avatar;
  const pawUrl = pawForAvatar(actorAvatar);

  return (
    <div className="swap-anim-layer" aria-hidden>
      <div
        ref={pawRef}
        className="swap-fly"
        style={{ left: plan.selfFrom.x, top: plan.selfFrom.y, width: plan.selfFrom.w, height: plan.selfFrom.h }}
      >
        <div className="swap-paw" aria-hidden>
          <img className="swap-paw-img" src={pawUrl} alt="" draggable={false} />
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
