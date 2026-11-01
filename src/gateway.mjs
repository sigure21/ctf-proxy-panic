import { randomBytes } from 'node:crypto';
import http from 'node:http';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = boundedPort(process.env.PORT, 3000);
const WORKER_HOST = process.env.WORKER_HOST ?? '127.0.0.1';
const WORKER_PORT = boundedPort(process.env.WORKER_PORT, 4000);
const WORKER_TOKEN = process.env.WORKER_TOKEN ?? '';
const PROXY_ROUTE = '/apps/builtin-code/proxy.php';

if (!/^[a-f0-9]{64}$/.test(WORKER_TOKEN)) throw new Error('WORKER_TOKEN must be 64 lowercase hex characters');

const style = `
  :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; } body { margin: 0; background: #0c1018; color: #f5f7ff; }
  main { width: min(920px, calc(100% - 2rem)); margin: 7vh auto; }
  h1 { margin: .2rem 0; font-size: clamp(2.5rem, 8vw, 5.5rem); letter-spacing: -.065em; }
  p { color: #b9c2d8; line-height: 1.65; }
  section { margin: 1rem 0; padding: 1.3rem; border: 1px solid #303a53; border-radius: 18px; background: #141b29; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
  pre { min-height: 6rem; padding: 1rem; white-space: pre-wrap; overflow-wrap: anywhere; border-radius: 12px; background: #090d15; color: #d9e4ff; }
  button { border: 0; border-radius: 10px; padding: .8rem 1rem; background: #9bc0ff; color: #07152e; font: inherit; font-weight: 800; cursor: pointer; }
  .badge { display: inline-block; padding: .25rem .65rem; border: 1px solid #5d719f; border-radius: 999px; color: #b9d2ff; }
  .warn { color: #ffd58a; }
`;

const home = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Proxy Panic</title><style>${style}</style><script src="/assets/office.js" defer></script></head>
<body><main><span class="badge">BUILT-IN OFFICE · 26.4.302-lab</span><h1>Proxy Panic</h1>
<p>문서 미리보기 서버가 cold start 상태입니다. 관리자는 built-in proxy가 자동으로 복구한다고 믿고 있습니다.</p>
<section><h2>Office backend</h2><p class="warn">Standalone office server가 아니라, 웹 애플리케이션에 포함된 built-in CODE 호환 프록시입니다.</p><button id="check">상태 확인</button><pre id="output">아직 확인하지 않았습니다.</pre></section>
<section><h2>운영 메모</h2><p>업그레이드 직후라 helper binary가 준비되지 않았습니다. proxy는 요청된 설치 경로를 사용해 bootstrap을 시도합니다.</p></section>
<p>이 서비스는 교육용 축소 모델이며 실제 Nextcloud/Collabora 제품이 아닙니다.</p></main></body></html>`;

const clientScript = `const output = document.querySelector('#output');
document.querySelector('#check').addEventListener('click', async () => {
  output.textContent = 'proxy 확인 중…';
  const response = await fetch('/apps/builtin-code/proxy.php?status=1&trace=public');
  output.textContent = JSON.stringify(await response.json(), null, 2);
});
//# sourceMappingURL=office.js.map
`;

const sourceMap = {
  version: 3, file: 'office.js', names: [], mappings: '',
  sources: ['webpack://proxy-panic/apps/builtin-code/lib/ColdStartProxy.php'],
  sourcesContent: [`// diagnostic excerpt — source paths were bundled by mistake\n$route = '/apps/builtin-code/proxy.php';\n$mount = raw_prefix_before($_SERVER['REQUEST_URI'], $route);\nif (!$codeServer->isRunning()) {\n  shell_exec('printf "%s\\n" "' . $mount . '" > /tmp/bootstrap.log');\n}\n// router canonicalization occurs separately, before this handler runs\n`],
};

function boundedPort(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function send(res, status, type, value, extra = {}) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value ?? '', 'utf8');
  res.writeHead(status, {
    'Content-Type': type, 'Content-Length': String(body.length), 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'",
    'Referrer-Policy': 'no-referrer', Server: 'built-in-office-proxy/26.4.302-lab', ...extra,
  });
  res.end(body);
}

function sendJson(res, status, value) { send(res, status, 'application/json; charset=utf-8', JSON.stringify(value)); }
function rawPathOf(target) { return (target ?? '/').split('?', 1)[0]; }

function canonicalRoute(rawPath) {
  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch { return null; }
  if (/[\u0000-\u001f\u007f]/u.test(decoded)) return null;
  const stack = [];
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') { stack.pop(); continue; }
    stack.push(segment);
  }
  return `/${stack.join('/')}`;
}

function workerRequest(method, path, payload) {
  const body = payload === undefined ? null : Buffer.from(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: WORKER_HOST, port: WORKER_PORT, method, path, timeout: 2_000,
      headers: { 'X-Worker-Token': WORKER_TOKEN, Connection: 'close', ...(body ? { 'Content-Type': 'application/json', 'Content-Length': String(body.length) } : {}) },
    }, (response) => {
      const chunks = []; let size = 0;
      response.on('data', (chunk) => { size += chunk.length; if (size <= 4096) chunks.push(chunk); });
      response.on('end', () => size > 4096 ? reject(new Error('worker response too large')) : resolve({ status: response.statusCode ?? 502, type: response.headers['content-type'] ?? 'application/json', body: Buffer.concat(chunks) }));
    });
    request.on('timeout', () => request.destroy(new Error('worker timeout')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

const server = http.createServer(async (req, res) => {
  const rawPath = rawPathOf(req.url);
  const route = canonicalRoute(rawPath);
  if (!route) return sendJson(res, 400, { error: 'invalid request target' });
  if (req.method === 'GET' && route === '/') return send(res, 200, 'text/html; charset=utf-8', home);
  if (req.method === 'GET' && route === '/healthz') return sendJson(res, 200, { ok: true, service: 'proxy-panic', backend: 'down' });
  if (req.method === 'GET' && route === '/assets/office.js') return send(res, 200, 'application/javascript; charset=utf-8', clientScript);
  if (req.method === 'GET' && route === '/assets/office.js.map') return sendJson(res, 200, sourceMap);
  if (req.method === 'GET' && route === '/robots.txt') return send(res, 200, 'text/plain; charset=utf-8', 'User-agent: *\nDisallow: /diagnostics/\n');
  if (req.method === 'GET' && route.startsWith('/diagnostics/bootstrap/')) {
    try {
      const worker = await workerRequest('GET', `/internal/trace/${route.slice('/diagnostics/bootstrap/'.length)}`);
      return send(res, worker.status, worker.type, worker.body);
    } catch { return sendJson(res, 502, { error: 'diagnostic worker unavailable' }); }
  }
  if (route === PROXY_ROUTE && req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
  if (req.method === 'GET' && route === PROXY_ROUTE) {
    const requestId = randomBytes(6).toString('hex');
    try {
      const worker = await workerRequest('POST', '/internal/bootstrap', { rawPath, requestId });
      return send(res, worker.status, worker.type, worker.body);
    } catch { return sendJson(res, 502, { error: 'bootstrap worker unavailable' }); }
  }
  return sendJson(res, 404, { error: 'not found' });
});

server.maxHeadersCount = 24;
server.headersTimeout = 5_000;
server.requestTimeout = 5_000;
server.keepAliveTimeout = 3_000;
server.listen(PORT, HOST, () => console.log(`proxy-panic gateway listening on ${HOST}:${PORT}`));

