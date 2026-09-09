import '@testing-library/jest-dom';

// jsdom 不支持 scrollTo(options)，补一个空实现供 LogPanel 自动滚动使用
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = (() => {}) as typeof Element.prototype.scrollTo;
}
