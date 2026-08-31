import test from 'node:test';
import assert from 'node:assert/strict';

import { depotMain } from '../../src/depot/depotScript.js';

function fakeText(textContent = '') {
  return { textContent };
}

async function runReschedule(mode, {
  status = 'PENDING',
  notes = '',
  now = null,
  saveStatus = 200,
} = {}) {
  const original = new Map();
  for (const key of ['window', 'document', 'DOMParser', 'fetch', 'Date']) {
    original.set(key, {
      exists: Object.hasOwn(globalThis, key),
      value: globalThis[key],
    });
  }
  const consoleMethods = new Map(
    ['log', 'table', 'warn', 'error'].map((key) => [key, globalThis.console[key]]),
  );
  let pendingReads = 0;
  let rescheduleReads = 0;
  let saveWrites = 0;
  let saveBody = '';

  const link = {
    textContent: '123456789',
    getAttribute: () => "javascript:chooseItem('7654321', 'PopUp')",
  };
  const documents = {
    pending: {
      querySelectorAll(selector) {
        if (selector === 'thead th, thead td') {
          return [fakeText(''), fakeText('Consignment'), fakeText('Route')];
        }
        if (selector === 'tbody tr') {
          return [{
            querySelectorAll: () => [fakeText(''), { querySelector: () => link }, fakeText('cad')],
          }];
        }
        return [];
      },
    },
    detail: {
      querySelectorAll(selector) {
        if (selector === 'h1 b') return [fakeText('Consignment'), fakeText(status)];
        if (selector === 'script' && notes) {
          return [fakeText("$('#ConsignmentsNotes').load('/notes')")];
        }
        return [];
      },
      getElementById: () => null,
    },
    notes: { body: fakeText(notes) },
    form: {
      querySelector: (selector) => selector === 'form'
        ? { getAttribute: () => '/save', elements: [] }
        : null,
      body: fakeText(),
    },
    saved: {
      querySelector(selector) {
        if (selector.includes('panel-success')) return fakeText('Saved');
        return null;
      },
    },
  };

  globalThis.window = {
    location: {
      href: 'https://depot.invalid/home?session=synthetic&UID=synthetic',
      search: '?session=synthetic&UID=synthetic',
    },
  };
  globalThis.document = {
    querySelector: () => ({
      getAttribute: () => "javascript:CL('123', 'P')",
    }),
  };
  globalThis.DOMParser = class {
    parseFromString(name) {
      return documents[name];
    }
  };
  if (now) {
    const RealDate = original.get('Date').value;
    globalThis.Date = class extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [now]));
      }
    };
  }
  globalThis.fetch = async (url, options = {}) => {
    let body;
    let responseStatus = 200;
    if (options.method === 'POST' && String(url).endsWith('/save')) {
      saveWrites += 1;
      saveBody = options.body;
      responseStatus = saveStatus;
      body = 'saved';
    }
    else if (String(url).includes('woConsignmentList.p')) {
      pendingReads += 1;
      body = 'pending';
    } else if (String(url).includes('woConsignmentDetails.p')) body = 'detail';
    else if (String(url).endsWith('/notes')) body = 'notes';
    else if (String(url).includes('woRearrangeConsignment.p')) {
      rescheduleReads += 1;
      body = 'form';
    }
    else throw new Error(`Unexpected synthetic request: ${url}`);
    return {
      ok: responseStatus >= 200 && responseStatus < 300,
      status: responseStatus,
      text: async () => body,
    };
  };
  for (const key of consoleMethods.keys()) globalThis.console[key] = () => {};

  try {
    const result = await depotMain({
      dryRun: false,
      mode,
      targets: mode === 'labels'
        ? [{ consNumber: '123456789', consId: '7654321', type: 'PopUp' }]
        : [],
    });
    return { result, pendingReads, rescheduleReads, saveWrites, saveBody };
  } finally {
    for (const [key, state] of original) {
      if (state.exists) globalThis[key] = state.value;
      else delete globalThis[key];
    }
    for (const [key, value] of consoleMethods) globalThis.console[key] = value;
  }
}

test('label dry-run uses exact verified targets without reading Pending List', async () => {
  const original = {
    log: globalThis.console.log,
    table: globalThis.console.table,
    warn: globalThis.console.warn,
  };
  globalThis.console.log = () => {};
  globalThis.console.table = () => {};
  globalThis.console.warn = () => {};

  try {
    const result = await depotMain({
      dryRun: true,
      mode: 'labels',
      targets: [
        { consNumber: '123456789', consId: '7654321', type: 'PopUp' },
        // Duplicate target must not schedule the same internal consignment twice.
        { consNumber: '123456789', consId: '7654321', type: 'PopUp' },
      ],
    });

    assert.deepEqual(result, {
      dryRun: true,
      count: 1,
      packages: [{ consNumber: '123456789', consId: '7654321' }],
    });
  } finally {
    globalThis.console.log = original.log;
    globalThis.console.table = original.table;
    globalThis.console.warn = original.warn;
  }
});

test('CAD and label targets share the same PENDING reschedule rules', async () => {
  const cad = await runReschedule('cad');
  const labels = await runReschedule('labels');
  const expected = {
    changed: 1,
    skipped: 0,
    errors: 0,
    results: [{
      consNumber: '123456789',
      consId: '7654321',
      status: 'PENDING',
      action: 'CHANGE_DATE',
    }],
  };

  assert.deepEqual(cad.result, expected);
  assert.deepEqual(labels.result, expected);
  assert.equal(cad.pendingReads, 1);
  assert.equal(labels.pendingReads, 0);
});

test('GOODS HELD without qualifying notes never reaches reschedule', async () => {
  const labels = await runReschedule('labels', { status: 'GOODS HELD' });

  assert.deepEqual(labels.result, {
    changed: 0,
    skipped: 1,
    errors: 0,
    results: [{
      consNumber: '123456789',
      consId: '7654321',
      status: 'GOODS HELD',
      action: 'SKIP',
    }],
  });
  assert.equal(labels.pendingReads, 0);
  assert.equal(labels.rescheduleReads, 0);
});

test('GOODS HELD with today qualifying note reaches reschedule once', async () => {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, '0');
  const today = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(-2)}`;
  const labels = await runReschedule('labels', {
    status: 'GOODS HELD',
    notes: `Del. date changed FROM 01/01/20 TO ${today}`,
  });

  assert.equal(labels.result.changed, 1);
  assert.equal(labels.result.skipped, 0);
  assert.equal(labels.result.errors, 0);
  assert.equal(labels.result.results[0].action, 'CHANGE_DATE');
  assert.equal(labels.rescheduleReads, 1);
});

test('Friday reschedule submits the following Monday', async () => {
  const labels = await runReschedule('labels', {
    now: '2026-08-28T12:00:00',
  });
  const submitted = new globalThis.URLSearchParams(labels.saveBody);

  assert.equal(labels.result.changed, 1);
  assert.equal(submitted.get('arranged-date'), '31/08/2026');
});

test('reschedule skips an Irish bank holiday', async () => {
  const labels = await runReschedule('labels', {
    now: '2026-03-16T12:00:00',
  });
  const submitted = new globalThis.URLSearchParams(labels.saveBody);

  assert.equal(labels.result.changed, 1);
  assert.equal(submitted.get('arranged-date'), '18/03/2026');
});

test('failed reschedule POST is reported as an error, never changed', async () => {
  const labels = await runReschedule('labels', { saveStatus: 500 });

  assert.equal(labels.saveWrites, 1);
  assert.equal(labels.result.changed, 0);
  assert.equal(labels.result.errors, 1);
  assert.equal(labels.result.results[0].action, 'ERROR');
});
