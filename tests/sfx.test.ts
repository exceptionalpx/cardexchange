import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * sfx.ts（Web Audio 方案）单测：
 * - 解锁时创建 AudioContext 并预解码全部音效
 * - 同一音效 150ms 内去重（防止动画/事件重复触发连播）
 * - 音量滑条即时更新 GainNode
 * 每用例通过 vi.resetModules + 动态 import 获取全新模块实例，避免单例 ctx 跨用例污染。
 */

/** mock fetch：让预解码链路成功（setup.ts 的 MockAudioContext.decodeAudioData 返回 {duration:1}） */
function mockFetchOk() {
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

type SfxModule = typeof import('../src/core/sfx');

async function loadSfx(): Promise<SfxModule> {
  return await import('../src/core/sfx');
}

describe('sfx Web Audio', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('unlockAudio 创建上下文并预解码（fetch 全部音效 + BGM）', async () => {
    const fetchMock = mockFetchOk();
    const sfx = await loadSfx();
    sfx.unlockAudio();
    // 等待 fetch → arrayBuffer → decodeAudioData → buffers/bgm 完成
    await new Promise((r) => setTimeout(r, 30));
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    // 12 个音效 + BGM mp3（mock 成功时不回退 wav）
    expect(urls.length).toBeGreaterThanOrEqual(12);
    expect(urls).toContain('/sfx/card_draw.wav');
    expect(urls).toContain('/sfx/follow_fail.wav');
    expect(urls).toContain('/sfx/bgm.mp3');
  });

  it('同一音效 150ms 内去重，间隔后再次触发可播放', async () => {
    mockFetchOk();
    const sfx = await loadSfx();

    const proto = (globalThis as Record<string, unknown>).AudioContext as unknown as {
      prototype: { createBufferSource: () => { start(): void } };
    };
    const spy = vi.spyOn(proto.prototype, 'createBufferSource');

    sfx.unlockAudio();
    await new Promise((r) => setTimeout(r, 30));
    const baseline = spy.mock.calls.length; // 含 BGM 的一次 source 创建

    // 连续两次立即调用：第二次被 150ms 去重吞掉 → 只播一次
    sfx.playSfx('card_draw');
    sfx.playSfx('card_draw');
    expect(spy.mock.calls.length - baseline).toBe(1);

    // 间隔 160ms 后再触发 → 正常播放
    await new Promise((r) => setTimeout(r, 160));
    sfx.playSfx('card_draw');
    expect(spy.mock.calls.length - baseline).toBe(2);
  });

  it('setBgmVolume / setSfxVolume 更新各自 GainNode（unlock 时各创建一次）', async () => {
    mockFetchOk();
    const sfx = await loadSfx();

    const proto = (globalThis as Record<string, unknown>).AudioContext as unknown as {
      prototype: { createGain: () => { gain: { value: number }; connect(): void } };
    };
    const gainSpy = vi.spyOn(proto.prototype, 'createGain');

    sfx.unlockAudio();
    sfx.unlockAudio(); // 幂等：ctx/gain 已存在时不重建
    // sfxGain + bgmGain 各一个
    expect(gainSpy).toHaveBeenCalledTimes(2);

    // 音量设置不抛错（内部 GainNode.gain.value 被写入）
    expect(() => sfx.setBgmVolume(0.3)).not.toThrow();
    expect(() => sfx.setSfxVolume(0.5)).not.toThrow();
  });
});
