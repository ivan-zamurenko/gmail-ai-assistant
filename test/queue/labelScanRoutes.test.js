import test from 'node:test';
import assert from 'node:assert/strict';

import { createLabelScanRoutes } from '../../src/background/labelScanRoutes.js';
import { LABEL_SCAN_JOB_KEY } from '../../src/queue/labelScanJob.js';

function memoryStorage() {
  const values = {};
  return {
    values,
    async get(key) { return { [key]: values[key] }; },
    async set(entries) { Object.assign(values, globalThis.structuredClone(entries)); },
  };
}

function routes({ runner = async () => ({ accepted: true }), offscreen = async () => {} } = {}) {
  const storage = memoryStorage();
  const sent = [];
  let clock = 1000;
  let ids = 0;
  const api = createLabelScanRoutes({
    storage,
    ensureOffscreen: offscreen,
    sendToRunner: async (msg) => { sent.push(msg); return runner(msg); },
    now: () => clock++,
    newId: () => `job-${++ids}`,
  });
  return { api, storage, sent, job: () => storage.values[LABEL_SCAN_JOB_KEY] };
}

test('start stores one job, hands it to the runner and marks it accepted', async () => {
  const r = routes();
  assert.deepEqual(await r.api.start({ type: 'label-scan-start', dryRun: true }), { jobId: 'job-1' });
  assert.deepEqual(r.sent, [{ type: 'label-scan-run', jobId: 'job-1', dryRun: true }]);
  assert.equal(r.job().state, 'queued');
  assert.equal(r.job().accepted, true);

  const second = await r.api.start({ type: 'label-scan-start', dryRun: false });
  assert.equal(second.reason, 'A label scan is already running');
  assert.equal(second.jobId, 'job-1');
  assert.equal(r.sent.length, 1, 'a second start never reaches the runner');
});

test('an unavailable runner ends the job as an error without any work', async () => {
  for (const runner of [async () => ({}), async () => { throw new Error('no receiver'); }]) {
    const r = routes({ runner });
    const response = await r.api.start({ type: 'label-scan-start', dryRun: false });
    assert.equal(response.reason, 'Label scan runner unavailable — nothing was changed');
    assert.equal(r.job().state, 'error');
    assert.equal(r.job().accepted, false);
  }
  const bad = routes();
  assert.equal((await bad.api.start({ type: 'label-scan-start', dryRun: 'yes' })).reason, 'Invalid label scan request');
  assert.equal(bad.job(), undefined);
});

test('progress and finish update only the running job; runner boot interrupts an accepted one', async () => {
  const r = routes();
  await r.api.start({ type: 'label-scan-start', dryRun: false });
  await r.api.progress({ jobId: 'job-1', stage: 'reading', current: 2, total: 5 });
  await r.api.progress({ jobId: 'other', stage: 'reading', current: 3, total: 5 });
  assert.deepEqual([r.job().state, r.job().current, r.job().total], ['running', 2, 5]);

  await r.api.boot();
  assert.equal(r.job().state, 'interrupted');
  await r.api.finish({ jobId: 'job-1', status: 'done', summary: 'late' });
  assert.equal(r.job().state, 'interrupted', 'a late finish cannot overwrite the interruption');

  const next = await r.api.start({ type: 'label-scan-start', dryRun: true });
  assert.equal(next.jobId, 'job-2');
  await r.api.finish({ jobId: 'job-2', status: 'done', summary: 'Фото: 3', details: 'rows' });
  assert.deepEqual([r.job().state, r.job().summary, r.job().details], ['done', 'Фото: 3', 'rows']);
});

test('concurrent starts create exactly one job', async () => {
  let release;
  const r = routes({ runner: () => new Promise(resolve => { release = () => resolve({ accepted: true }); }) });
  const first = r.api.start({ type: 'label-scan-start', dryRun: true });
  const second = r.api.start({ type: 'label-scan-start', dryRun: true });
  await new Promise(resolve => globalThis.setTimeout(resolve, 0));
  release();
  const results = await Promise.all([first, second]);
  assert.deepEqual(results.map(x => x.jobId).sort(), ['job-1', 'job-1']);
  assert.equal(results.filter(x => x.reason).length, 1);
  assert.equal(r.sent.length, 1);
});

test('an orphaned job left by a dead worker never blocks the next scan', async () => {
  const r = routes();
  // A previous worker stored the job, then died before the runner accepted it.
  r.storage.values[LABEL_SCAN_JOB_KEY] = {
    version: 1, id: 'orphan', dryRun: false, state: 'queued', stage: 'queued', accepted: false,
    current: 0, total: 0, startedAt: 1, updatedAt: 1, summary: null, details: null, status: null,
  };
  await r.api.boot();
  assert.equal(r.job().state, 'interrupted', 'a fresh runner clears a job nobody is starting');

  r.storage.values[LABEL_SCAN_JOB_KEY] = { ...r.job(), id: 'orphan-2', state: 'running', status: null };
  const next = await r.api.start({ type: 'label-scan-start', dryRun: true });
  assert.equal(next.jobId, 'job-1', 'start replaces an orphan instead of reporting busy');
  assert.equal(r.sent.length, 1);
});

test('boot does not interrupt a job this worker is still handing over', async () => {
  let release;
  const r = routes({ runner: () => new Promise(resolve => { release = () => resolve({ accepted: true }); }) });
  const pending = r.api.start({ type: 'label-scan-start', dryRun: true });
  await new Promise(resolve => globalThis.setTimeout(resolve, 0));
  await r.api.boot();
  assert.equal(r.job().state, 'queued');
  release();
  assert.deepEqual(await pending, { jobId: 'job-1' });
  assert.equal(r.job().accepted, true);
});
