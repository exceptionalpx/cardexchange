// 一次性脚本：把 public/sfx/*.mp3 转成 base64 内嵌 src/core/audio-data.ts
// 原因：小红书小工具仅允许 jpg/css/gif/svg/png/js/jpeg/json/html/woff2/webp/woff，
// mp3 不在允许类型内；base64 内嵌为 js 文本后由 Web Audio 在内存解码（不走 <audio> CSP 媒体源）。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sfxDir = join(root, 'public', 'sfx');

const files = readdirSync(sfxDir).filter((f) => f.endsWith('.mp3'));
const entries = [];
for (const f of files) {
  const name = f.replace('.mp3', '');
  const b64 = readFileSync(join(sfxDir, f)).toString('base64');
  entries.push([name, b64]);
}

const lines = [
  '// 自动生成（scripts/gen-audio-data.mjs）：mp3 → base64 内嵌，禁止手改。',
  '// 小红书小工具不允许 mp3 文件类型，全部音频在此由 Web Audio 内存解码。',
  '// key = 音效名（bgm 为背景音乐），value = data:audio/mp3;base64,...',
  'export const AUDIO_BASE64: Record<string, string> = {',
  ...entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(`data:audio/mp3;base64,${v}`)},`),
  '};',
  '',
];
writeFileSync(join(root, 'src', 'core', 'audio-data.ts'), lines.join('\n'), 'utf8');

const totalKB = entries.reduce((s, [, v]) => s + v.length, 0) / 1024;
console.log(`generated audio-data.ts: ${entries.length} files, base64 total ${Math.round(totalKB)}KB`);
