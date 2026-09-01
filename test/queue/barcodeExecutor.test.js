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
  const result = await executeBarcodeTask(task(true), {
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
});
