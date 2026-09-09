// WebSocket 客户端封装：连接、发送、消息分发
import type { ClientMessage, ServerMessage } from '../../server/protocol';

export type NetHandler = (msg: ServerMessage) => void;

export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Set<NetHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** 断线后自动重连（携带房间信息） */
  private resume: (() => ClientMessage) | null = null;

  /** 建立连接（同源 /ws，开发模式经 Vite 代理到 3001） */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('无法连接联机服务器'));
      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        for (const h of this.handlers) h(msg);
      };
      ws.onclose = () => {
        this.ws = null;
        if (this.resume) this.scheduleReconnect();
      };
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.resume) return;
      this.connect()
        .then(() => {
          if (this.resume) this.send(this.resume());
        })
        .catch(() => this.scheduleReconnect());
    }, 1500);
  }

  /** 设置断线重连恢复动作（返回需要补发的消息） */
  setResume(fn: (() => ClientMessage) | null): void {
    this.resume = fn;
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(h: NetHandler): () => void {
    this.handlers.add(h);
    return () => {
      this.handlers.delete(h);
    };
  }

  close(): void {
    this.resume = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
  }
}
