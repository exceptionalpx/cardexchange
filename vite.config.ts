/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 构建小红书小工具离线包（npm run build:xhs = vite build --mode xhs）：
// - base 相对路径（zip 以 file:// 加载，不能用绝对路径 /assets）
// - target 面向 Chrome 61 / ES2017（Android 8.1 出厂 WebView 基线）
// - define __XHS__ 让 UI 层砍掉联机入口（代码不删，master 构建时自动恢复）
export default defineConfig(({ mode }) => {
  const xhs = mode === 'xhs';
  return {
    plugins: [react()],
    base: xhs ? './' : '/',
    define: {
      __XHS__: JSON.stringify(xhs),
    },
    build: {
      target: xhs ? ['es2017', 'chrome61'] : 'modules',
    },
    server: {
      // 开发模式：WebSocket 代理到联机服务器（npm run server，3001）
      proxy: {
        '/ws': { target: 'http://localhost:3001', ws: true },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './tests/setup.ts',
    },
  };
});
