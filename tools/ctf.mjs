#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const composeFile = join(root, 'compose.yaml');
const runtimeDir = join(root, '.runtime');
const envFile = join(runtimeDir, 'ctf.env');
const projectName = 'ctf-proxy-panic';
const defaultPort = 18083;
const commands = new Set(['up', 'verify', 'status', 'flags', 'logs', 'down', 'reset', 'doctor', 'help']);

function fail(message, code = 1) {
  console.error(`error: ${message}`);
  process.exit(code);
}

function run(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error) {
    if (allowFailure) return { status: 1, stdout: '', stderr: result.error.message };
    fail(`unable to run ${command}: ${result.error.message}`);
  }
  if (!allowFailure && result.status !== 0) process.exit(result.status ?? 1);
  return result;
}

function compose(args, options) {
  return run('docker', [
    'compose',
    '--project-name', projectName,
    '--file', composeFile,
    '--env-file', envFile,
    ...args,
  ], options);
}

function requestedPort() {
  const raw = process.env.PROXY_PANIC_PORT ?? String(defaultPort);
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || String(port) !== raw || port < 1024 || port > 65535) {
    fail('PROXY_PANIC_PORT must be an integer from 1024 to 65535');
  }
  return port;
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/u)) {
    if (!line || line.startsWith('#')) continue;
    const marker = line.indexOf('=');
    if (marker < 1) continue;
    values[line.slice(0, marker)] = line.slice(marker + 1);
  }
  return values;
}

function ensureRuntime() {
  if (!existsSync(envFile)) {
    mkdirSync(runtimeDir, { recursive: true });
    const flag = `flag{proxy_panic_${randomBytes(12).toString('hex')}}`;
    const token = randomBytes(32).toString('hex');
    const port = requestedPort();
    writeFileSync(
      envFile,
      `FLAG=${flag}\nWORKER_TOKEN=${token}\nPROXY_PANIC_PORT=${port}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    );
    console.log(`created ${envFile}`);
  }

  const values = parseEnv(readFileSync(envFile, 'utf8'));
  if (!/^flag\{[ -~]{4,180}\}$/u.test(values.FLAG ?? '')) {
    fail(`invalid FLAG in ${envFile}; run "node tools/ctf.mjs reset"`);
  }
  if (!/^[a-f0-9]{64}$/u.test(values.WORKER_TOKEN ?? '')) {
    fail(`invalid WORKER_TOKEN in ${envFile}; run "node tools/ctf.mjs reset"`);
  }
  const port = Number.parseInt(values.PROXY_PANIC_PORT ?? '', 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    fail(`invalid PROXY_PANIC_PORT in ${envFile}; run "node tools/ctf.mjs reset"`);
  }
  return { ...values, PROXY_PANIC_PORT: port };
}

function assertStaticSafety() {
  const composeText = readFileSync(composeFile, 'utf8');
  const required = [
    ['localhost-only publish', /127\.0\.0\.1:\$\{PROXY_PANIC_PORT:-18083\}:3000/u],
    ['internal backplane', /backplane:\s*\{internal:\s*true\}/u],
    ['read-only filesystems', /read_only:\s*true/u],
    ['all capabilities dropped', /cap_drop:\s*\[ALL\]/u],
    ['no-new-privileges', /no-new-privileges:true/u],
    ['non-root runtime', /user:\s*node/u],
  ];
  for (const [label, pattern] of required) {
    if (!pattern.test(composeText)) fail(`compose safety check failed: ${label}`);
  }
  const banned = [
    ['privileged mode', /privileged:\s*true/u],
    ['host networking', /network_mode:\s*host/u],
    ['Docker socket', /docker\.sock/u],
    ['host bind mount', /^\s*-\s*[./~A-Za-z]:?[\\/].*:/mu],
  ];
  for (const [label, pattern] of banned) {
    if (pattern.test(composeText)) fail(`compose contains forbidden ${label}`);
  }
}

function checkToolchain() {
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < 22) fail(`Node.js 22+ is required; found ${process.versions.node}`);

  const docker = run('docker', ['--version'], { capture: true, allowFailure: true });
  if (docker.status !== 0) fail('Docker is unavailable or the daemon/client is not installed');
  const composeVersion = run('docker', ['compose', 'version'], { capture: true, allowFailure: true });
  if (composeVersion.status !== 0) fail('Docker Compose v2 is unavailable');
  return {
    docker: docker.stdout.trim(),
    compose: composeVersion.stdout.trim(),
  };
}

function targetUrl(runtime) {
  return `http://127.0.0.1:${runtime.PROXY_PANIC_PORT}`;
}

async function healthy(runtime, timeout = 2_000) {
  try {
    const response = await fetch(`${targetUrl(runtime)}/healthz`, {
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(runtime, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await healthy(runtime)) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  compose(['ps'], { allowFailure: true });
  compose(['logs', '--tail', '80'], { allowFailure: true });
  fail(`service did not become healthy within ${timeout / 1000}s`);
}

async function up() {
  const runtime = ensureRuntime();
  checkToolchain();
  assertStaticSafety();
  compose(['config', '--quiet']);
  compose(['up', '--detach', '--build', '--remove-orphans']);
  await waitForHealth(runtime);
  console.log(`Proxy Panic is ready at ${targetUrl(runtime)}`);
}

async function verify() {
  const runtime = ensureRuntime();
  checkToolchain();
  assertStaticSafety();
  if (!(await healthy(runtime))) await up();

  const env = { ...process.env, CHALLENGE_URL: targetUrl(runtime) };
  const regression = spawnSync(process.execPath, ['tests/challenge.mjs'], {
    cwd: root, env, encoding: 'utf8', stdio: 'inherit',
  });
  if (regression.status !== 0) process.exit(regression.status ?? 1);

  const solver = spawnSync(process.execPath, ['solver/solve.mjs'], {
    cwd: root, env, encoding: 'utf8', stdio: 'pipe',
  });
  if (solver.status !== 0) {
    process.stderr.write(solver.stderr ?? '');
    process.exit(solver.status ?? 1);
  }
  const observed = solver.stdout.trim();
  if (observed !== runtime.FLAG) fail('solver output did not match the generated organizer flag');
  console.log(`reference solver: ${observed}`);
  console.log('verification passed');
}

async function status() {
  const runtime = ensureRuntime();
  checkToolchain();
  compose(['ps'], { allowFailure: true });
  console.log(`HTTP health: ${(await healthy(runtime)) ? 'healthy' : 'unreachable'} (${targetUrl(runtime)})`);
}

function showFlags() {
  const runtime = ensureRuntime();
  console.log(`URL:  ${targetUrl(runtime)}`);
  console.log(`FLAG: ${runtime.FLAG}`);
}

function logs(extra) {
  ensureRuntime();
  checkToolchain();
  const allowedServices = new Set(['gateway', 'worker']);
  for (const arg of extra) {
    if (!allowedServices.has(arg) && arg !== '--follow' && arg !== '-f') {
      fail('logs accepts only gateway, worker, --follow, or -f');
    }
  }
  compose(['logs', '--tail', '200', ...extra], { allowFailure: true });
}

function down() {
  ensureRuntime();
  checkToolchain();
  compose(['down', '--remove-orphans'], { allowFailure: true });
}

async function reset() {
  down();
  if (existsSync(envFile)) unlinkSync(envFile);
  await up();
}

function doctor() {
  const runtime = ensureRuntime();
  const versions = checkToolchain();
  assertStaticSafety();
  compose(['config', '--quiet']);
  console.log(`Node:    ${process.versions.node}`);
  console.log(`Docker:  ${versions.docker}`);
  console.log(`Compose: ${versions.compose}`);
  console.log(`Runtime: ${envFile}`);
  console.log(`Target:  ${targetUrl(runtime)}`);
  console.log('Isolation configuration: passed');
}

function help() {
  console.log(`Proxy Panic lifecycle CLI

Usage:
  node tools/ctf.mjs <command>

Commands:
  up       Generate local secrets, build, start, and wait for health
  verify   Run negative regression checks and the reference solver
  status   Show Compose and HTTP health
  flags    Show the current organizer URL and flag
  logs     Show logs; optionally add gateway, worker, or --follow
  down     Stop this Compose project
  reset    Stop, rotate local secrets, and start again
  doctor   Validate Node, Docker, Compose, and static isolation
  help     Show this message`);
}

const [command = 'help', ...extra] = process.argv.slice(2);
if (!commands.has(command)) fail(`unknown command "${command}"; use "node tools/ctf.mjs help"`);

switch (command) {
  case 'up': await up(); break;
  case 'verify': await verify(); break;
  case 'status': await status(); break;
  case 'flags': showFlags(); break;
  case 'logs': logs(extra); break;
  case 'down': down(); break;
  case 'reset': await reset(); break;
  case 'doctor': doctor(); break;
  default: help();
}

