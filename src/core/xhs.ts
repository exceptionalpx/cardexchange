/**
 * 小红书小工具容器桥（window.xhs.miniTool）。
 *
 * 容器自动注入 SDK，无需自行引入脚本；普通浏览器 / 开发环境 window.xhs 为 undefined。
 * 所有调用前必须判空，并为未注入环境准备降级路径（见 SKILL 文档 §3.1）。
 *
 * 能力（在线文档 §3.2，2026-10-13 版）：
 * - writeTempFile(base64) → 容器内临时 filePath（再传给 postNote / saveImageToPhotosAlbum）
 * - saveImageToPhotosAlbum({ filePath }) 保存图片到系统相册（替代被禁的 a[download]）
 * - postNote({ title, content, images? }) 唤起笔记发布页
 * - setStorage / getStorage / removeStorage 小工具本地缓存（比 localStorage 可靠）
 */

interface MiniTool {
  writeTempFile?: (
    opts: { base64: string; filePath?: string },
    cb?: { success?: (r: unknown) => void; fail?: (e: unknown) => void },
  ) => Promise<{ filePath: string }> | undefined;
  saveImageToPhotosAlbum?: (
    opts: { filePath: string },
  ) => Promise<unknown> | undefined;
  postNote?: (
    opts: { title?: string; content?: string; images?: string[] },
  ) => Promise<unknown> | undefined;
  setStorage?: (opts: { key: string; data: string }) => Promise<unknown> | undefined;
  getStorage?: (opts: { key: string }) => Promise<{ data: string }> | undefined;
  removeStorage?: (opts: { key: string }) => Promise<unknown> | undefined;
}

interface XhsSDK {
  miniTool?: MiniTool;
  AI?: unknown;
}

function sdk(): XhsSDK | null {
  const w = window as unknown as { xhs?: XhsSDK };
  return w.xhs ?? null;
}

/** 是否运行在小红书小工具容器内（未注入 SDK 时一律 false，包括普通浏览器） */
export function isXhsContainer(): boolean {
  return !!sdk()?.miniTool;
}

function miniTool(): MiniTool | null {
  return sdk()?.miniTool ?? null;
}

/** 把 base64（data: 头可带可不带）写成容器临时文件，返回 filePath；失败返回 null */
export async function writeTempFile(base64: string): Promise<string | null> {
  const mt = miniTool();
  if (!mt?.writeTempFile) return null;
  try {
    const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
    const res = await mt.writeTempFile({ base64: clean });
    // 回调形态时返回 undefined，结果走 success；Promise 形态返回 { filePath }
    if (res && typeof res === 'object' && 'filePath' in res) {
      return (res as { filePath: string }).filePath;
    }
    return null;
  } catch {
    return null;
  }
}

/** 保存图片到系统相册（filePath 由 writeTempFile 换来）；返回是否成功 */
export async function saveImageToAlbum(filePath: string): Promise<boolean> {
  const mt = miniTool();
  if (!mt?.saveImageToPhotosAlbum) return false;
  try {
    await mt.saveImageToPhotosAlbum({ filePath });
    return true;
  } catch {
    return false;
  }
}

/** 唤起发布笔记页（战绩分享）；images 为 writeTempFile 换来的 filePath 列表 */
export async function postNote(opts: { title?: string; content?: string; images?: string[] }): Promise<boolean> {
  const mt = miniTool();
  if (!mt?.postNote) return false;
  try {
    await mt.postNote(opts);
    return true;
  } catch {
    return false;
  }
}

/** xhs 本地缓存：异步写（失败静默——localStorage 已有同步副本，不阻塞游戏） */
export async function xhsSetStorage(key: string, value: string): Promise<void> {
  const mt = miniTool();
  if (!mt?.setStorage) return;
  try {
    await mt.setStorage({ key, data: value });
  } catch {
    /* 低版本 / 未注入：静默，localStorage 副本兜底 */
  }
}

/** xhs 本地缓存：异步读，失败返回 null（调用方用 localStorage 兜底） */
export async function xhsGetStorage(key: string): Promise<string | null> {
  const mt = miniTool();
  if (!mt?.getStorage) return null;
  try {
    const res = await mt.getStorage({ key });
    if (res && typeof res === 'object' && 'data' in res) {
      const d = (res as { data: unknown }).data;
      return typeof d === 'string' ? d : null;
    }
    return null;
  } catch {
    return null;
  }
}
