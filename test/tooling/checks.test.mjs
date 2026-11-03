// Quality-gate runner and CI workflow policy (S00-04). Stages are synthetic
// subprocesses; nothing here installs packages or calls external services.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  runStages, parseTestSummary, verifyArtifacts, hashFiles, assertUnchanged, STAGES,
} from '../../tools/checks.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const node = (code) => ({ cmd: process.execPath, args: ['-e', code] });

function collector() {
  const lines = [];
  return { lines, log: (line) => lines.push(line), text: () => lines.join('\n') };
}

test('a failing stage stops the pipeline with its exit code and no overall PASS', async () => {
  const out = collector();
  const ran = [];
  const stages = [
    { name: 'first', ...node('process.exit(0)'), after: () => ran.push('first') },
    { name: 'broken', ...node('process.exit(7)'), after: () => ran.push('broken') },
    { name: 'never', ...node('process.exit(0)'), after: () => ran.push('never') },
  ];

  const code = await runStages(stages, { log: out.log, cwd: REPO });

  assert.equal(code, 7);
  assert.deepEqual(ran, ['first']);
  assert.match(out.text(), /FAIL broken \(exit 7\)/);
  assert.doesNotMatch(out.text(), /^PASS/m);
  assert.doesNotMatch(out.text(), /never/);
});

test('a stage whose post-check throws fails even when the command exited 0', async () => {
  const out = collector();
  const code = await runStages([
    { name: 'tests', ...node('console.log("# tests 0")'), after: (o) => parseTestSummary(o) },
  ], { log: out.log, cwd: REPO });
  assert.notEqual(code, 0);
  assert.match(out.text(), /FAIL tests/);
});

test('test summary must report at least one test and zero failures', () => {
  assert.deepEqual(parseTestSummary('# tests 12\n# pass 12\n# fail 0\n'), { tests: 12, pass: 12, fail: 0 });
  assert.throws(() => parseTestSummary('# tests 0\n# pass 0\n# fail 0\n'), /no tests/);
  assert.throws(() => parseTestSummary('# tests 3\n# pass 2\n# fail 1\n'), /1 failed/);
  assert.throws(() => parseTestSummary('all good'), /summary/);
});

test('missing manifest artifacts are reported by path', async (t) => {
  const dist = await mkdtemp(join(tmpdir(), 'dpd-dist-'));
  t.after(() => rm(dist, { recursive: true, force: true }));
  await writeFile(join(dist, 'manifest.json'), JSON.stringify({
    name: 'Synthetic',
    background: { service_worker: 'src/background/background.js' },
    action: { default_popup: 'src/popup/popup.html' },
    icons: { 16: 'assets/icon16.png' },
  }));
  await mkdir(join(dist, 'src/background'), { recursive: true });
  await writeFile(join(dist, 'src/background/background.js'), '');

  await assert.rejects(verifyArtifacts(dist), (error) => {
    assert.match(error.message, /src\/popup\/popup\.html/);
    assert.match(error.message, /assets\/icon16\.png/);
    assert.match(error.message, /console\/lookupConsole\.js/);
    assert.doesNotMatch(error.message, /background\.js/);
    return true;
  });
});

test('the source marker in a built manifest is rejected', async (t) => {
  const dist = await mkdtemp(join(tmpdir(), 'dpd-dist-'));
  t.after(() => rm(dist, { recursive: true, force: true }));
  await writeFile(join(dist, 'manifest.json'), JSON.stringify({ name: 'X (SOURCE — load dist/ instead)' }));
  await assert.rejects(verifyArtifacts(dist), /source marker/);
});

test('a lockfile changed by install is detected', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dpd-lock-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const lock = join(dir, 'package-lock.json');
  await writeFile(lock, '{"lockfileVersion":3}');

  const before = await hashFiles([lock]);
  assert.doesNotThrow(() => assertUnchanged(before, before));
  await writeFile(lock, '{"lockfileVersion":3,"drift":true}');
  const after = await hashFiles([lock]);
  assert.throws(() => assertUnchanged(before, after), /package-lock\.json changed/);
});

test('the default plan runs the same local gates, browser tests are reported separately', () => {
  const names = STAGES.map((s) => s.name);
  for (const required of ['lint', 'test', 'build', 'artifacts', 'docs', 'diff-check']) {
    assert.ok(names.includes(required), `missing stage ${required}`);
  }
  const commands = STAGES.map((s) => [s.cmd, ...(s.args ?? [])].join(' '));
  assert.ok(commands.some((c) => /npm run lint$/.test(c)));
  assert.ok(commands.some((c) => /npm test$/.test(c)));
  assert.ok(commands.some((c) => /npm run build$/.test(c)));
  assert.ok(!commands.some((c) => /register|start|deploy|publish/.test(c)), 'no live commands');
});

test('CI workflow is read-only, secret-free and runs the shared runner with locked installs', async () => {
  const raw = await readFile(join(REPO, '.github/workflows/checks.yml'), 'utf8');
  const yaml = raw.replace(/(^|\s)#.*$/gm, '');
  assert.match(yaml, /^permissions:\n {2}contents: read$/m);
  assert.doesNotMatch(yaml, /secrets\.|write-all|: write\b/);
  assert.doesNotMatch(yaml, /firebase deploy|register|npm (?:--prefix bot )?start|npm publish/);
  assert.match(yaml, /node tools\/checks\.mjs --install/);
  assert.match(yaml, /persist-credentials: false/);
  assert.match(yaml, /node-version-file: \.node-version/);
  for (const uses of yaml.match(/uses: \S+/g) ?? []) {
    assert.match(uses, /@[0-9a-f]{40}$/, `action not pinned to a commit: ${uses}`);
  }
});
