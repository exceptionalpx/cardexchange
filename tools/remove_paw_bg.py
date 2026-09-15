"""去背景脚本：把 AI 生成的爪型素材（纯色/近纯色背景）处理为透明底 PNG。
用法: python tools/remove_paw_bg.py <src> <dst> [tolerance]
实现: 从四边 flood-fill 背景色连通域置透明，边缘 1px 羽化，抑制白边。
"""
import sys
from collections import deque

from PIL import Image


def remove_bg(src: str, dst: str, tol: int = 55) -> None:
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    px = img.load()

    # 背景色取四角均值
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    def close(c: tuple) -> bool:
        return (
            abs(c[0] - bg[0]) <= tol
            and abs(c[1] - bg[1]) <= tol
            and abs(c[2] - bg[2]) <= tol
        )

    visited = [[False] * w for _ in range(h)]
    q: deque = deque()
    for x in range(w):
        for y in (0, h - 1):
            if close(px[x, y]):
                visited[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if close(px[x, y]) and not visited[y][x]:
                visited[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and close(px[nx, ny]):
                visited[ny][nx] = True
                q.append((nx, ny))

    # 主体像素集合（非背景）
    keep = [[not visited[y][x] for x in range(w)] for y in range(h)]

    for y in range(h):
        for x in range(w):
            if visited[y][x]:
                px[x, y] = (px[x, y][0], px[x, y][1], px[x, y][2], 0)

    # 边缘羽化：透明像素的 4 邻域中的主体像素，若颜色接近背景色则降 alpha（抑制白边）
    for y in range(h):
        for x in range(w):
            if not keep[y][x]:
                continue
            near_bg = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and not keep[ny][nx]:
                    near_bg = True
                    break
            if near_bg and close(px[x, y]):
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, max(a - 120, 0))

    img.save(dst, "PNG")


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    tol = int(sys.argv[3]) if len(sys.argv) > 3 else 55
    remove_bg(src, dst, tol)
    print(f"OK {src} -> {dst} (tol={tol})")
