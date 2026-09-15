// 玩家视角构造（信息隐藏）
// 所有可见性判断均基于 viewer 自己的 knowledge，防止热座同屏泄露信息。
import type { Card, GameState } from './types';

export interface ViewSlot {
  card: Card | null;
  known: boolean;
}

export interface ViewPlayer {
  id: number;
  name: string;
  isBot: boolean;
  avatar?: string;
  slots: ViewSlot[];
}

export interface PlayerView {
  viewerId: number;
  players: ViewPlayer[];
}

export function buildView(state: GameState, viewerId: number): PlayerView {
  const viewer = state.players[viewerId];
  return {
    viewerId,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      avatar: p.avatar,
      slots: p.handSlots.map((c) =>
        c ? { card: c, known: c.id in viewer.knowledge } : { card: null, known: true },
      ),
    })),
  };
}
