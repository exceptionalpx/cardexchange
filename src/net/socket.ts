// WebSocket 客户端封装：连接、发送、消息分发
import type { ClientMessage, ServerMessage } from '../../server/protocol';

export type NetHandler = (msg: ServerMessage) => void;

export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Set<NetHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** 断线后自动重连（携带房间信息） */
  private resume: (() => ClientMessage) | null = null;
  /** 未连接期间的待发消息队列：连接恢复后按序补发（建房/加房等关键操作不静默丢失） */
  private pendingQueue: ClientMessage[] = [];
  /** 本次连接建立时是否补发了队列（有排队新操作 → 跳过 resume，避免两条都发） */
  private flushedQueued = false;
  private stateListeners = new Set<() => void>();

  /** 当前连接状态：'open' 已连接 / 'connecting' 连接中 / 'closed' 未连接 */
  get state(): 'open' | 'connecting' | 'closed' {
    if (!this.ws) return 'closed';
    if (this.ws.readyState === WebSocket.OPEN) return 'open';
    if (this.ws.readyState === WebSocket.CONNECTING) return 'connecting';
    return 'closed';
  }

  /** 订阅连接状态变化（连接/断开时回调，用于首页提示） */
  onStateChange(h: () => void): () => void {
    this.stateListeners.add(h);
    return () => {
      this.stateListeners.delete(h);
    };
  }

  private emitState(): void {
    for (const h of this.stateListeners) h();
  }

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
      ws.onopen = () => {
        this.emitState();
        this.flushedQueued = this.pendingQueue.length > 0;
        this.flushQueue();
        resolve();
      };
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
        this.emitState();
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
          // 有排队中的新操作（如刚点创建房间）→ 已补发玩家新意图，不再 resume 回旧房间
          const skipResume = this.flushedQueued;
          this.flushedQueued = false;
          if (!skipResume && this.pendingQueue.length === 0 && this.resume) {
            this.send(this.resume());
          }
        })
        .catch(() => this.scheduleReconnect());
    }, 1500);
  }

  /** 设置断线重连恢复动作（返回需要补发的消息） */
  setResume(fn: (() => ClientMessage) | null): void {
    this.resume = fn;
  }

  /** 发送消息；连接未就绪时入队等待（连接恢复自动补发），避免关键操作静默丢失 */
  send(msg: ClientMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    this.pendingQueue.push(msg);
    return false;
  }

  /** 连接恢复：按序补发断线期间的待发消息 */
  private flushQueue(): void {
    if (this.pendingQueue.length === 0 || !this.ws) return;
    const q = this.pendingQueue;
    this.pendingQueue = [];
    for (const m of q) {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
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
