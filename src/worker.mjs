import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT ?? '4000', 10);
const FLAG = process.env.FLAG ?? '';
const WORKER_TOKEN = process.env.WORKER_TOKEN ?? '';
const PROXY_ROUTE = '/apps/builtin-code/proxy.php';
const BOOT_LOG = '/tmp/bootstrap.log';
const traces = new Map();

if (!/^flag\{[ -~]{4,180}\}$/.test(FLAG)) throw new Error('FLAG must match flag{...}');
if (!/^[a-f0-9]{64}$/.test(WORKER_TOKEN)) throw new Error('WORKER_TOKEN must be 64 lowercase hex characters');
await writeFile(BOOT_LOG, 'no bootstrap attempt yet\n', { mode: 0o600 });

function send(res, status, type, value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value ?? '', 'utf8');
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': String(body.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
function json(res, status, value) { send(res, status, 'application/json; charset=utf-8', JSON.stringify(value)); }

async function readJson(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2048) throw new Error('too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function coldStart(rawPath) {
  const marker = rawPath.lastIndexOf(PROXY_ROUTE);
  if (marker === -1) throw new Error('marker missing');
  const mountPrefix = rawPath.slice(0, marker);
  if (Buffer.byteLength(mountPrefix) > 600 || /[\r\n\u0000]/u.test(mountPrefix)) throw new Error('invalid mount');
  const command = `printf '%s\\n' "${mountPrefix}" > ${BOOT_LOG}`;
  await execFileAsync('/bin/sh', ['-c', command], {
    cwd: '/tmp',
    env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', FLAG },
    timeout: 1_500,
    maxBuffer: 4096,
    windowsHide: true,
  });
  return { mountPrefix, trace: await readFile(BOOT_LOG, 'utf8') };
}

function remember(id, trace) {
  traces.set(id, { trace: trace.slice(0, 512), expires: Date.now() + 60_000 });
  while (traces.size > 32) traces.delete(traces.keys().next().value);
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/healthz' && req.method === 'GET') return json(res, 200, { ok: true });
  if (req.headers['x-worker-token'] !== WORKER_TOKEN) return json(res, 404, { error: 'not found' });
  if (req.method === 'POST' && req.url === '/internal/bootstrap') {
    try {
      const body = await readJson(req);
      if (!body || typeof body.rawPath !== 'string' || !/^[a-f0-9]{12}$/.test(body.requestId)) throw new Error('invalid request');
      const { mountPrefix, trace } = await coldStart(body.rawPath);
      remember(body.requestId, trace);
      return json(res, 503, {
        ok: false,
        request_id: body.requestId,
        backend: 'down',
        bootstrap: 'attempted',
        mount_bytes: Buffer.byteLength(mountPrefix),
        diagnostic: `/diagnostics/bootstrap/${body.requestId}`,
        error: 'built-in helper unavailable; retry after upgrade',
      });
    } catch {
      return json(res, 400, { error: 'bootstrap request rejected' });
    }
  }
  const match = /^\/internal\/trace\/([a-f0-9]{12})$/.exec(req.url ?? '');
  if (req.method === 'GET' && match) {
    const entry = traces.get(match[1]);
    if (!entry || entry.expires < Date.now()) {
      traces.delete(match[1]);
      return json(res, 404, { error: 'diagnostic trace not found' });
    }
    return send(res, 200, 'text/plain; charset=utf-8', entry.trace);
  }
  return json(res, 404, { error: 'not found' });
});

server.maxHeadersCount = 16;
server.headersTimeout = 4_000;
server.requestTimeout = 4_000;
server.keepAliveTimeout = 2_000;
server.listen(PORT, HOST, () => console.log(`proxy-panic worker listening on ${HOST}:${PORT}`));

