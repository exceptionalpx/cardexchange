// 弃牌 / 替换 / 罚牌动画：
// - 弃牌：一张牌（真实牌面，弃牌会公开进弃牌堆）从弃牌者座位飞向弃牌堆（简单飞行）
// - 替换：猫爪抓住新牌（背面，进手牌保密）从座位飞进目标槽位；被替换旧牌（真实牌面，进弃牌堆）弹起飞向弃牌堆
// - 罚牌：一张背面牌从牌堆飞入被罚玩家槽位，落位后槽位短暂高亮"罚牌"
// 内容级防重：联机广播会重建对象引用，只有内容真正变化才播一次，避免动画重复。
import { useEffect, useRef, useState } from 'react';
import type { Card, GameState } from '../core/types';
import PawSvg from './Paw';
import CardView from './CardView';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Plan {
  kind: 'discard' | 'replace' | 'penalty';
  /** 弃牌者座位中心（起点） */
  seat: Rect;
  /** 弃牌堆位置 */
  discard: Rect;
  /** replace：目标槽位；penalty：被罚槽位 */
  slot?: Rect;
  /** 飞行卡真实牌面（弃的牌 / 被替换旧牌，均公开进弃牌堆）；penalty 无牌面用背面 */
  card?: Card;
  /** penalty：被罚玩家与槽位（落位后高亮用） */
  targetPlayer?: number;
  targetSlot?: number;
  /** replace：动画期间隐藏的目标槽位牌（空槽），结束恢复 */
  hideEl?: HTMLElement | null;
}

interface Props {
  lastMove: GameState['lastMove'];
  lastPenalty: GameState['lastPenalty'];
}

export default function MoveAnim({ lastMove, lastPenalty }: Props) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const pawRef = useRef<HTMLDivElement>(null);
  const oldRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const moveSigRef = useRef('');
  const penaltySigRef = useRef('');

  // 弃牌 / 替换：内容签名防重（联机广播引用常变，内容相同不重播）
  useEffect(() => {
    if (!lastMove) return;
    const sig = JSON.stringify(lastMove);
    if (sig === moveSigRef.current) return;
    moveSigRef.current = sig;

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
      card: lastMove.kind === 'discard' ? lastMove.card : lastMove.replaced,
    };
    if (lastMove.kind === 'replace') {
      const slotEl = document.querySelector(
        `[data-player="${lastMove.actor}"][data-slot="${lastMove.slot}"] .card`,
      );
      if (!(slotEl instanceof HTMLElement)) return;
      const sl = slotEl.getBoundingClientRect();
      base.slot = { x: sl.left, y: sl.top, w: sl.width, h: sl.height };
      // 空槽：动画期间被替换槽位隐藏（旧牌被拿走、新牌未落定），动画结束恢复显示新牌
      base.hideEl = slotEl;
      base.hideEl.classList.add('slot-hide');
    }
    setPlan(base);
    // 动画层清理交给播放 effect（finished 驱动）；这里兜底恢复槽位牌
    return () => {
      base.hideEl?.classList.remove('slot-hide');
    };
  }, [lastMove]);

  // 罚牌：背面牌从牌堆飞入槽位，落位后槽位高亮
  useEffect(() => {
    if (!lastPenalty) return;
    const sig = JSON.stringify(lastPenalty);
    if (sig === penaltySigRef.current) return;
    penaltySigRef.current = sig;

    const deckEl = document.querySelector('.deck-stub');
    if (!(deckEl instanceof HTMLElement)) return;
    const dr = deckEl.getBoundingClientRect();
    const slotEl = document.querySelector(
      `[data-player="${lastPenalty.actor}"][data-slot="${lastPenalty.slot}"] .card`,
    );
    if (!(slotEl instanceof HTMLElement)) return;
    const sl = slotEl.getBoundingClientRect();
    setPlan({
      kind: 'penalty',
      seat: { x: dr.left + dr.width / 2 - 20, y: dr.top + dr.height / 2 - 28, w: 40, h: 56 },
      discard: { x: sl.left, y: sl.top, w: sl.width, h: sl.height },
      slot: { x: sl.left, y: sl.top, w: sl.width, h: sl.height },
      targetPlayer: lastPenalty.actor,
      targetSlot: lastPenalty.slot,
    });
  }, [lastPenalty]);

  // 播放动画；播完（finished）立即清理动画层，避免"小牌停留/跳回"残留
  useEffect(() => {
    if (!plan) return;
    const anims: Animation[] = [];

    if (plan.kind === 'discard') {
      const fly = flyRef.current;
      if (!fly) return;
      const dx = plan.discard.x - plan.seat.x;
      const dy = plan.discard.y - plan.seat.y;
      anims.push(
        fly.animate(
          [
            { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
            { transform: `translate(${dx / 2}px, ${dy / 2 - 70}px) scale(1.04)`, offset: 0.5, opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.72)`, offset: 1, opacity: 0.9 },
          ],
          { duration: 850, fill: 'forwards', easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)' },
        ),
      );
    } else if (plan.kind === 'penalty') {
      const fly = flyRef.current;
      if (!fly) return;
      const dx = plan.discard.x - plan.seat.x;
      const dy = plan.discard.y - plan.seat.y;
      anims.push(
        fly.animate(
          [
            { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
            { transform: `translate(${dx / 2}px, ${dy / 2 - 60}px) scale(1.05)`, offset: 0.5, opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.95)`, offset: 1, opacity: 1 },
          ],
          { duration: 800, fill: 'forwards', easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)' },
        ),
      );
      // 落位后槽位短暂高亮"罚牌"
      if (plan.targetPlayer !== undefined && plan.targetSlot !== undefined) {
        const slotCard = document.querySelector(
          `[data-player="${plan.targetPlayer}"][data-slot="${plan.targetSlot}"] .card`,
        );
        if (slotCard instanceof HTMLElement) {
          slotCard.classList.add('penalty-flash');
          setTimeout(() => slotCard.classList.remove('penalty-flash'), 1300);
        }
      }
    } else {
      // replace：猫爪送新牌（背面）进槽位（先落定，约 0.75s）→ 停顿 → 旧牌弹出到弃牌堆（后走，主次分明不交叉）
      const paw = pawRef.current;
      const oldCard = oldRef.current;
      if (!paw || !oldCard || !plan.slot) return;
      const dx = plan.slot.x - plan.seat.x;
      const dy = plan.slot.y - plan.seat.y;
      anims.push(
        paw.animate(
          [
            { transform: 'translate(0px, 0px) scale(1)' },
            { transform: `translate(${dx / 2}px, ${dy / 2 - 70}px) scale(1.05)`, offset: 0.5 },
            { transform: `translate(${dx}px, ${dy}px) scale(1.1)`, offset: 0.92 },
            { transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: 1 },
          ],
          { duration: 750, fill: 'forwards', easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)' },
        ),
      );
      const odx = plan.discard.x - plan.slot.x;
      const ody = plan.discard.y - plan.slot.y;
      anims.push(
        oldCard.animate(
          [
            { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
            { transform: `translate(${odx / 2}px, ${ody / 2 - 60}px) scale(1.04)`, offset: 0.5, opacity: 1 },
            { transform: `translate(${odx}px, ${ody}px) scale(0.72)`, offset: 1, opacity: 0.9 },
          ],
          { duration: 700, delay: 450, fill: 'forwards', easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)' },
        ),
      );
    }

    // 动画全部播完立即清理（不再等待固定时长）；兜底定时器防止后台页动画暂停导致永不触发
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      plan.hideEl?.classList.remove('slot-hide');
      setPlan(null);
    };
    Promise.allSettled(anims.map((a) => a.finished)).then(cleanup);
    const t = setTimeout(cleanup, 2200);
    return () => {
      clearTimeout(t);
      anims.forEach((a) => a.cancel());
      plan.hideEl?.classList.remove('slot-hide');
    };
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
          <div className="swap-fly-card card">
            <CardView card={plan.card!} known />
          </div>
        </div>
      </div>
    );
  }

  if (plan.kind === 'penalty') {
    return (
      <div className="swap-anim-layer" aria-hidden>
        <div
          ref={flyRef}
          className="swap-fly"
          style={{ left: plan.seat.x, top: plan.seat.y, width: plan.seat.w, height: plan.seat.h }}
        >
          <div className="swap-fly-card card card-back">?</div>
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
        <div className="swap-fly-card card">
          <CardView card={plan.card!} known />
        </div>
      </div>
    </div>
  );
}
