// 弃牌 / 替换动画：
// - 弃牌：一张牌（正面白卡）从弃牌者座位飞向弃牌堆（简单飞行）
// - 替换：猫爪抓住新牌（背面）从座位飞进目标槽位；被替换的旧牌（正面白卡）弹起飞向弃牌堆
// 一次性播放，播完自动清理；动画牌面不显示真实内容（弃牌堆会展示真实牌面）。
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../core/types';
import PawSvg from './Paw';

const DURATION = 1400;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Plan {
  kind: 'discard' | 'replace';
  /** 弃牌者座位中心（起点） */
  seat: Rect;
  /** 弃牌堆位置 */
  discard: Rect;
  /** replace：目标槽位 */
  slot?: Rect;
}

export default function MoveAnim({ lastMove }: { lastMove: GameState['lastMove'] }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const pawRef = useRef<HTMLDivElement>(null);
  const oldRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lastMove) return;
    console.log('[MoveAnim] effect', lastMove);
    const seatEl = document.querySelector(`[data-player="${lastMove.actor}"]`);
    if (!(seatEl instanceof HTMLElement)) return;
    const sr = seatEl.getBoundingClientRect();
    const discardEl = document.querySelector('.discard-pile .pile-cards');
    if (!(discardEl instanceof HTMLElement)) return;
    const dr = discardEl.getBoundingClientRect();
    const base: Plan = {
      kind: lastMove.kind,
      seat: { x: sr.left + sr.width / 2 - 20, y: sr.top + sr.height / 2 - 28, w: 40, h: 56 },
      discard: { x: dr.left + dr.width / 2 - 20, y: dr.top + dr.height / 2 - 28, w: 40, h: 56 },
    };
    if (lastMove.kind === 'replace') {
      const slotEl = document.querySelector(
        `[data-player="${lastMove.actor}"][data-slot="${lastMove.slot}"] .card`,
      );
      if (!(slotEl instanceof HTMLElement)) return;
      const sl = slotEl.getBoundingClientRect();
      base.slot = { x: sl.left, y: sl.top, w: sl.width, h: sl.height };
    }
    console.log('[MoveAnim] setPlan', base);
    setPlan(base);
    const t = setTimeout(() => setPlan(null), DURATION);
    return () => clearTimeout(t);
  }, [lastMove]);

  // 播放动画
  useEffect(() => {
    if (!plan) return;
    if (plan.kind === 'discard') {
      const fly = flyRef.current;
      if (!fly) return;
      const dx = plan.discard.x - plan.seat.x;
      const dy = plan.discard.y - plan.seat.y;
      fly.animate(
        [
          { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
          { transform: `translate(${dx / 2}px, ${dy / 2 - 70}px) scale(1.04)`, offset: 0.5, opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.72)`, offset: 1, opacity: 0.9 },
        ],
        { duration: 850, easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)' },
      );
      return;
    }
    // replace：猫爪送新牌（背面）进槽位 + 旧牌弹出到弃牌堆
    const paw = pawRef.current;
    const oldCard = oldRef.current;
    if (!paw || !oldCard || !plan.slot) return;
    const dx = plan.slot.x - plan.seat.x;
    const dy = plan.slot.y - plan.seat.y;
    paw.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)' },
        { transform: `translate(${dx / 2}px, ${dy / 2 - 70}px) scale(1.05)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.1)`, offset: 0.92 },
        { transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: 1 },
      ],
      { duration: 1050, easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)' },
    );
    const odx = plan.discard.x - plan.slot.x;
    const ody = plan.discard.y - plan.slot.y;
    oldCard.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
        { transform: `translate(${odx / 2}px, ${ody / 2 - 60}px) scale(1.04)`, offset: 0.5, opacity: 1 },
        { transform: `translate(${odx}px, ${ody}px) scale(0.72)`, offset: 1, opacity: 0.9 },
      ],
      { duration: 800, delay: 260, easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)' },
    );
  }, [plan]);

  if (!plan) return null;

  if (plan.kind === 'discard') {
    return (
      <div className="swap-anim-layer" aria-hidden>
        <div
          ref={flyRef}
          className="swap-fly"
          style={{ left: plan.seat.x, top: plan.seat.y, width: plan.seat.w, height: plan.seat.h }}
        >
          <div className="swap-fly-card card fly-card-face" />
        </div>
      </div>
    );
  }

  return (
    <div className="swap-anim-layer" aria-hidden>
      <div
        ref={pawRef}
        className="swap-fly"
        style={{ left: plan.seat.x, top: plan.seat.y, width: plan.seat.w, height: plan.seat.h }}
      >
        <div className="swap-paw" aria-hidden>
          <PawSvg />
        </div>
        <div className="swap-fly-card card card-back">?</div>
      </div>
      <div
        ref={oldRef}
        className="swap-fly"
        style={{ left: plan.slot?.x, top: plan.slot?.y, width: plan.slot?.w, height: plan.slot?.h }}
      >
        <div className="swap-fly-card card fly-card-face" />
      </div>
    </div>
  );
}
