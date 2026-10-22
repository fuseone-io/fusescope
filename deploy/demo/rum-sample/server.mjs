import { readFileSync } from 'node:fs';
import { createServer, request } from 'node:http';

const PORT = 3000;
const HOTROD = process.env.HOTROD ?? 'http://hotrod:8080';
const files = {
  '/app.js': ['text/javascript', readFileSync('app.js')],
  '/sdk/fusescope.min.js': ['text/javascript', readFileSync('fusescope.min.js')],
};
const index = readFileSync('index.html');
const config = `window.FUSESCOPE_CONFIG = ${JSON.stringify({
  applicationId: process.env.RUM_APPLICATION_ID ?? '',
  publicKey: process.env.RUM_PUBLIC_KEY ?? '',
  endpoint: process.env.RUM_ENDPOINT ?? '',
})};`;

function proxyDispatch(req, res, search) {
  const target = new URL('/dispatch', HOTROD);
  target.search = search;
  const headers = {};
  for (const h of ['traceparent', 'tracestate']) if (req.headers[h]) headers[h] = req.headers[h];
  const up = request(target, { method: 'GET', headers }, (r) => {
    res.writeHead(r.statusCode, { 'content-type': r.headers['content-type'] ?? 'application/json' });
    r.pipe(res);
  });
  up.on('error', () => res.writeHead(502).end());
  up.end();
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/dispatch') return proxyDispatch(req, res, url.search);
  if (url.pathname === '/config.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(config);
  const file = files[url.pathname];
  if (file) return res.writeHead(200, { 'content-type': file[0] }).end(file[1]);
  res.writeHead(200, { 'content-type': 'text/html' }).end(index);
}).listen(PORT, '0.0.0.0', () => console.log(`rum sample on :${PORT}`));
