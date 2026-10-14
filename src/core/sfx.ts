/**
 * 音效与背景音乐管理（Web Audio 方案）。
 * - 背景音乐（bgm）用 AudioBufferSourceNode + loop 循环播放，与音效共用同一个
 *   已在用户手势内解锁的 AudioContext：安卓/iOS 行为一致，不再依赖
 *   HTMLAudioElement 的自动播放策略（安卓切后台再回前台时 play() 不在手势内
 *   会被拒，导致 BGM 静默——旧版根因）。
 * - 游戏音效（sfx）预解码为 AudioBuffer，播放时 AudioBufferSourceNode.start()
 *   即时发声（延迟 <10ms）。
 * - iOS Safari 自动播放限制：首次用户交互（pointerdown）内创建并 resume
 *   AudioContext，同时预解码全部音效并启动 BGM，之后任意时机播放均合法。
 * - 同一音效 150ms 内去重，避免动画/事件重复触发导致的连播堆积。
 * - 页面隐藏时 suspend 整个上下文并静音 BGM；回到页面自动恢复。
 * - 音量独立持久化 localStorage：bgm 0.4、sfx 0.7，滑条实时生效。
 */

import { storage } from './storage';
import { AUDIO_BASE64 } from './audio-data';

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
  | 'follow_fail' // 跟弃失败罚牌（对所有人广播，作为公共提示）
  | 'lose'; // 结算落败

const BGM_KEY = 'cardexchange-bgm-volume';
const SFX_KEY = 'cardexchange-sfx-volume';
const BGM_DEFAULT = 0.4;
const SFX_DEFAULT = 0.7;
/** 同一音效最短触发间隔（ms）：动画/事件重复触发时丢弃多余播放，避免堆积 */
const SFX_MIN_GAP = 150;

const SFX_NAMES: SfxName[] = [
  'card_draw',
  'card_cover',
  'peek',
  'swap_other',
  'swap_self',
  'discard',
  'follow_success',
  'countdown',
  'declare',
  'win',
  'follow_fail',
  'lose',
];

/** data:audio/mp3;base64,... → ArrayBuffer（音频全部内嵌在 js 里，不引用外部媒体文件） */
function base64ToArrayBuffer(dataUrl: string): ArrayBuffer {
  const csv = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
  const bin = atob(csv);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

let visibilityBound = false;
let preloaded = false;
let bgmVolume = loadVolume(BGM_KEY, BGM_DEFAULT);
let sfxVolume = loadVolume(SFX_KEY, SFX_DEFAULT);

/** Web Audio 上下文（懒创建；iOS 需在用户手势内 resume） */
let ctx: AudioContext | null = null;
/** 音效总音量节点（sfxVolume 即时生效） */
let sfxGain: GainNode | null = null;
/** 背景音乐音量节点（BGM 独立音量，页面隐藏时静音/恢复用） */
let bgmGain: GainNode | null = null;
/** 预解码好的音效缓冲 */
const buffers = new Map<SfxName, AudioBuffer>();
/** 各音效最近一次播放时间（去重用） */
const lastPlayedAt = new Map<SfxName, number>();

function loadVolume(key: string, def: number): number {
  const raw = storage.get(key);
  if (raw === null || raw === '') return def;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : def;
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxVolume;
    sfxGain.connect(ctx.destination);
  } catch {
    ctx = null;
    sfxGain = null;
  }
  return ctx;
}

/** 预解码全部音效（base64 内存解码，不发起任何网络请求；完成后任意时机播放均即时） */
function preloadSfx(c: AudioContext): void {
  if (preloaded) return;
  preloaded = true;
  for (const name of SFX_NAMES) {
    const dataUrl = AUDIO_BASE64[name];
    if (!dataUrl) continue;
    c.decodeAudioData(base64ToArrayBuffer(dataUrl))
      .then((ab) => {
        if (ab && ab.duration > 0) buffers.set(name, ab);
      })
      .catch(() => {
        /* 单个音效解码失败不影响其他 */
      });
  }
}

/** 背景音乐：base64 解码 mp3 → BufferSource + loop，挂独立 bgmGain。幂等。 */
async function startBgm(c: AudioContext): Promise<void> {
  if (bgmGain) return; // 已启动
  bgmGain = c.createGain();
  bgmGain.gain.value = bgmVolume;
  bgmGain.connect(c.destination);

  const dataUrl = AUDIO_BASE64['bgm'];
  if (!dataUrl) return;
  let buf: AudioBuffer | null = null;
  try {
    buf = await c.decodeAudioData(base64ToArrayBuffer(dataUrl));
  } catch {
    buf = null;
  }
  if (!buf || !bgmGain) return; // 失败：静默，不阻塞游戏

  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(bgmGain);
  src.start(0);
}

/** 首次用户交互后调用：创建并 resume AudioContext、预解码音效、启动背景音乐（只创建一次） */
export function unlockAudio(): void {
  try {
    const c = ensureCtx();
    if (c && c.state === 'suspended') {
      void c.resume().catch(() => {});
    }
    if (c) {
      preloadSfx(c);
      void startBgm(c);
    }

    if (!visibilityBound) {
      visibilityBound = true;
      // 页面隐藏（切走/关闭其他换牌王标签页）时整体静音并挂起上下文，回到页面自动恢复：
      // 避免多个标签页/后台播放串音；真正关闭整个标签页时音频随页面一并销毁
      document.addEventListener('visibilitychange', () => {
        const c2 = ctx;
        if (!c2) return;
        if (document.hidden) {
          if (bgmGain) bgmGain.gain.value = 0;
          if (c2.state !== 'suspended') void c2.suspend().catch(() => {});
        } else {
          if (bgmGain) bgmGain.gain.value = bgmVolume;
          if (c2.state === 'suspended') void c2.resume().catch(() => {});
        }
      });
    }
  } catch {
    /* 音频不可用时静默 */
  }
}

/** 播放一个游戏音效（Web Audio 即时发声；同一音效 150ms 内去重） */
export function playSfx(name: SfxName): void {
  try {
    const now = performance.now();
    const last = lastPlayedAt.get(name) ?? 0;
    if (now - last < SFX_MIN_GAP) return;
    lastPlayedAt.set(name, now);

    const c = ensureCtx();
    if (!c || !sfxGain) return;
    const buf = buffers.get(name);
    if (!buf) return; // 解码未完成：静默跳过
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(sfxGain);
    src.start(0);
  } catch {
    /* 音频不可用时静默 */
  }
}

export function setBgmVolume(v: number): void {
  bgmVolume = v;
  storage.set(BGM_KEY, String(v));
  // 页面隐藏时不打扰静音状态，仅记录新值；回到页面后按新值恢复
  if (bgmGain && !document.hidden) bgmGain.gain.value = v;
}

export function setSfxVolume(v: number): void {
  sfxVolume = v;
  storage.set(SFX_KEY, String(v));
  if (sfxGain) sfxGain.gain.value = v;
}

export function getBgmVolume(): number {
  return bgmVolume;
}

export function getSfxVolume(): number {
  return sfxVolume;
}
