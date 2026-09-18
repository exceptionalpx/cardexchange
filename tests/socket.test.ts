import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Net } from '../src/net/socket';

/**
 * Net 待发队列：断线/未连接期间 send 入队，连接恢复自动补发；
 * 重连后若队列有玩家新操作，优先补发队列而不是 resume 回旧房间。
 * WebSocket 用最小 mock 模拟 OPEN/CONNECTING/CLOSED。
 */
class FakeWS {
  static instances: FakeWS[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  readyState = FakeWS.CONNECTING;
  sent: string[] = [];
  private onopenCb: (() => void) | null = null;
  private oncloseCb: (() => void) | null = null;
  constructor() {
    FakeWS.instances.push(this);
  }
  set onopen(cb: () => void) {
    this.onopenCb = cb;
  }
  get onopen(): (() => void) | null {
    return this.onopenCb;
  }
  set onclose(cb: () => void) {
    this.oncloseCb = cb;
  }
  get onclose(): (() => void) | null {
    return this.oncloseCb;
  }
  set onerror(_cb: () => void) {}
  get onerror(): (() => void) | null {
    return null;
  }
  set onmessage(_cb: () => void) {}
  get onmessage(): (() => void) | null {
    return null;
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {}
  fireOpen() {
    this.readyState = FakeWS.OPEN;
    this.onopenCb?.();
  }
  fireClose() {
    this.readyState = FakeWS.CLOSED;
    this.oncloseCb?.();
  }
}

function installFakeWS() {
  FakeWS.instances = [];
  vi.stubGlobal('WebSocket', FakeWS as unknown as typeof WebSocket);
  vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:3001' });
}

/** 等一个宏任务，让 Promise .then 回调执行完 */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.unstubAllGlobals();
  FakeWS.instances = [];
});

describe('Net 待发队列（建房/加房不静默丢失）', () => {
  it('未连接时 send 入队，连接恢复后自动补发', async () => {
    installFakeWS();
    const net = new Net();
    // 连接前先 send（入队）
    const ok1 = net.send({ type: 'createRoom', name: 'A', config: {} } as never);
    expect(ok1).toBe(false);
    expect(FakeWS.instances.length).toBe(0); // 尚未创建 ws

    const p = net.connect();
    expect(FakeWS.instances.length).toBe(1);
    // onopen 前再 send（仍入队：ws 处于 CONNECTING）
    const ok2 = net.send({ type: 'joinRoom', code: 'ABCD', name: 'A' } as never);
    expect(ok2).toBe(false);
    FakeWS.instances[0].fireOpen();
    await p;
    await tick();
    // 队列按序补发
    const sent = FakeWS.instances[0].sent;
    expect(sent.length).toBe(2);
    expect(JSON.parse(sent[0]).type).toBe('createRoom');
    expect(JSON.parse(sent[1]).type).toBe('joinRoom');
  });

  it('连接中（CONNECTING）send 也入队不丢', async () => {
    installFakeWS();
    const net = new Net();
    const p = net.connect();
    expect(FakeWS.instances[0].readyState).toBe(FakeWS.CONNECTING);
    const ok = net.send({ type: 'joinRoom', code: 'XYZW', name: 'B' } as never);
    expect(ok).toBe(false);
    FakeWS.instances[0].fireOpen();
    await p;
    await tick();
    const sent = FakeWS.instances[0].sent;
    expect(sent.length).toBe(1);
    expect(JSON.parse(sent[0]).type).toBe('joinRoom');
  });

  it('断线重连（无新操作）→ 自动补发 resume 回原房间', async () => {
    installFakeWS();
    const net = new Net();
    net.setResume(() => ({ type: 'rejoin', code: 'OLD', playerId: 1, name: 'A' }));
    const p = net.connect();
    FakeWS.instances[0].fireOpen();
    await p;
    await tick();
    // 首连不自动发 resume（由 OnlineFlow 手动处理）
    expect(FakeWS.instances[0].sent.length).toBe(0);

    // 模拟断线（onclose 回调触发重连调度）
    const first = FakeWS.instances[0];
    first.fireClose();
    await new Promise((r) => setTimeout(r, 1700)); // 等待 1.5s 自动重连
    await tick();
    expect(FakeWS.instances.length).toBe(2); // 已重连
    const second = FakeWS.instances[1];
    second.fireOpen(); // 模拟浏览器建立连接
    await tick();
    // 无队列 → 补发 resume 回原房间
    expect(second.sent.length).toBe(1);
    expect(JSON.parse(second.sent[0]).type).toBe('rejoin');
  });

  it('断线重连（队列有玩家新操作）→ 优先补发队列，不再 resume 回旧房间', async () => {
    installFakeWS();
    const net = new Net();
    net.setResume(() => ({ type: 'rejoin', code: 'OLD', playerId: 1, name: 'A' }));
    const p = net.connect();
    FakeWS.instances[0].fireOpen();
    await p;
    await tick();

    // 模拟断线
    const first = FakeWS.instances[0];
    first.fireClose();
    // 断线期间入队（玩家新操作：创建房间）
    net.send({ type: 'createRoom', name: 'C', config: {} } as never);
    await new Promise((r) => setTimeout(r, 1700)); // 等待 1.5s 自动重连
    await tick();
    expect(FakeWS.instances.length).toBe(2); // 已重连
    const second = FakeWS.instances[1];
    second.fireOpen(); // 模拟浏览器建立连接
    await tick();
    // 队列优先：补发 createRoom，不发 rejoin
    expect(second.sent.length).toBe(1);
    expect(JSON.parse(second.sent[0]).type).toBe('createRoom');
  });

  it('OPEN 状态 send 直接发送并返回 true', async () => {
    installFakeWS();
    const net = new Net();
    const p = net.connect();
    FakeWS.instances[0].fireOpen();
    await p;
    const ok = net.send({ type: 'joinRoom', code: 'ABCD', name: 'D' } as never);
    expect(ok).toBe(true);
    expect(FakeWS.instances[0].sent.length).toBe(1);
  });
});
