import { readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const i = process.argv.indexOf('--root');
const root = resolve(i < 0 ? process.cwd() : process.argv[i + 1]);
async function walk(p) {
  const entries = await readdir(p, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.isDirectory()) out.push(...await walk(join(p, e.name)));
    else if (e.name.endsWith('.js')) out.push(join(p, e.name));
  }
  return out;
}
const files = await walk(join(root, 'src'));
if (!files.length) throw new Error('No source JavaScript files found');
let failed = 0;
for (const p of files) {
  const result = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (result.status !== 0) { failed++; console.error(p, result.stderr); }
}
console.log(JSON.stringify({ command: 'node --check src/**/*.js (each file)', files: files.length, failed }));
process.exitCode = failed ? 1 : 0;
