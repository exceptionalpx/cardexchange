import '@testing-library/jest-dom';

// jsdom 不支持 scrollTo(options)，补一个空实现供 LogPanel 自动滚动使用
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = (() => {}) as typeof Element.prototype.scrollTo;
}

// jsdom 未实现 HTMLMediaElement.play/pause/volume，mock 掉避免音效模块在测试中打印噪音
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = (() => Promise.resolve()) as typeof HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.pause = (() => {}) as typeof HTMLMediaElement.prototype.pause;
}

// jsdom 未实现 Web Audio API：mock 最小 AudioContext 供 sfx.ts（新方案）使用
class MockAudioBufferSourceNode {
  buffer: unknown = null;
  connect() {}
  start() {}
}
class MockGainNode {
  gain = { value: 0.7 };
  connect() {}
}
class MockAudioContext {
  state = 'running';
  destination = {};
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  createGain() {
    return new MockGainNode();
  }
  createBufferSource() {
    return new MockAudioBufferSourceNode();
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 1 } as unknown as AudioBuffer);
  }
}
(globalThis as Record<string, unknown>).AudioContext = MockAudioContext;
(globalThis as Record<string, unknown>).webkitAudioContext = MockAudioContext;
