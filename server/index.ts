// 换牌王联机服务器：HTTP(静态资源) + WebSocket
// 运行：npm run server（默认 3001 端口）
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { extname, join, normalize, sep } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage } from './protocol';
import {
  broadcastRoom,
  broadcastView,
  canStart,
  clearTimers,
  createRoom,
  genCode,
  handleAction,
  joinRoom,
  restartGame,
  Room,
  roomLiteInfo,
  seatInfo,
  startGame,
} from './rooms';

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

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function onDisconnect(ws: WebSocket): void {
  const meta = connMeta.get(ws);
  if (!meta) return;
  const room = rooms.get(meta.code);
  if (!room) return;
  const seat = room.seats[meta.seatId];
  // 只清掉仍属于自己的连接（同座位重连后，旧连接断开不影响新连接）
  if (seat && seat.ws === ws) seat.ws = null;
  // 对局中掉线：座位保留等待重连，挂起的真人决策由超时自动推进
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
      const total = Math.min(4, Math.max(2, msg.totalPlayers));
      const bots = Math.min(total - 1, Math.max(0, msg.botCount));
      const room = createRoom(code, msg.name.trim() || `玩家${1}`, total, bots, msg.avatar);
      rooms.set(code, room);
      room.seats[0].ws = ws;
      connMeta.set(ws, { code, seatId: 0 });
      send(ws, {
        type: 'joined',
        code,
        playerId: 0,
        hostId: room.hostId,
        seats: seatInfo(room),
        totalPlayers: total,
        botCount: bots,
        canStart: canStart(room),
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
      const seatId = joinRoom(room, msg.name.trim() || `玩家${room.totalPlayers - room.botCount}`, msg.avatar);
      if (seatId === null) {
        send(ws, { type: 'error', message: '房间已满' });
        return;
      }
      room.seats[seatId].ws = ws;
      connMeta.set(ws, { code, seatId });
      send(ws, {
        type: 'joined',
        code,
        playerId: seatId,
        hostId: room.hostId,
        seats: seatInfo(room),
        totalPlayers: room.totalPlayers,
        botCount: room.botCount,
        canStart: canStart(room),
      });
      broadcastRoom(room);
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
        // 该座位已有活跃连接（如同浏览器双开）：拒绝，避免顶掉正在玩的对局
        if (seat.ws && seat.ws.readyState === WebSocket.OPEN && seat.ws !== ws) {
          send(ws, { type: 'error', message: '该座位已有活跃连接，请勿重复打开' });
          return;
        }
        seat.name = msg.name.trim() || seat.name;
        seat.avatar = msg.avatar;
        seat.ws = ws;
        connMeta.set(ws, { code, seatId: msg.playerId });
        if (!room.state) {
          send(ws, {
            type: 'joined',
            code,
            playerId: msg.playerId,
            hostId: room.hostId,
            seats: seatInfo(room),
            totalPlayers: room.totalPlayers,
            botCount: room.botCount,
            canStart: canStart(room),
          });
          broadcastRoom(room);
        } else {
          send(ws, { type: 'gameStart', myId: msg.playerId });
          // 对局中重连：补发房间信息，保证 hostId/canStart 可用
          send(ws, {
            type: 'roomUpdate',
            code,
            hostId: room.hostId,
            seats: seatInfo(room),
            canStart: canStart(room),
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
        if (!seat.isBot && seat.ws) send(seat.ws, { type: 'gameStart', myId: seat.id });
      }
      return;
    }
    case 'action': {
      const meta = connMeta.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.code);
      if (!room || !room.state) return;
      handleAction(room, meta.seatId, msg.action);
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
