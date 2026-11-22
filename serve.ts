// serve.ts — a tiny static server for local play-testing.
// Serves only the game/ folder, on http://localhost:8080, with the
// MIME types a browser needs for ES modules and the vendored engine.
// Not part of the hand-in; the game also runs from any static host.
//
// Responses carry `cache-control: no-store` on purpose: a play-test
// server that lets the browser cache modules turns every edit into
// a "did my change even load?" guessing game. HEAD is answered
// from the file's size alone, for link checkers and smoke probes
// that should not have to download three.js to prove the page is up.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'game');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
};
const port = Number(process.env.PORT || 8080);

createServer(async (req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('bad url');
    return;
  }
  if (path === '/') path = '/index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) { res.writeHead(403).end('no'); return; }
  const type = TYPES[extname(file)] || 'application/octet-stream';
  try {
    if (req.method === 'HEAD') {
      const info = await stat(file);
      res.writeHead(200, { 'content-type': type, 'content-length': info.size, 'cache-control': 'no-store' });
      res.end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`solmar-heat neon-run at http://localhost:${port}`));
