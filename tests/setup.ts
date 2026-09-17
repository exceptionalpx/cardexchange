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
