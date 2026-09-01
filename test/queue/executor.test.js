import test from 'node:test';
import assert from 'node:assert/strict';

import { executeTask } from '../../src/queue/executor.js';

test('invalid or unversioned tasks cannot reach a depot command', async () => {
  const tasks = [
    null,
    { schemaVersion: 0 },
    { schemaVersion: 1, command: 'other', args: { mode: 'all', dryRun: false } },
    { schemaVersion: 1, command: 'find', args: { conId: 'not-a-consignment' } },
    { schemaVersion: 1, command: 'reschedule', args: {
      mode: 'parcel', conId: '12345678', newDate: '2099-09-03', dryRun: true,
    } },
    { schemaVersion: 1, command: 'reschedule', args: {
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
      schemaVersion: 1,
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
