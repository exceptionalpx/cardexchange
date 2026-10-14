// 临时本地静态服务器：直接把 dist（xhs 离线包）挂在 http://localhost:3002 试玩
// 原因：Chrome 禁止 file:// 加载 ES module，本地验证必须走 http。
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = join(import.meta.dirname, '..', 'dist');
const port = 3002;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(root, p);
    const s = await stat(file);
    if (s.isDirectory()) throw new Error('dir');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
}).listen(port, () => {
  console.log(`xhs 离线包试玩: http://localhost:${port}/  (Ctrl+C 退出)`);
});
