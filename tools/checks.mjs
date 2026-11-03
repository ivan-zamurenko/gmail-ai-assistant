#!/usr/bin/env node
// One quality-gate runner for local use and CI (S00-04). Stages run in order and
// the first failure stops the pipeline with that stage's exit code.
//
//   node tools/checks.mjs            lint, tests, build, artifacts, docs, diff
//   node tools/checks.mjs --install  first: npm ci for root and bot, lock drift
//                                    check, synthetic src/config/local.js
//
// Never starts the bot, registers commands, deploys or calls live services.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCKS = ['package-lock.json', 'bot/package-lock.json'].map((p) => join(ROOT, p));
const SOURCE_MARKER = '(SOURCE — load dist/ instead)';
const FIXED_ARTIFACTS = [
  'src/popup/popup.js',
  'src/offscreen/offscreen.html',
  'src/offscreen/offscreen.js',
  'assets/zxing_reader.wasm',
  'console/lookupConsole.js',
  'console/futureDateConsole.js',
];

const exists = (path) => access(path).then(() => true, () => false);

export async function hashFiles(paths) {
  const hashes = new Map();
  for (const path of paths) {
    hashes.set(path, createHash('sha256').update(await readFile(path)).digest('hex'));
  }
  return hashes;
}

export function assertUnchanged(before, after) {
  const changed = [...before].filter(([path, hash]) => after.get(path) !== hash);
  if (changed.length) {
    throw new Error(changed.map(([path]) => `${relative(ROOT, path)} changed during install`).join('; '));
  }
}

export function parseTestSummary(output) {
  const read = (key) => Number(output.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1]);
  const summary = { tests: read('tests'), pass: read('pass'), fail: read('fail') };
  if (Object.values(summary).some(Number.isNaN)) throw new Error('test summary not found in output');
  if (summary.tests === 0) throw new Error('no tests were run');
  if (summary.fail > 0) throw new Error(`${summary.fail} failed`);
  return summary;
}

export async function verifyArtifacts(dist) {
  const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
  if (manifest.name?.includes(SOURCE_MARKER)) throw new Error('dist manifest still has the source marker');

  const required = new Set([
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
    ...FIXED_ARTIFACTS,
  ].filter(Boolean));
  const missing = [];
  for (const path of required) {
    if (!(await exists(join(dist, path)))) missing.push(path);
  }
  if (missing.length) throw new Error(`missing dist artifacts: ${missing.join(', ')}`);
}

function run(cmd, args, { cwd, stream }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const take = (target) => (chunk) => {
      output += chunk;
      if (stream) target.write(chunk);
    };
    child.stdout.on('data', take(process.stdout));
    child.stderr.on('data', take(process.stderr));
    child.on('error', (error) => resolve({ code: 127, output: `${output}${error.message}\n` }));
    child.on('close', (code, signal) => resolve({ code: code ?? (signal ? 1 : 0), output }));
  });
}

/**
 * @param {{ name: string, cmd?: string, args?: string[], run?: () => Promise<void>,
 *           after?: (output: string) => unknown }[]} stages
 * @returns {Promise<number>} 0 only when every stage succeeded
 */
export async function runStages(stages, { log = console.log, cwd = ROOT, stream = false } = {}) {
  for (const stage of stages) {
    log(`▶ ${stage.name}`);
    let output = '';
    try {
      if (stage.run) {
        await stage.run();
      } else {
        const result = await run(stage.cmd, stage.args ?? [], { cwd, stream });
        output = result.output;
        if (result.code !== 0) {
          if (!stream) log(output.split('\n').slice(-40).join('\n'));
          log(`FAIL ${stage.name} (exit ${result.code})`);
          return result.code;
        }
      }
      await stage.after?.(output);
    } catch (error) {
      log(`FAIL ${stage.name}: ${error.message}`);
      return 1;
    }
    log(`ok ${stage.name}`);
  }
  log(`PASS ${stages.length} stages`);
  return 0;
}

let lockHashes;

export const INSTALL_STAGES = [
  { name: 'lock-snapshot', run: async () => { lockHashes = await hashFiles(LOCKS); } },
  { name: 'install-root', cmd: 'npm', args: ['ci', '--no-audit', '--no-fund'] },
  { name: 'install-bot', cmd: 'npm', args: ['--prefix', 'bot', 'ci', '--no-audit', '--no-fund'] },
  { name: 'lock-drift', run: async () => assertUnchanged(lockHashes, await hashFiles(LOCKS)) },
  {
    // Build and queue tests import the gitignored config; never overwrite a real one.
    name: 'synthetic-config',
    run: async () => {
      const local = join(ROOT, 'src/config/local.js');
      if (!(await exists(local))) await copyFile(join(ROOT, 'src/config/local.example.js'), local);
    },
  },
];

export const STAGES = [
  { name: 'lint', cmd: 'npm', args: ['run', 'lint'] },
  { name: 'test', cmd: 'npm', args: ['test'], after: parseTestSummary },
  { name: 'build', cmd: 'npm', args: ['run', 'build'] },
  { name: 'artifacts', run: () => verifyArtifacts(join(ROOT, 'dist')) },
  { name: 'docs', cmd: process.execPath, args: ['tools/roadmap.mjs', 'validate'] },
  { name: 'docs-links', cmd: process.execPath, args: ['tools/check-docs.mjs'] },
  { name: 'diff-check', cmd: 'git', args: ['diff', '--check'] },
];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const install = process.argv.includes('--install');
  const code = await runStages([...(install ? INSTALL_STAGES : []), ...STAGES], { stream: true });
  if (code === 0) {
    console.log('browser: NOT RUN — no browser test suite is configured yet (untested, not skipped)');
  }
  process.exitCode = code;
}
