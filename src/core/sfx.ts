/**
 * 音效与背景音乐管理。
 * - 背景音乐（bgm）与游戏音效（sfx）音量独立调节，持久化 localStorage
 * - 默认开启：bgm 0.4（氛围低音量，与音效和谐）、sfx 0.7
 * - iOS Safari 自动播放限制：首次用户交互（pointerdown）后解锁并启动 BGM
 */

export type SfxName =
  | 'card_draw' // 摸牌
  | 'card_cover' // 盖牌
  | 'peek' // 看牌（7/8/9/10）
  | 'swap_other' // 与别人换牌（J/Q/K）
  | 'swap_self' // 替换自己手牌
  | 'discard' // 弃牌
  | 'follow_success' // 跟弃成功
  | 'countdown' // 倒计时滴答
  | 'declare' // 定牌
  | 'win' // 获胜
  | 'follow_fail' // 跟弃失败罚牌
  | 'lose'; // 结算落败

const BGM_KEY = 'cardexchange-bgm-volume';
const SFX_KEY = 'cardexchange-sfx-volume';
const BGM_DEFAULT = 0.4;
const SFX_DEFAULT = 0.7;

let bgm: HTMLAudioElement | null = null;
let bgmVolume = loadVolume(BGM_KEY, BGM_DEFAULT);
let sfxVolume = loadVolume(SFX_KEY, SFX_DEFAULT);
const sfxCache = new Map<SfxName, HTMLAudioElement>();

function loadVolume(key: string, def: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return def;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : def;
  } catch {
    return def;
  }
}

/** 首次用户交互后调用：解锁音频并启动背景音乐循环（只创建一次） */
export function unlockAudio(): void {
  try {
    if (bgm) {
      void bgm.play().catch(() => {});
      return;
    }
    bgm = new Audio('/sfx/bgm.mp3');
    bgm.loop = true;
    bgm.volume = bgmVolume;
    // mp3 加载失败（如 404）时自动回退 wav
    bgm.addEventListener(
      'error',
      () => {
        if (bgm && /bgm\.mp3$/.test(bgm.src)) {
          bgm.src = '/sfx/bgm.wav';
          bgm.volume = bgmVolume;
          void bgm.play().catch(() => {});
        }
      },
      { once: true },
    );
    void bgm.play().catch(() => {});
  } catch {
    /* 音频不可用时静默 */
  }
}

/** 播放一个游戏音效（每次从头播放） */
export function playSfx(name: SfxName): void {
  try {
    let a = sfxCache.get(name);
    if (!a) {
      a = new Audio(`/sfx/${name}.wav`);
      sfxCache.set(name, a);
    }
    a.volume = sfxVolume;
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {
    /* 音频不可用时静默 */
  }
}

export function setBgmVolume(v: number): void {
  bgmVolume = v;
  try {
    localStorage.setItem(BGM_KEY, String(v));
  } catch {
    /* ignore */
  }
  if (bgm) bgm.volume = v;
}

export function setSfxVolume(v: number): void {
  sfxVolume = v;
  try {
    localStorage.setItem(SFX_KEY, String(v));
  } catch {
    /* ignore */
  }
}

export function getBgmVolume(): number {
  return bgmVolume;
}

export function getSfxVolume(): number {
  return sfxVolume;
}
