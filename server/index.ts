// 换牌王联机服务器：HTTP(静态资源) + WebSocket
// 运行：npm run server（默认 3001 端口）
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { extname, join, normalize, sep } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage } from './protocol';
import {
  addBot,
  broadcastEmoji,
  broadcastRoom,
  broadcastView,
  canStart,
  clearTimers,
  createRoom,
  exitGame,
  genCode,
  handleAction,
  joinRoom,
  leaveRoom,
  removeBot,
  restartGame,
  roomLiteInfo,
  seatInfo,
  setAutopilot,
  setReady,
  startGame,
  takeover,
  uncontrol,
  watchAllowed,
} from './rooms';
import type { Room } from './rooms';

const PORT = Number(process.env.PORT || 3001);
const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function serveStatic(req: import('http').IncomingMessage, res: import('http').ServerResponse): Promise<void> {
  try {
    await stat(DIST_DIR);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('联机服务器运行中（前端请使用 npm run dev 或先 npm run build）');
    return;
  }
  let pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (pathname === '/') pathname = '/index.html';
  const filePath = normalize(join(DIST_DIR, pathname));
  if (!filePath.startsWith(normalize(DIST_DIR) + sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // SPA 回退
    try {
      const body = await readFile(join(DIST_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  }
}

const httpServer = createServer((req, res) => {
  // 开放房间列表（大厅轮询，公开可加入信息，不含牌面/座位明细）
  if (req.url?.startsWith('/api/rooms')) {
    const list = Array.from(rooms.values()).map(roomLiteInfo);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ rooms: list }));
    return;
  }
  void serveStatic(req, res);
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// 房间表：code -> Room
const rooms = new Map<string, Room>();
// 连接 -> 所属 (roomCode, seatId)
const connMeta = new WeakMap<WebSocket, { code: string; seatId: number }>();
// 观战连接 -> 房间码 + 昵称（不占座位，只订阅全牌面对局广播）
const watchMeta = new WeakMap<WebSocket, { code: string; name?: string }>();

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

/** 无真人延时关房（方案B）：对局中真人全退/全掉线后保留 60 秒等待重连，超时自动关闭 */
function maybeCloseEmpty(room: Room): void {
  const humans = room.seats.filter((s) => !s.isBot);
  if (humans.some((s) => s.ws && s.ws.readyState === 1)) return;
  if (room.closeTimer) return;
  room.closeTimer = setTimeout(() => {
    room.closeTimer = undefined;
    // 期间可能有人重连/加入，再次确认
    const h = room.seats.filter((s) => !s.isBot);
    if (h.some((s) => s.ws && s.ws.readyState === 1)) return;
    for (const w of room.watchers) send(w, { type: 'watchClosed', message: '房间已关闭（无真人玩家）' });
    clearTimers(room);
    rooms.delete(room.code);
  }, 60000);
  room.timers.add(room.closeTimer);
}

/** 有人重连/加入：取消延时关房 */
function cancelClose(room: Room): void {
  if (room.closeTimer) {
    clearTimeout(room.closeTimer);
    room.timers.delete(room.closeTimer);
    room.closeTimer = undefined;
  }
}

function onDisconnect(ws: WebSocket): void {
  // 观战连接：直接清理订阅
  const wmeta = watchMeta.get(ws);
  if (wmeta) {
    const wroom = rooms.get(wmeta.code);
    wroom?.watchers.delete(ws);
    watchMeta.delete(ws);
  }
  const meta = connMeta.get(ws);
  if (!meta) return;
  const room = rooms.get(meta.code);
  if (!room) return;
  const seat = room.seats[meta.seatId];
  // 只清掉仍属于自己的连接（同座位重连后，旧连接断开不影响新连接）
  if (seat && seat.ws === ws) seat.ws = null;
  // 对局中掉线：座位保留等待重连，回合交给服务器托管（AI 代打，立即调度不卡局）
  if (room.state && seat) {
    const pid = room.pidBySeat?.[seat.id] ?? -1;
    if (pid >= 0 && !seat.isBot) {
      takeover(room, pid);
      // 对局中真人全掉线：延时关房（60 秒重连窗口）
      maybeCloseEmpty(room);
    }
  }
  if (!room.state) {
    broadcastRoom(room);
  }
  // 房间无人（所有真人离线）且大厅状态 → 清理
  const humans = room.seats.filter((s) => !s.isBot);
  if (!room.state && humans.every((s) => !s.ws)) {
    clearTimers(room);
    rooms.delete(room.code);
  }
}

function dispatch(ws: WebSocket, msg: ClientMessage): void {
  switch (msg.type) {
    case 'createRoom': {
      const code = genCode((c) => rooms.has(c));
      const room = createRoom(code, msg.name.trim() || '玩家1', msg.avatar, msg.config);
      rooms.set(code, room);
      room.seats[0].ws = ws;
      connMeta.set(ws, { code, seatId: 0 });
      send(ws, {
        type: 'joined',
        code,
        playerId: 0,
        hostId: room.hostId,
        seats: seatInfo(room),
        canStart: canStart(room),
        totalScores: room.totalScores,
        gamesPlayed: room.gamesPlayed,
        inGame: false,
      });
      return;
    }
    case 'joinRoom': {
      const code = msg.code.trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: 'error', message: `房间 ${code} 不存在` });
        return;
      }
      if (room.state) {
        send(ws, { type: 'error', message: '该房间对局已开始，无法加入' });
        return;
      }
      const seatId = joinRoom(room, msg.name.trim() || `玩家${room.seats.length}`, msg.avatar);
      if (msg.config) room.config = { ...room.config, ...msg.config }; // 加入者携带的设置并入房间
      if (seatId === null) {
        send(ws, { type: 'error', message: '房间已满' });
        return;
      }
      room.seats[seatId].ws = ws;
      connMeta.set(ws, { code, seatId });
      cancelClose(room);
      send(ws, {
        type: 'joined',
        code,
        playerId: seatId,
        hostId: room.hostId,
        seats: seatInfo(room),
        canStart: canStart(room),
        totalScores: room.totalScores,
        gamesPlayed: room.gamesPlayed,
        inGame: false,
      });
      broadcastRoom(room);
      return;
    }
    case 'addBot': {
      const meta = connMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.code);
      if (!room || room.hostId !== meta.seatId) return;
      addBot(room);
      broadcastRoom(room);
      return;
    }
    case 'removeBot': {
      const meta = connMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.code);
      if (!room || room.hostId !== meta.seatId) return;
      removeBot(room);
      broadcastRoom(room);
      return;
    }
    case 'ready': {
      const meta = connMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.code);
      if (!room) return;
      if (setReady(room, meta.seatId, msg.ready)) broadcastRoom(room);
      return;
    }
    case 'rejoin': {
      const code = msg.code.trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.seats[msg.playerId] === undefined) {
        send(ws, { type: 'error', message: '房间不存在或座位无效' });
        return;
      }
      const seat = room.seats[msg.playerId];
      if (!seat.isBot) {
        // 主动退出对局（quit）：本局不可重进，防止"退出→观战看到牌→回来继续玩"作弊
        if (seat.quit) {
          send(ws, { type: 'error', message: '你已主动退出本局，不能返回（本局结束后可重新加入）' });
          return;
        }
        // 该座位已有活跃连接（如同浏览器双开）：拒绝，避免顶掉正在玩的对局
        if (seat.ws && seat.ws.readyState === WebSocket.OPEN && seat.ws !== ws) {
          send(ws, { type: 'error', message: '该座位已有活跃连接，请勿重复打开' });
          return;
        }
        seat.name = msg.name.trim() || seat.name;
        seat.avatar = msg.avatar;
        seat.ws = ws;
        seat.left = false;
        connMeta.set(ws, { code, seatId: msg.playerId });
        cancelClose(room);
        if (!room.state) {
          send(ws, {
            type: 'joined',
            code,
            playerId: msg.playerId,
            hostId: room.hostId,
            seats: seatInfo(room),
            canStart: canStart(room),
            totalScores: room.totalScores,
            gamesPlayed: room.gamesPlayed,
            inGame: false,
          });
          broadcastRoom(room);
        } else {
          // 对局中重连：myId 用对局内玩家 id（view.viewerId 口径一致）
          const pid = room.pidBySeat?.[msg.playerId] ?? -1;
          if (pid >= 0) uncontrol(room, pid); // 真人重进，解除托管
          send(ws, { type: 'gameStart', myId: pid });
          send(ws, {
            type: 'roomUpdate',
            code,
            hostId: room.hostId,
            seats: seatInfo(room),
            canStart: canStart(room),
            totalScores: room.totalScores,
            gamesPlayed: room.gamesPlayed,
            inGame: true,
          });
          broadcastView(room);
        }
      }
      return;
    }
    case 'startGame': {
      const meta = connMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.code);
      if (!room) return;
      if (room.hostId !== meta.seatId) return;
      startGame(room);
      for (const seat of room.seats) {
        if (seat.isBot || !seat.ws) continue;
        const pid = room.pidBySeat?.[seat.id] ?? -1;
        if (pid >= 0) send(seat.ws, { type: 'gameStart', myId: pid });
      }
      return;
    }
    case 'action': {
      const meta = connMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.code);
      if (!room || !room.state) return;
      // 玩家操作统一按对局内玩家 id（座位压缩后连续编号）
      const pid = room.pidBySeat?.[meta.seatId] ?? -1;
      if (pid < 0) return;
      handleAction(room, pid, msg.action);
      return;
    }
    case 'leave': {
      const meta = connMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.code);
      if (!room) return;
      leaveRoom(room, meta.seatId);
      broadcastRoom(room);
      const humans = room.seats.filter((s) => !s.isBot);
      if (!room.state && humans.every((s) => !s.ws)) {
        // 通知观战者房间关闭
        for (const w of room.watchers) send(w, { type: 'watchClosed', message: '房间已关闭' });
        clearTimers(room);
        rooms.delete(room.code);
      }
      return;
    }
    case 'exitGame': {
      const meta = connMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.code);
      if (!room) return;
      if (!room.state) return; // 仅对局中可退出对局
      if (!exitGame(room, meta.seatId)) return;
      // 托管接管：发牌阶段自动盖牌；普通阶段若正轮到该玩家立即让 AI 出招（不卡局）
      const epid = room.pidBySeat?.[meta.seatId] ?? -1;
      if (epid >= 0) takeover(room, epid);
      // 退出者：回房间等待页（含房间数据，房间页显示"对局进行中"+回到对局入口）
      send(ws, {
        type: 'exitGame',
        code: room.code,
        playerId: meta.seatId,
        hostId: room.hostId,
        seats: seatInfo(room),
        canStart: canStart(room),
        totalScores: room.totalScores,
        gamesPlayed: room.gamesPlayed,
        inGame: true,
      });
      // 对局中真人全退出：延时关房（60 秒重连窗口）
      maybeCloseEmpty(room);
      return;
    }
    case 'setAutopilot': {
      const meta = connMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.code);
      if (!room || !room.state) return;
      const pid = room.pidBySeat?.[meta.seatId] ?? -1;
      if (pid < 0) return;
      // 主动托管：开启后由服务器 AI 代打，可随时关闭（开启时若正轮到该玩家立即自动推进）
      setAutopilot(room, pid, msg.on);
      return;
    }
    case 'emoji': {
      const meta = connMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.code);
      if (!room) return;
      broadcastEmoji(room, meta.seatId, msg.emoji);
      return;
    }
    case 'watchRoom': {
      const code = msg.code.trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: 'error', message: `房间 ${code} 不存在` });
        return;
      }
      if (!room.state) {
        send(ws, { type: 'error', message: '该房间还没有开始对局，暂时无法观战' });
        return;
      }
      // 对局参与者（含已退出/掉线）禁止观战本房间：防止"观战看牌后回到对局"作弊
      const watchBlock = watchAllowed(room, msg.playerId);
      if (watchBlock) {
        send(ws, { type: 'error', message: watchBlock });
        return;
      }
      // 观战：不占座位，订阅房间全牌面对局广播
      watchMeta.set(ws, { code, name: msg.name });
      room.watchers.add(ws);
      const hostSeat = room.seats[room.hostId];
      send(ws, { type: 'watchStart', code, hostName: hostSeat?.name ?? '' });
      // 立即下发当前对局快照
      if (room.state) {
        broadcastView(room); // broadcastView 内部会给 room.watchers 发 watchView
      }
      return;
    }
    case 'watchLeave': {
      const wmeta = watchMeta.get(ws);
      if (wmeta) {
        rooms.get(wmeta.code)?.watchers.delete(ws);
        watchMeta.delete(ws);
      }
      return;
    }
    case 'watchEmoji': {
      const code = msg.code.trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || !room.watchers.has(ws)) return;
      const wm = watchMeta.get(ws);
      const watcherName = wm?.name?.trim() || '观战者';
      const chatMsg = { type: 'chat', name: watcherName, text: msg.text };
      // 广播给房间内真人
      for (const seat of room.seats) {
        if (seat.isBot || !seat.ws || seat.ws.readyState !== 1) continue;
        send(seat.ws, chatMsg);
      }
      // 广播给其他观战者（发送者本地自行显示）
      for (const w of room.watchers) {
        if (w !== ws) send(w, chatMsg);
      }
      return;
    }
    case 'checkSession': {
      const code = msg.code.trim().toUpperCase();
      const room = rooms.get(code);
      const valid =
        !!room && room.seats[msg.playerId] !== undefined && !room.seats[msg.playerId].isBot;
      send(ws, {
        type: 'sessionCheck',
        valid,
        message: valid ? undefined : '之前的对局已结束（服务器重启后房间会清空）',
      });
      return;
    }
    case 'restart': {
      const meta = connMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.code);
      if (!room || room.hostId !== meta.seatId || !room.state) return;
      restartGame(room);
      return;
    }
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      return;
    }
    dispatch(ws, msg);
  });
  ws.on('close', () => onDisconnect(ws));
});

httpServer.listen(PORT, () => {
  console.log(`换牌王联机服务器已启动: http://localhost:${PORT}`);
  console.log(`WebSocket 路径: ws://localhost:${PORT}/ws`);
});
