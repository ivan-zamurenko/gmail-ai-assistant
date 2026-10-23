// Build toolchain regressions (S00-02). Each case builds a throwaway copy of the
// extension sources with a synthetic local config; the real src/config/local.js
// is never copied and no network is used.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile, appendFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_MARKER = ' (SOURCE — load dist/ instead)';
const PRIVATE_CONFIG = join(REPO, 'src', 'config', 'local.js');

async function makeWorkspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'dpd-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['build.js', 'manifest.json', 'package.json', 'assets']) {
    await cp(join(REPO, path), join(root, path), { recursive: true });
  }
  await cp(join(REPO, 'src'), join(root, 'src'), {
    recursive: true,
    filter: (path) => path !== PRIVATE_CONFIG,
  });
  await cp(join(root, 'src/config/local.example.js'), join(root, 'src/config/local.js'));
  await symlink(join(REPO, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

function runBuild(root, { cwd = root, args = [] } = {}) {
  return spawnSync(process.execPath, [join(root, 'build.js'), ...args], {
    cwd, encoding: 'utf8', timeout: 60_000,
  });
}

const exists = (path) => access(path).then(() => true, () => false);

async function waitFor(check, what, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  assert.fail(`timed out waiting for ${what}`);
}

test('one-off build emits every manifest entry point and console helpers', async (t) => {
  const root = await makeWorkspace(t);
  const result = runBuild(root);
  assert.equal(result.status, 0, result.stderr);

  const dist = join(root, 'dist');
  const source = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const built = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
  assert.ok(!built.name.includes(SOURCE_MARKER), 'dist manifest keeps the source marker');
  assert.equal(built.name, source.name.replace(SOURCE_MARKER, ''));
  assert.equal(built.key, source.key, 'extension identity must not change');
  assert.equal(built.version, source.version);

  const required = [
    built.background.service_worker,
    built.action.default_popup,
    'src/popup/popup.js',
    'src/popup/popup.css',
    'src/offscreen/offscreen.html',
    'src/offscreen/offscreen.js',
    'assets/zxing_reader.wasm',
    'console/lookupConsole.js',
    'console/futureDateConsole.js',
  ];
  for (const path of required) {
    assert.ok(await exists(join(dist, path)), `missing dist/${path}`);
  }
  for (const icon of Object.values(built.icons)) {
    assert.ok(await exists(join(dist, icon)), `missing dist/${icon}`);
  }

  // Console helpers are pasted into DevTools: no ESM export, not minified.
  const lookupConsole = await readFile(join(dist, 'console/lookupConsole.js'), 'utf8');
  assert.doesNotMatch(lookupConsole, /^\s*export\s/m);
  assert.ok(lookupConsole.split('\n').length > 20, 'console helper looks minified');
});

test('watch rebuilds the same console artifact when lookup changes', async (t) => {
  const root = await makeWorkspace(t);
  const consoleFile = join(root, 'dist/console/lookupConsole.js');
  const child = spawn(process.execPath, [join(root, 'build.js'), '--watch'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  t.after(() => child.kill());

  await waitFor(() => /watching/.test(output), 'watch to start');
  await waitFor(() => exists(consoleFile), 'initial console bundle in watch mode');

  const marker = `s00-02-watch-${Date.now()}`;
  await appendFile(join(root, 'src/depot/lookup.js'), `\nglobalThis.__buildMarker = '${marker}';\n`);
  await waitFor(
    async () => (await exists(consoleFile)) && (await readFile(consoleFile, 'utf8')).includes(marker),
    'console bundle to pick up the lookup change',
  );
  assert.doesNotMatch(await readFile(consoleFile, 'utf8'), /^\s*export\s/m);
});

test('dist cleanup is anchored to the project, not the caller cwd', async (t) => {
  const root = await makeWorkspace(t);
  const stale = join(root, 'dist/stale.txt');
  await mkdir(dirname(stale), { recursive: true });
  await writeFile(stale, 'old build output');

  const caller = await mkdtemp(join(tmpdir(), 'dpd-caller-'));
  t.after(() => rm(caller, { recursive: true, force: true }));
  const foreign = join(caller, 'dist', 'keep.txt');
  await mkdir(dirname(foreign), { recursive: true });
  await writeFile(foreign, 'not ours');

  const result = runBuild(root, { cwd: caller });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(await exists(foreign), 'build deleted a dist/ outside the project');
  assert.ok(!(await exists(stale)), 'stale project dist output was not cleaned');
  assert.ok(await exists(join(root, 'dist/manifest.json')));
  for (const kept of ['assets/icon16.png', 'src/depot/lookup.js', 'manifest.json']) {
    assert.ok(await exists(join(root, kept)), `build removed ${kept}`);
  }
});

test('a broken entry point fails the build with a non-zero exit code', async (t) => {
  const root = await makeWorkspace(t);
  await appendFile(join(root, 'src/popup/popup.js'), '\nconst = ;\n');
  const result = runBuild(root);
  assert.notEqual(result.status, 0);
  assert.equal(result.signal, null);
});
