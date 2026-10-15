/* =====================================================================
   Локальный сервер для разработки БЕЗ КЭША.
   Нужен потому, что ES-модули браузер кэширует агрессивно: после правки
   src/*.js страница может остаться на старом коде.

   Запуск:  node tools/dev-server.mjs        (по умолчанию порт 8777)
            node tools/dev-server.mjs 8080
   ===================================================================== */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 8777);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // служебная ручка: какая сборка сейчас лежит на диске
  if (urlPath === '/__build'){
    let build = '?';
    try {
      const src = fs.readFileSync(path.join(root, 'src/minigames.js'), 'utf8')
        + fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
      build = (/BUILD = '([^']+)'/.exec(src) || [])[1] || '?';
    } catch (_){}
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(build);
    return;
  }

  const filePath = path.join(root, path.normalize(urlPath).replace(/^([/\\])+/, ''));

  if (!filePath.startsWith(root)){
    res.writeHead(403).end('403');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err){
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — нет файла ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Пятилитруха багбира → http://127.0.0.1:${port}/`);
  console.log('Кэш отключён (no-store): правки в src/*.js видны после обычного F5.');
});
