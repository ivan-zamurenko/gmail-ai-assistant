import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { executeTask, lookupLabelTarget, projectFindResult } from '../../src/queue/executor.js';
import { prepareDepotArgs } from '../../shared/depotCalendar.js';

const RealDate = Date;
beforeEach(() => { globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : ['2026-11-03T12:00:00Z'])); }
}; });
afterEach(() => { globalThis.Date = RealDate; });

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
    { schemaVersion: TASK_SCHEMA_VERSION, command: 'reschedule', args: {
      mode: 'parcel', conId: '123456789', newDate: '2026-12-29', dryRun: true,
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
    assert.deepEqual(calls[1].args, [prepareDepotArgs({
      dryRun: true,
      mode: 'manual',
      date: newDate,
      targets: [{ consNumber: '123456789', consId: '7654321', type: 'PopUp' }],
    })]);
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
      version: 3,
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
      args: [prepareDepotArgs({ dryRun: true, mode: 'labels', targets: [target], expectedDay: recoveryDay() })],
    }]);
    assert.deepEqual(stored[LABEL_RESCHEDULE_RECOVERY_KEY].targets, [target]);
  } finally {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
  }
});

test('retry storage read crossing Irish midnight cannot promote targets to a new day', async (t) => {
  const originalChrome = globalThis.chrome;
  t.after(() => { globalThis.chrome = originalChrome; });
  const now = '2026-11-03T23:59:59Z';
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } };
  let injections = 0;
  globalThis.chrome = {
    storage: { local: {
      get: async key => {
        globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-11-04T00:00:01Z'])); } };
        return { [key]: { version: 3, runDay: '2026-11-03', targets: [{ consNumber: '123456789', consId: '1001' }] } };
      },
      remove: async () => {},
    } },
    tabs: { query: async () => { injections++; return []; } },
  };
  await executeTask({ schemaVersion: TASK_SCHEMA_VERSION, command: 'reschedule', args: { mode: 'retry', dryRun: false } });
  assert.equal(injections, 0);
});

test('retry task deletes a previous-day batch without reaching the depot', async () => {
  const originalChrome = globalThis.chrome;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const stored = {
    [LABEL_RESCHEDULE_RECOVERY_KEY]: {
      version: 3,
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

test('find injects only the number and never requests a POD photo', async (t) => {
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
  // A photo event must not trigger a provider request in the operator find flow.
  assert.equal(delivered.status, 'done');
  assert.equal(delivered.parcel.pod, undefined);
  assert.equal(delivered.parcel.consNumber, '123456789');
  assert.deepEqual(delivered.parcel.scans, notDelivered.parcel.scans);
  assert.equal(JSON.stringify(delivered).includes('555'), false, 'event id stays local even when POD fails');
  assert.doesNotMatch(JSON.stringify(delivered), /POD (request|authorization)/);
  assert.deepEqual(warnings, [], 'find never requests POD even when a photo event exists');

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
        return [{ result: { dryRun: true, count: 30, eligible: 0, skipped: 30, errors: 0, packages: [], results: Array.from({ length: 30 }, () => ({ consNumber: '123456789', status: 'PENDING', action: 'SKIP', reason: 'No eligible physical parcel in depot; operator review of complete history required' })) } }];
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
  assert.match(result.summary, /Дозволено: 0/);
  assert.match(result.details, /No eligible physical parcel/);
  assert.ok(result.details.length <= 2000, 'details must fit Firestore and Discord limits');
  assert.match(result.details, /ще/);
  assert.equal(result.parcel.rescheduleResults.version, 1);
  assert.equal(result.parcel.rescheduleResults.lines.length, 30);
  assert.deepEqual(injections, [{ name: 'depotMain', args: [prepareDepotArgs({ dryRun: true, mode: 'cad' })] }]);
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
  const geoScans = [
    { parcel:'1', type:'Delivered', coords:{lat:53,lng:-6,token:'PRIVATE_GPS'} },
    { parcel:'2', type:'Carded', coords:{lat:54,lng:-7} },
    { parcel:'1', type:'Goods Held', coords:{lat:53,lng:-6} },
    { parcel:'', type:'Delivered', coords:{lat:53,lng:-6} },
    { parcel:'1', type:'Delivered', coords:{lat:100,lng:-6} },
  ];
  const projected=projectFindResult({...source,scans:geoScans}).parcel.scans;
  assert.deepEqual(projected[0].coords,{lat:53,lng:-6});
  assert.deepEqual(projected[1].coords,{lat:54,lng:-7});
  assert.ok(projected.slice(2).every(scan=>!scan.coords));
  for (const type of ['Failed Delivery', 'Incorrect Address']) {
    const scan = projectFindResult({...source,scans:[{parcel:'1',type,coords:{lat:53,lng:-6}}]}).parcel.scans[0];
    assert.deepEqual(scan.coords,{lat:53,lng:-6});
  }
  assert.equal(projectFindResult({...source,scans:[{parcel:'1',type:'Return to depot',coords:{lat:53,lng:-6}}]}).parcel.scans[0].coords,undefined);

  const oversizedScan = { ...source.scans[0], type: '𠮷'.repeat(24), signature: '𠮷'.repeat(40), route: '𠮷'.repeat(12), date: '𠮷'.repeat(5), time: '𠮷'.repeat(4), parcel: '𠮷'.repeat(3), bay: 'B'.repeat(24), sequence: 'S'.repeat(24), onwardBc: 'O'.repeat(24) };
  const combined = projectFindResult({ ...source, scans: Array(1000).fill(oversizedScan) }, 'A'.repeat(700000));
  assert.equal(combined.status, 'error', 'combined Unicode history and POD must fit serialized byte budget');
  assert.match(combined.summary, /size limit/);
  source = { ...source, scans: Array(1001).fill(oversizedScan) };
  assert.equal((await executeTask(task)).status, 'error', 'oversized history cannot silently lose latest or parcel counts');
});

test('reschedule summaries count needs-review separately from errors', async (t) => {
  const originalChrome = globalThis.chrome;
  const row = (action, reason) => ({ consNumber: '123456789', consId: '7654321', status: 'PENDING', action, reason });
  let response;
  globalThis.chrome = {
    tabs: {
      query: async () => [{ id: 7, url: 'http://synthetic.interlink.local/home' }],
      update: async () => ({}),
    },
    scripting: { executeScript: async () => [{ result: response }] },
  };
  t.after(() => {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
  });
  const results = [
    row('CHANGE_DATE', 'CAD today; parcel remains in depot'),
    row('REVIEW', 'Unknown latest scan; manual review required'),
    row('ERROR', 'Scan history unavailable or malformed'),
  ];

  response = { dryRun: true, count: 3, eligible: 1, changed: 0, skipped: 0, review: 1, errors: 1, results };
  const preview = await executeTask({
    schemaVersion: TASK_SCHEMA_VERSION, command: 'reschedule', args: { mode: 'all', dryRun: true },
  });
  assert.match(preview.summary, /Дозволено: 1 \| Пропущено: 0 \| Перевірка: 1 \| Помилки: 1/);
  assert.match(preview.details, /⚠️ REVIEW/);
  assert.match(preview.details, /❌ ERROR/);

  response = { changed: 1, skipped: 0, review: 1, errors: 1, results };
  const live = await executeTask({
    schemaVersion: TASK_SCHEMA_VERSION, command: 'reschedule', args: { mode: 'all', dryRun: false },
  });
  assert.match(live.summary, /Змінено: 1 \| Пропущено: 0 \| Перевірка: 1 \| Помилки: 1/);
});

test('live CAD never reuses a preview list; a busy tab stops live without trying another tab', async (t) => {
  const originalChrome = globalThis.chrome;
  t.after(() => { globalThis.chrome = originalChrome; });
  const injections = [];
  let busy = false;
  globalThis.chrome = {
    tabs: { query: async () => [1, 2].map(id => ({ id, url: 'http://synthetic.interlink.local/home' })), update: async () => ({}) },
    scripting: { executeScript: async ({ target, args }) => {
      injections.push({ tab: target.tabId, args: args[0] });
      if (busy) return [{ result: { __error: 'Another reschedule is already running in this tab' } }];
      return [{ result: args[0].dryRun
        ? { dryRun: true, count: 1, eligible: 1, skipped: 0, review: 0, errors: 0, changed: 0, results: [{ consNumber: '123456789', consId: '7654321', action: 'CHANGE_DATE' }] }
        : { changed: 1, skipped: 0, review: 0, errors: 0, results: [] } }];
    } },
  };
  const run = dryRun => executeTask({ schemaVersion: TASK_SCHEMA_VERSION, command: 'reschedule', args: { mode: 'all', dryRun } });

  await run(true);
  const live = await run(false);
  assert.equal(live.status, 'done');
  const liveArgs = injections[1].args;
  assert.equal(liveArgs.mode, 'cad');
  assert.equal(liveArgs.dryRun, false);
  assert.deepEqual(liveArgs.targets ?? [], [], 'live re-reads the Pending list instead of applying the preview set');

  injections.length = 0;
  busy = true;
  const blocked = await run(false);
  assert.equal(blocked.status, 'error');
  assert.match(blocked.summary, /already running in this tab/);
  assert.deepEqual(injections.map(i => i.tab), [1], 'a busy tab must not push the live run to another tab');
});

test('parcel: unusable lookups and dates never reach a depot date change (fixed Irish clock)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 4, 12) }); // Wed 4 Nov 2026
  const originalChrome = globalThis.chrome;
  t.after(() => { globalThis.chrome = originalChrome; });
  let lookup;
  const calls = [];
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 7, url: 'http://synthetic.interlink.local/home' }], update: async () => ({}) },
    scripting: { executeScript: async ({ func }) => {
      calls.push(func.name);
      return func.name === 'depotLookup' ? [{ result: [lookup] }] : [{ result: { dryRun: true, count: 1, eligible: 1, results: [] } }];
    } },
  };
  const parcel = (newDate, dryRun = false) => executeTask({ schemaVersion: TASK_SCHEMA_VERSION, command: 'reschedule',
    args: { mode: 'parcel', conId: '123456789', newDate, dryRun } });

  for (const result of [
    { query: '123456789', ok: false, reason: '0 matches' },
    { query: '123456789', ok: false, reason: '3 matches' },
    { query: '123456789', ok: false, reason: 'no scans', consNumber: '123456789', consId: '7654321' },
    { query: '123456789', ok: true, consNumber: '123456789', consId: '' },
  ]) {
    lookup = result;
    calls.length = 0;
    const outcome = await parcel('2026-11-05');
    assert.equal(outcome.status, 'error', JSON.stringify(result));
    assert.deepEqual(calls, ['depotLookup'], `${result.reason ?? 'no consId'} must stop before depotMain`);
  }

  lookup = { query: '123456789', ok: true, consNumber: '123456789', consId: '7654321' };
  for (const [date, message] of [['2026-11-04', /пізніше/], ['2026-11-07', /суботою|неділею/], ['2026-12-25', /святковим/], ['05/11/2026', /YYYY-MM-DD/]]) {
    calls.length = 0;
    const outcome = await parcel(date);
    assert.equal(outcome.status, 'error', date);
    assert.match(outcome.summary, message, date);
    assert.deepEqual(calls, [], `${date} is rejected before any depot access`);
  }

  calls.length = 0;
  const ok = await parcel('2026-11-05', true);
  assert.equal(ok.status, 'done');
  assert.deepEqual(calls, ['depotLookup', 'depotMain']);
});
