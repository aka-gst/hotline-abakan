/*
 * Местный сервер для проверок.
 *
 * Зачем свой, а не `python3 -m http.server`: тот отдаёт файлы с обычным
 * кэшированием, и браузер держит модули по старым адресам. Страница при
 * этом выглядит свежей — `index.html` перезапрашивается, `main.js` несёт
 * `?v=3`, — а всё, что он импортирует, приезжает из кэша.
 *
 * Это стоило трёх заходов вслепую: я правил повадки врагов, проверял в
 * браузере и видел старое поведение, потому что `ai.js` импортируется без
 * версии. Числа были твёрдые, повторяемые и описывали прошлую версию кода.
 *
 * Поэтому здесь `no-store` на всё. Живой сервер отдаёт `no-cache,
 * must-revalidate` сам, так что игроков это не касается.
 *
 *   node tools/serve.mjs [порт]
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.argv[2]) || 4193;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  /* Наружу из папки игры не выпускаем: normalize съедает «..». */
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, safe.endsWith('/') ? `${safe}index.html` : safe);

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      /* Ради этой строки сервер и написан. */
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('нет такого файла');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`игра на http://localhost:${PORT}/ — без кэша`);
});
