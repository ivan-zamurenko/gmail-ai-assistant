import test from 'node:test';
import assert from 'node:assert/strict';

import { depotMain } from '../../src/depot/depotScript.js';

function fakeText(textContent = '') {
  return { textContent };
}

async function runPendingReschedule(mode) {
  const original = new Map();
  for (const key of ['window', 'document', 'DOMParser', 'fetch']) {
    original.set(key, {
      exists: Object.hasOwn(globalThis, key),
      value: globalThis[key],
    });
  }
  const consoleMethods = new Map(
    ['log', 'table', 'warn', 'error'].map((key) => [key, globalThis.console[key]]),
  );
  let pendingReads = 0;

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
      querySelectorAll: (selector) => selector === 'h1 b'
        ? [fakeText('Consignment'), fakeText('PENDING')]
        : [],
      getElementById: () => null,
    },
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
  globalThis.fetch = async (url, options = {}) => {
    let body;
    if (options.method === 'POST' && String(url).endsWith('/save')) body = 'saved';
    else if (String(url).includes('woConsignmentList.p')) {
      pendingReads += 1;
      body = 'pending';
    } else if (String(url).includes('woConsignmentDetails.p')) body = 'detail';
    else if (String(url).includes('woRearrangeConsignment.p')) body = 'form';
    else throw new Error(`Unexpected synthetic request: ${url}`);
    return { ok: true, status: 200, text: async () => body };
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
    return { result, pendingReads };
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
  const cad = await runPendingReschedule('cad');
  const labels = await runPendingReschedule('labels');
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
