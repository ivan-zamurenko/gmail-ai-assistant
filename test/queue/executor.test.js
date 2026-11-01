import test from 'node:test';
import assert from 'node:assert/strict';

import { executeTask, lookupLabelTarget, projectFindResult } from '../../src/queue/executor.js';
import { TASK_SCHEMA_VERSION } from '../../src/queue/contract.js';
import {
  LABEL_RESCHEDULE_RECOVERY_KEY,
  recoveryDay,
} from '../../src/depot/rescheduleRecovery.js';

test('invalid or unversioned tasks cannot reach a depot command', async (t) => {
  const originalChrome = globalThis.chrome;
  let chromeAccesses = 0;
  globalThis.chrome = new Proxy({}, { get() {
    chromeAccesses++;
    throw new Error('Invalid task must not access Chrome');
  } });
  t.after(() => {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
  });
  const tasks = [
    null,
    { schemaVersion: 0 },
    { schemaVersion: 1, command: 'find', args: { conId: '123456789' } },
    { schemaVersion: TASK_SCHEMA_VERSION, command: 'other', args: { mode: 'all', dryRun: false } },
    { schemaVersion: TASK_SCHEMA_VERSION, command: 'find', args: { conId: 'not-a-consignment' } },
    { schemaVersion: TASK_SCHEMA_VERSION, command: 'reschedule', args: { mode: 'unknown', dryRun: true } },
    ...['all', 'parcel', 'retry'].flatMap((mode) =>
      [null, 'false', 0, {}].map((dryRun) => ({
        schemaVersion: TASK_SCHEMA_VERSION, command: 'reschedule', args: { mode, dryRun },
      }))),
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
  assert.equal(chromeAccesses, 0, 'invalid tasks stop before any Chrome API access');
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
      query: async () => [{ id: 7, discarded: false, url: 'http://synthetic.interlink.local/home?session=synthetic' }],
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

test('label target lookup injects identity-only mode', async () => {
  const originalChrome = globalThis.chrome;
  let injection;
  globalThis.chrome = {
    tabs: {
      query: async () => [{ id: 7, discarded: false, url: 'http://synthetic.interlink.local/home?session=synthetic' }],
      update: async () => ({}),
    },
    scripting: {
      executeScript: async (options) => {
        injection = options;
        return [{ result: [{
          ok: true, consNumber: '123456789', consId: '7654321',
        }] }];
      },
    },
  };

  try {
    const response = await lookupLabelTarget('123456789');
    assert.equal(response.result.consId, '7654321');
    assert.deepEqual(injection.args, [['123456789'], { identityOnly: true }]);
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
      query: async () => [{ id: 7, discarded: false, url: 'http://synthetic.interlink.local/home?session=synthetic' }],
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

test('find injects only the number; the POD photo is requested by the extension', async (t) => {
  const warnings = [];
  t.mock.method(globalThis.console, 'warn', (...args) => warnings.push(args));
  const originalChrome = globalThis.chrome;
  const injections = [];
  let podEventId = null;
  globalThis.chrome = {
    tabs: {
      query: async () => [{ id: 7, discarded: false, url: 'http://synthetic.interlink.local/home?session=synthetic' }],
      update: async () => ({}),
    },
    scripting: {
      executeScript: async (options) => {
        injections.push(options.args);
        return [{ result: [{
          ok: true,
          query: '123456789',
          consNumber: '123456789',
          consId: '7654321',
          scans: [{ parcel: '1', type: 'Delivered', date: '01/09/26', time: '10:00', route: 'R1', eventId: '555' }],
          podEventId,
          address: { lines: [] },
        }] }];
      },
    },
  };
  t.after(() => {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
  });
  const task = { schemaVersion: TASK_SCHEMA_VERSION, command: 'find', args: { conId: '123456789' } };

  const notDelivered = await executeTask(task);
  assert.equal(notDelivered.status, 'done');
  assert.equal(notDelivered.parcel.pod, undefined);
  assert.equal(JSON.stringify(notDelivered.parcel).includes('555'), false, 'event id must not leave the extension');

  assert.deepEqual(warnings, [], 'no warning when no POD was expected');
  podEventId = '555';
  const delivered = await executeTask(task);
  // The test network guard (or a missing local podAuth in CI) makes the POD step
  // fail inside the extension; core facts must still reach the renderer.
  assert.equal(delivered.status, 'done');
  assert.equal(delivered.parcel.pod, undefined);
  assert.equal(delivered.parcel.consNumber, '123456789');
  assert.deepEqual(delivered.parcel.scans, notDelivered.parcel.scans);
  assert.equal(JSON.stringify(delivered).includes('555'), false, 'event id stays local even when POD fails');
  assert.doesNotMatch(JSON.stringify(delivered), /POD (request|authorization)/);
  assert.deepEqual(warnings, [['[find] POD_UNAVAILABLE']]);

  assert.deepEqual(injections, [[['123456789']], [['123456789']]]);
});

test('a tab that left the depot after the query is never injected', async (t) => {
  const originalChrome = globalThis.chrome;
  const injectedTabs = [];
  globalThis.chrome = {
    tabs: {
      // Chrome matched both by pattern, but tab 5 navigated away before injection.
      query: async () => [
        { id: 5, discarded: false, url: 'https://www.googleapis.com/' },
        { id: 7, discarded: false, url: 'http://synthetic.interlink.local/home?session=synthetic' },
      ],
      update: async () => ({}),
    },
    scripting: {
      executeScript: async ({ target }) => {
        injectedTabs.push(target.tabId);
        return [{ result: [{ ok: true, consNumber: '123456789', consId: '7654321' }] }];
      },
    },
  };
  t.after(() => {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
  });

  const response = await lookupLabelTarget('123456789');

  assert.equal(response.result.consId, '7654321');
  assert.deepEqual(injectedTabs, [7]);
});

test('all mode defaults an omitted dryRun to a depot preview', async (t) => {
  const originalChrome = globalThis.chrome;
  const injections = [];
  globalThis.chrome = {
    tabs: {
      query: async () => [{ id: 7, url: 'http://synthetic.interlink.local/home' }],
      update: async () => ({}),
    },
    scripting: {
      executeScript: async ({ func, args }) => {
        injections.push({ name: func.name, args });
        return [{ result: { dryRun: true, count: 0, packages: [] } }];
      },
    },
  };
  t.after(() => {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
  });
  const result = await executeTask({
    schemaVersion: TASK_SCHEMA_VERSION, command: 'reschedule', args: { mode: 'all' },
  });
  assert.equal(result.status, 'done');
  assert.deepEqual(injections, [{ name: 'depotMain', args: [{ dryRun: true, mode: 'cad' }] }]);
});

test('live ambiguous injection stops; dry-run and explicit preflight rejection may try another tab', async (t) => {
  const originalChrome = globalThis.chrome;
  t.after(() => { globalThis.chrome = originalChrome; });
  for (const mode of ['throw', 'empty', 'wrong-page', 'preview']) {
    const calls = [];
    globalThis.chrome = {
      tabs: { query: async () => [1, 2].map(id => ({ id, url: 'http://synthetic.interlink.local/home' })), update: async () => ({}) },
      scripting: { executeScript: async ({ target }) => {
        calls.push(target.tabId);
        if (target.tabId === 2) return [{ result: { changed: 1, skipped: 0, errors: 0 } }];
        if (mode === 'throw' || mode === 'preview') throw new Error('synthetic-secret');
        if (mode === 'wrong-page') return [{ result: { __error: 'Not the correct depot page (unexpected origin)' } }];
        return [];
      } },
    };
    const result = await executeTask({ schemaVersion: TASK_SCHEMA_VERSION, command: 'reschedule', args: { mode: 'all', dryRun: mode === 'preview' } });
    if (mode === 'throw' || mode === 'empty') {
      assert.equal(result.status, 'error');
      assert.match(result.summary, /uncertain|не підтверджено/i);
      assert.deepEqual(calls, [1]);
    } else assert.deepEqual(calls, [1, 2]);
  }
});

test('find projection bounds optional values and excludes internal identity metadata', async (t) => {
  const previous = globalThis.chrome;
  let source = { ok: true, consNumber: '123456789', query: '123456789', consId: 'PRIVATE_ID', notes: 'PRIVATE_NOTE', _diag: { token: 'PRIVATE_DIAG' },
    scans: [{ parcel: '1234567', type: 'Received', date: '01/11/2026junk', time: '12:00:00junk', route: 'R1', eventId: 'PRIVATE_EVENT', notes: 'PRIVATE_SCAN' }],
    address: { contact: 'Allowed Recipient', lines: Array(30).fill('A'.repeat(500)), token: 'PRIVATE_ADDRESS' },
    drop: { lat: 53, lng: -6, type: 'Received', date: '01/11/2026', time: '12:00:00', token: 'PRIVATE_DROP' }, timing: { search: 1, detail: 'PRIVATE_TIME', scans: 2 },
  };
  globalThis.chrome = { tabs: { query: async () => [{ id: 7, url: 'http://synthetic.interlink.local/home' }], update: async () => ({}) }, scripting: { executeScript: async () => [{ result: [source] }] } };
  t.after(() => { if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous; });
  const task = { schemaVersion: TASK_SCHEMA_VERSION, command: 'find', args: { conId: '123456789' } };
  const result = await executeTask(task);
  assert.equal(result.status, 'done');
  assert.equal(result.parcel.address.contact, 'Allowed Recipient');
  assert.ok(result.parcel.address.lines.length <= 5);
  assert.equal(result.parcel.address.truncated, true);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
  assert.equal(Object.hasOwn(result.parcel, '_diag'), false);
  assert.equal(result.parcel.scans[0].date, '');
  assert.equal(result.parcel.scans[0].time, '');
  assert.equal(result.parcel.scans[0].parcel, '');
  const oversizedScan = { ...source.scans[0], type: '𠮷'.repeat(24), signature: '𠮷'.repeat(40), route: '𠮷'.repeat(12), date: '𠮷'.repeat(5), time: '𠮷'.repeat(4), parcel: '𠮷'.repeat(3), bay: 'B'.repeat(24), sequence: 'S'.repeat(24), onwardBc: 'O'.repeat(24) };
  const combined = projectFindResult({ ...source, scans: Array(1000).fill(oversizedScan) }, 'A'.repeat(700000));
  assert.equal(combined.status, 'error', 'combined Unicode history and POD must fit serialized byte budget');
  assert.match(combined.summary, /size limit/);
  source = { ...source, scans: Array(1001).fill(oversizedScan) };
  assert.equal((await executeTask(task)).status, 'error', 'oversized history cannot silently lose latest or parcel counts');
});
