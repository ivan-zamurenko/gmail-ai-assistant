import test from 'node:test';
import assert from 'node:assert/strict';

import { executeTask } from '../../src/queue/executor.js';
import { TASK_SCHEMA_VERSION } from '../../src/queue/contract.js';
import {
  LABEL_RESCHEDULE_RECOVERY_KEY,
  recoveryDay,
} from '../../src/depot/rescheduleRecovery.js';

test('invalid or unversioned tasks cannot reach a depot command', async () => {
  const tasks = [
    null,
    { schemaVersion: 0 },
    { schemaVersion: 1, command: 'find', args: { conId: '123456789' } },
    { schemaVersion: TASK_SCHEMA_VERSION, command: 'other', args: { mode: 'all', dryRun: false } },
    { schemaVersion: TASK_SCHEMA_VERSION, command: 'find', args: { conId: 'not-a-consignment' } },
    { schemaVersion: TASK_SCHEMA_VERSION, command: 'reschedule', args: {
      mode: 'parcel', conId: '12345678', newDate: '2099-09-03', dryRun: true,
    } },
    { schemaVersion: TASK_SCHEMA_VERSION, command: 'reschedule', args: {
      mode: 'parcel', conId: '123456789', newDate: 'not-a-date', dryRun: true,
    } },
  ];
  for (const task of tasks) {
    assert.equal((await executeTask(task)).status, 'error');
  }
});

test('manual parcel task resolves one exact target before depot dry-run', async () => {
  const originalChrome = globalThis.chrome;
  const calls = [];
  const selected = new Date();
  do selected.setDate(selected.getDate() + 1);
  while (selected.getDay() === 0 || selected.getDay() === 6);
  const newDate = [
    selected.getFullYear(),
    String(selected.getMonth() + 1).padStart(2, '0'),
    String(selected.getDate()).padStart(2, '0'),
  ].join('-');

  globalThis.chrome = {
    tabs: {
      query: async () => [{ id: 7, discarded: false }],
      update: async () => ({}),
    },
    scripting: {
      executeScript: async ({ func, args }) => {
        calls.push({ name: func.name, args });
        if (func.name === 'depotLookup') {
          return [{ result: [{
            ok: true,
            consNumber: '123456789',
            consId: '7654321',
          }] }];
        }
        return [{ result: {
          dryRun: true,
          count: 1,
          packages: [{ consNumber: '123456789', consId: '7654321' }],
        } }];
      },
    },
  };

  try {
    const result = await executeTask({
      schemaVersion: TASK_SCHEMA_VERSION,
      command: 'reschedule',
      args: { mode: 'parcel', conId: '123456789', newDate, dryRun: true },
    });

    assert.equal(result.status, 'done');
    assert.deepEqual(calls.map((call) => call.name), ['depotLookup', 'depotMain']);
    assert.deepEqual(calls[1].args, [{
      dryRun: true,
      mode: 'manual',
      date: newDate,
      targets: [{ consNumber: '123456789', consId: '7654321', type: 'PopUp' }],
    }]);
  } finally {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
  }
});

test('retry task uses only today saved exact targets without Drive or barcode lookup', async () => {
  const originalChrome = globalThis.chrome;
  const calls = [];
  const target = { consNumber: '123456789', consId: '7654321', type: 'PopUp' };
  const stored = {
    [LABEL_RESCHEDULE_RECOVERY_KEY]: {
      version: 2,
      runDay: recoveryDay(),
      updatedAt: new Date().toISOString(),
      targets: [target],
    },
  };

  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: stored[key] }),
        set: async (entries) => Object.assign(stored, entries),
        remove: async (key) => { delete stored[key]; },
      },
    },
    tabs: {
      query: async () => [{ id: 7, discarded: false }],
      update: async () => ({}),
    },
    scripting: {
      executeScript: async ({ func, args }) => {
        calls.push({ name: func.name, args });
        return [{ result: {
          dryRun: true,
          count: 1,
          packages: [{ consNumber: target.consNumber, consId: target.consId }],
        } }];
      },
    },
  };

  try {
    const result = await executeTask({
      schemaVersion: TASK_SCHEMA_VERSION,
      command: 'reschedule',
      args: { mode: 'retry', dryRun: true },
    });

    assert.equal(result.status, 'done');
    assert.deepEqual(calls, [{
      name: 'depotMain',
      args: [{ dryRun: true, mode: 'labels', targets: [target] }],
    }]);
    assert.deepEqual(stored[LABEL_RESCHEDULE_RECOVERY_KEY].targets, [target]);
  } finally {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
  }
});

test('retry task deletes a previous-day batch without reaching the depot', async () => {
  const originalChrome = globalThis.chrome;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const stored = {
    [LABEL_RESCHEDULE_RECOVERY_KEY]: {
      version: 2,
      runDay: recoveryDay(yesterday),
      updatedAt: yesterday.toISOString(),
      targets: [{ consNumber: '123456789', consId: '7654321', type: 'PopUp' }],
    },
  };

  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: stored[key] }),
        set: async (entries) => Object.assign(stored, entries),
        remove: async (key) => { delete stored[key]; },
      },
    },
    tabs: {
      query: async () => { throw new Error('Stale retry must not query depot tabs'); },
    },
  };

  try {
    const result = await executeTask({
      schemaVersion: TASK_SCHEMA_VERSION,
      command: 'reschedule',
      args: { mode: 'retry', dryRun: false },
    });

    assert.equal(result.status, 'done');
    assert.match(result.summary, /Немає server errors/);
    assert.equal(stored[LABEL_RESCHEDULE_RECOVERY_KEY], undefined);
  } finally {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
  }
});
