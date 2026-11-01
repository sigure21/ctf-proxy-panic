import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const syntaxTargets = [
  'src/gateway.mjs',
  'src/worker.mjs',
  'solver/solve.mjs',
  'tests/challenge.mjs',
  'tests/static.test.mjs',
  'tools/ctf.mjs',
  'tools/check.mjs',
];

for (const file of syntaxTargets) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const tests = spawnSync(process.execPath, ['--test', 'tests/static.test.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(tests.status ?? 1);

