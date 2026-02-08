import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { cwd } from 'node:process';

const ROOT_DIR = cwd();
const PORT = 4173;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

function safePathFromUrl(url) {
  const pathname = new URL(url, 'http://localhost').pathname;
  const requested = pathname === '/' ? '/index.html' : pathname;
  const normalized = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  return join(ROOT_DIR, normalized);
}

const server = createServer(async (req, res) => {
  try {
    const filePath = safePathFromUrl(req.url ?? '/');
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const body = await readFile(filePath);
    const contentType = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
    res.end(body);
  } catch (err) {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`Static test server running at http://127.0.0.1:${PORT}\n`);
});
