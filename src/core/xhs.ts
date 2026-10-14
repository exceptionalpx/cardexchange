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
    cb?: { success?: (r: unknown) => void; fail?: (e: unknown) => void },
  ) => Promise<unknown> | undefined;
  postNote?: (
    opts: { title?: string; content?: string; images?: string[] },
    cb?: { success?: (r: unknown) => void; fail?: (e: unknown) => void },
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

/**
 * 统一调用器：同时兼容 Promise 形态与 success/fail 回调形态。
 * 容器 JSSDK 不统一——有的 API 返回 Promise，有的只走回调（await 拿到 undefined）。
 * 两种形态都接：若调用返回 thenable 就用它，否则靠传入的 success/fail 回调收结果。
 */
function call<T>(
  fn: ((opts: unknown, cb: { success: (r: unknown) => void; fail: (e: unknown) => void }) => unknown) | undefined,
  opts: unknown,
  extract: (r: unknown) => T | null,
): Promise<T | null> {
  return new Promise((resolve) => {
    if (!fn) return resolve(null);
    let settled = false;
    const finish = (v: T | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    try {
      const ret = fn(opts, {
        success: (r: unknown) => finish(extract(r)),
        fail: () => finish(null),
      });
      // Promise 形态：thenable 优先
      if (ret && typeof (ret as Promise<unknown>).then === 'function') {
        (ret as Promise<unknown>)
          .then((r) => finish(extract(r)))
          .catch(() => finish(null));
      }
      // 回调形态：success/fail 会在上面 finish（settled 兜底防双触发）
    } catch {
      finish(null);
    }
  });
}

/** 把 base64（data: 头可带可不带）写成容器临时文件，返回 filePath；失败返回 null */
export async function writeTempFile(base64: string): Promise<string | null> {
  const mt = miniTool();
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  return call<string>(
    mt?.writeTempFile as never,
    { base64: clean },
    (r) => {
      if (r && typeof r === 'object' && 'filePath' in r) {
        const fp = (r as { filePath: unknown }).filePath;
        return typeof fp === 'string' ? fp : null;
      }
      return null;
    },
  );
}

/** 保存图片到系统相册（filePath 由 writeTempFile 换来）；返回是否成功 */
export async function saveImageToAlbum(filePath: string): Promise<boolean> {
  const mt = miniTool();
  const r = await call<unknown>(mt?.saveImageToPhotosAlbum as never, { filePath }, () => true);
  return r !== null;
}

/** 唤起发布笔记页（战绩分享）；images 为 writeTempFile 换来的 filePath 列表 */
export async function postNote(opts: { title?: string; content?: string; images?: string[] }): Promise<boolean> {
  const mt = miniTool();
  const r = await call<unknown>(mt?.postNote as never, opts, () => true);
  return r !== null;
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
