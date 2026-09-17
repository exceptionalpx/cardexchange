import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 全局错误边界：任何渲染/副作用异常都不会让页面白屏，
 * 而是显示可恢复的错误界面（含错误信息便于定位）。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 保留错误现场便于排查（用户可复制给开发者）
    console.error('[换牌王] 页面渲染异常:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-screen">
          <div className="error-card">
            <h2>😿 页面出了点小问题</h2>
            <p className="hint">错误信息（可复制反馈给开发者）：</p>
            <pre className="error-detail">{String(this.state.error.message || this.state.error)}</pre>
            <div className="btn-row">
              <button
                className="btn btn-primary"
                onClick={() => this.setState({ error: null })}
              >
                重试
              </button>
              <button className="btn" onClick={() => window.location.reload()}>
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
