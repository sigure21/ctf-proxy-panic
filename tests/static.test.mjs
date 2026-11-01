import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('repository is standalone and has no parent-suite dependency', () => {
  const files = [
    read('../README.md'),
    read('../package.json'),
    read('../compose.yaml'),
    read('../tools/ctf.mjs'),
  ].join('\n');
  assert.doesNotMatch(files, /modern-ctf-2026|collection root|scripts\/ctf\.mjs/u);
  assert.equal(basename(resolve(root)), 'ctf-proxy-panic');
});

test('compose keeps the vulnerable worker behind a hardened internal boundary', () => {
  const compose = read('../compose.yaml');
  assert.match(compose, /127\.0\.0\.1:\$\{PROXY_PANIC_PORT:-18083\}:3000/u);
  assert.match(compose, /backplane:\s*\{internal:\s*true\}/u);
  assert.match(compose, /read_only:\s*true/u);
  assert.match(compose, /user:\s*node/u);
  assert.match(compose, /cap_drop:\s*\[ALL\]/u);
  assert.match(compose, /no-new-privileges:true/u);
  assert.doesNotMatch(compose, /privileged:\s*true|network_mode:\s*host|docker\.sock/u);

  const workerBlock = compose.slice(compose.indexOf('  worker:'), compose.indexOf('  gateway:'));
  assert.doesNotMatch(workerBlock, /^\s+ports:/mu);
  assert.match(workerBlock, /networks:\s*\[backplane\]/u);
});

test('flag and shell sink exist only in the worker source', () => {
  const gateway = read('../src/gateway.mjs');
  const worker = read('../src/worker.mjs');
  assert.doesNotMatch(gateway, /process\.env\.FLAG|execFile|\/bin\/sh/u);
  assert.match(worker, /process\.env\.FLAG/u);
  assert.match(worker, /execFileAsync\('\/bin\/sh'/u);
});

test('container build is pinned and non-root', () => {
  const dockerfile = read('../Dockerfile');
  assert.match(dockerfile, /^FROM node:22\.[^\s]+@sha256:[a-f0-9]{64}$/mu);
  assert.match(dockerfile, /^USER node$/mu);
  assert.doesNotMatch(dockerfile, /\bADD\b|curl|wget/u);
});

test('generated secrets and local artifacts are ignored', () => {
  const ignore = read('../.gitignore');
  assert.match(ignore, /^\.runtime\/$/mu);
  assert.match(ignore, /^node_modules\/$/mu);
});

