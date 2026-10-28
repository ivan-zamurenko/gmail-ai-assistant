import test from 'node:test';
import assert from 'node:assert/strict';

import { executeBarcodeTask } from '../../src/queue/barcodeExecutor.js';
import { LABEL_RESCHEDULE_RECOVERY_KEY } from '../../src/depot/rescheduleRecovery.js';
import { DEPOT_PROBE } from '../../src/depot/labelVerifier.js';
import { TASK_SCHEMA_VERSION } from '../../src/queue/contract.js';

function memoryStorage() {
  const values = {};
  return {
    values,
    async get(key) { return { [key]: values[key] }; },
    async set(entries) { Object.assign(values, JSON.parse(JSON.stringify(entries))); },
    async remove(key) { delete values[key]; },
  };
}

const task = (dryRun) => ({
  schemaVersion: TASK_SCHEMA_VERSION,
  command: 'reschedule',
  args: { mode: 'barcodes', dryRun },
});

const lookup = async (number) => ({
  result: number === DEPOT_PROBE
    ? { reason: '0 matches' }
    : { consNumber: '123456789', consId: '7654321' },
});

async function scanOne({ verify }) {
  assert.equal(await verify('123456789'), true);
  return [{
    from: 'DRIVER-PHOTO.JPG',
    to: '2026/09/2026-09-01_123456789.jpg',
    number: '123456789',
    contested: false,
    error: null,
  }];
}

test('Discord barcode live scan saves depot errors for same-day retry', async () => {
  const storage = memoryStorage();
  const rescheduleCalls = [];

  const result = await executeBarcodeTask(task(false), {
    loadConfig: () => ({ driveFolderId: 'synthetic-folder' }),
    getAuthToken: async () => 'synthetic-token',
    lookup,
    processLabels: scanOne,
    storage,
    reschedule: async (options) => {
      rescheduleCalls.push(options);
      return { result: {
        changed: 0,
        skipped: 0,
        errors: 1,
        results: [{
          consNumber: '123456789',
          consId: '7654321',
          status: 'ERROR',
          action: 'ERROR',
        }],
      } };
    },
  });

  const target = { consNumber: '123456789', consId: '7654321', type: 'PopUp' };
  assert.equal(result.status, 'done');
  assert.match(result.summary, /Помилки: 1.*Retry: 1/);
  assert.deepEqual(rescheduleCalls, [{ dryRun: false, targets: [target] }]);
  assert.deepEqual(storage.values[LABEL_RESCHEDULE_RECOVERY_KEY].targets, [target]);
});

test('Discord barcode dry run previews the same exact target without local writes', async () => {
  for (const dryRun of [true, undefined]) {
    const result = await executeBarcodeTask(task(dryRun), {
      loadConfig: () => ({ driveFolderId: 'synthetic-folder' }),
      getAuthToken: async () => 'synthetic-token',
      lookup,
      processLabels: scanOne,
      storage: {
        get: async () => { throw new Error('Dry run must not read recovery storage'); },
        set: async () => { throw new Error('Dry run must not write recovery storage'); },
        remove: async () => { throw new Error('Dry run must not clear recovery storage'); },
      },
      reschedule: async ({ dryRun, targets }) => ({ result: {
        dryRun,
        count: targets.length,
        packages: targets,
      } }),
    });

    assert.equal(result.status, 'done');
    assert.match(result.summary, /Dry run.*Reschedule: 1/);
  }
});

test('Discord barcode scan reports PII-free execution stages', async () => {
  const progress = [];
  await executeBarcodeTask(task(true), {
    loadConfig: () => ({ driveFolderId: 'synthetic-folder' }),
    getAuthToken: async () => 'synthetic-token',
    lookup,
    processLabels: async (options) => {
      options.onProgress(0, 1, 'listing');
      options.onProgress(1, 1, 'reading');
      options.onProgress(1, 1, 'done');
      return scanOne(options);
    },
    storage: memoryStorage(),
    onProgress: (current, total, stage) => progress.push({ current, total, stage }),
    reschedule: async ({ dryRun, targets }) => ({ result: {
      dryRun, count: targets.length, packages: targets,
    } }),
  });

  assert.deepEqual(progress.map(({ stage }) => stage), [
    'depot-probe', 'depot-ready', 'drive-auth', 'drive-ready',
    'listing', 'reading', 'done', 'reschedule',
  ]);
  assert.doesNotMatch(JSON.stringify(progress), /123456789|7654321|synthetic-token/);
});

test('invalid barcode tasks stop before config, Drive or depot ports', async () => {
  let portAccesses = 0;
  const ports = new Proxy({}, { get() {
    portAccesses++;
    throw new Error('Invalid barcode task must not access ports');
  } });
  const invalid = [
    null,
    { ...task(true), schemaVersion: 0 },
    { ...task(true), command: 'unknown' },
    { ...task(true), args: { mode: 'unknown', dryRun: true } },
    ...[null, 'false', 0, {}].map(task),
  ];
  for (const candidate of invalid) {
    assert.equal((await executeBarcodeTask(candidate, ports)).status, 'error');
  }
  assert.equal(portAccesses, 0);
});

test('Drive auth and forbidden never replay; file errors remain visible with zero targets', async () => {
  for (const code of ['unauthenticated', 'permission-denied', 'files']) {
    let scans = 0;
    let invalidations = 0;
    const ports = {
      loadConfig: () => ({ driveFolderId: 'synthetic-folder' }), getAuthToken: async () => 'synthetic-token', lookup,
      removeCachedAuthToken: async () => { invalidations++; },
      processLabels: async () => {
        scans++;
        if (code !== 'files') throw Object.assign(new Error('synthetic-secret'), { code });
        return [{ number: null, error: 'Label failed' }];
      },
      reschedule: async () => assert.fail('no valid targets'),
    };
    const result = await executeBarcodeTask(task(false), ports);
    assert.equal(result.status, 'error');
    assert.equal(scans, 1);
    assert.equal(invalidations, code === 'unauthenticated' ? 1 : 0);
    assert.doesNotMatch(result.summary, /synthetic-secret/);
    if (code === 'files') assert.match(result.summary, /File errors: 1/);
  }
});


test('a stopped batch saves already-filed exact targets without rescheduling', async () => {
  const storage = memoryStorage();
  const result = await executeBarcodeTask(task(false), {
    loadConfig: () => ({ driveFolderId: 'synthetic-folder' }), getAuthToken: async () => 'synthetic-token', lookup, storage,
    processLabels: async options => [
      ...(await scanOne(options)),
      { number: null, error: 'Remote result uncertain; check before repeating [uncertain-write]', errorCode: 'uncertain-write' },
      { number: null, error: 'Not processed: batch stopped', errorCode: 'batch-stopped' },
    ],
    reschedule: async () => assert.fail('stopped batch must not mutate depot'),
  });
  assert.equal(result.status, 'error');
  assert.match(result.summary, /File errors: 2.*uncertain/);
  assert.equal(storage.values[LABEL_RESCHEDULE_RECOVERY_KEY].targets[0].consNumber, '123456789');
});
