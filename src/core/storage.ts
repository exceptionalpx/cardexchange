/**
 * 统一存储层（同步 API，业务代码不感知容器）。
 *
 * 小红书容器明确警告：localStorage / IndexedDB 不保证持久（可能被清理）。
 * 策略：
 * - 同步读写仍走 localStorage（游戏逻辑需要同步读取，且 localStorage 是降级兜底）；
 * - xhs 容器内写时额外异步镜像到 xhs.miniTool.setStorage（持久副本）；
 * - 启动时把已知 key 从 xhs.getStorage 异步灌回 localStorage，
 *   保证升级 / 清理后玩家昵称、头像、设置能恢复。
 * - 所有读写 try-catch，容忍存储完全不可用（返回默认值，不阻塞游戏）。
 */
import { isXhsContainer, xhsGetStorage, xhsSetStorage } from './xhs';

/** 需要在 xhs 容器启动时回读的 key 白名单（用户偏好类） */
const SYNC_KEYS = [
  'cardexchange-name',
  'cardexchange-name-auto',
  'cardexchange-avatar',
  'cardexchange-theme',
  'cardexchange-bgm-volume',
  'cardexchange-sfx-volume',
  'cardexchange-total-scores',
];

export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* 存储不可用：静默 */
    }
    // xhs 容器：异步镜像持久副本（不 await，不阻塞）
    if (isXhsContainer()) {
      void xhsSetStorage(key, value);
    }
  },

  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/** 启动时调用：xhs 容器内把持久副本灌回 localStorage（异步，完成前游戏用本地值） */
export function hydrateFromXhs(): void {
  if (!isXhsContainer()) return;
  for (const key of SYNC_KEYS) {
    void xhsGetStorage(key).then((v) => {
      if (v !== null) {
        try {
          window.localStorage.setItem(key, v);
        } catch {
          /* ignore */
        }
      }
    });
  }
}
