/**
 * 战绩分享图生成（Canvas → dataURL）。
 * 用于小红书小工具的"分享战绩到笔记"与"保存到相册"：
 * dataURL 经 writeTempFile 换 filePath，再交给 postNote / saveImageToPhotosAlbum。
 * 普通浏览器环境不使用（按钮仅在 xhs 容器内渲染）。
 */
import type { GameState } from './types';

/** 把结算结果画成竖版战绩图，返回 PNG dataURL；失败返回 null */
export function drawResultImage(state: GameState): string | null {
  try {
    const W = 750;
    const H = 1000;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext('2d');
    if (!c) return null;

    // 背景（奶油绿桌布风）
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#d9e8c8');
    bg.addColorStop(1, '#b8d4a0');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    c.textAlign = 'center';
    c.fillStyle = '#2d4a22';
    c.font = 'bold 56px sans-serif';
    const winners = state.winner ?? [];
    const winnerNames = winners.map((id) => state.players[id]?.name ?? '').join('、');
    c.fillText(`🏆 ${winnerNames || '平局'} 获胜`, W / 2, 130);

    c.font = '26px sans-serif';
    c.fillStyle = '#4a6b3a';
    c.fillText('手牌总分最小者获胜 · 换牌王', W / 2, 180);

    // 各玩家分数条
    const sorted = [...state.players].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
    let y = 280;
    const rowH = 110;
    for (const p of sorted) {
      const isWin = winners.includes(p.id);
      c.fillStyle = isWin ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)';
      roundRect(c, 60, y, W - 120, rowH - 20, 16);
      c.fill();

      c.textAlign = 'left';
      c.fillStyle = '#2d4a22';
      c.font = '34px sans-serif';
      c.fillText(`${p.avatar ?? ''} ${p.name}`, 95, y + 50);

      c.textAlign = 'right';
      c.font = 'bold 40px sans-serif';
      c.fillStyle = isWin ? '#c0392b' : '#2d4a22';
      let label = `${p.score} 分`;
      if (state.settleBonus > 0 && p.id === state.declaredPlayer) {
        label = `${p.score} 分（含定牌奖励 -${state.settleBonus}）`;
      }
      c.fillText(label, W - 95, y + 52);

      if (isWin) {
        c.textAlign = 'right';
        c.font = '22px sans-serif';
        c.fillStyle = '#c0392b';
        c.fillText('胜者', W - 95, y + 82);
      }
      y += rowH;
    }

    c.textAlign = 'center';
    c.font = '24px sans-serif';
    c.fillStyle = '#4a6b3a';
    c.fillText('来小红书，搜「换牌王」一起玩！', W / 2, H - 60);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
