import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../src/components/ErrorBoundary';

/** 渲染时必然抛错的组件（模拟对局中未知渲染异常） */
function Boom(): never {
  throw new Error('测试渲染异常');
}

describe('ErrorBoundary', () => {
  it('渲染异常时显示可恢复错误界面而非白屏', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/页面出了点小问题/)).toBeInTheDocument();
    expect(screen.getByText(/测试渲染异常/)).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('无异常时正常渲染子组件', () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('正常内容')).toBeInTheDocument();
  });
});
