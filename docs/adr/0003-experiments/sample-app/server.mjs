// Static SPA + same-origin proxy to HotROD + a CORS echo endpoint, on one port.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 3350);
const HOTROD = process.env.HOTROD ?? 'http://127.0.0.1:18083';
const APP_ORIGIN = `http://localhost:${PORT}`;
const here = fileURLToPath(new URL('.', import.meta.url));
const dist = join(here, '../browser/dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

function serveFile(res, root, rel) {
  const file = normalize(join(root, rel));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url, APP_ORIGIN);
  if (url.pathname.startsWith('/api/')) {
    const target = new URL(url.pathname.slice(4) + url.search, HOTROD);
    const headers = { ...req.headers, host: target.host };
    const up = request(target, { method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on('error', () => res.writeHead(502).end());
    req.pipe(up);
    return;
  }
  if (url.pathname === '/echo' || url.pathname === '/deny') {
    const cors = {
      'access-control-allow-origin': APP_ORIGIN,
      'access-control-allow-headers': 'traceparent, tracestate, content-type',
      'access-control-allow-methods': 'GET, POST',
    };
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ path: url.pathname, traceparent: req.headers.traceparent ?? null }));
    return;
  }
  if (url.pathname.startsWith('/rum/')) return serveFile(res, dist, url.pathname.slice(5));
  if (url.pathname === '/app.js') return serveFile(res, here, 'app.js');
  serveFile(res, here, 'index.html');
}).listen(PORT, '127.0.0.1', () => console.log(`sample app on ${APP_ORIGIN}`));
