import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { depotMain as injectedDepotMain } from '../../src/depot/depotScript.js';

import { prepareDepotArgs, irishDay } from '../../shared/depotCalendar.js';
const depotMain = args => injectedDepotMain(prepareDepotArgs(args));
const RealDate = Date;
beforeEach(() => { globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : ['2026-11-03T12:00:00Z'])); }
}; });
afterEach(() => { globalThis.Date = RealDate; });


function fakeText(textContent = '') {
  return { textContent };
}

async function runReschedule(mode, {
  status = 'PENDING',
  detailNumber = null,
  detailId = null,
  scans = null,
  afterScans = null,
  dryRun = false,
  route = 'cad',
  logCallEnabled = false,
  serialized = false,
  notes = '',
  now = '2026-11-03T12:00:00Z',
  crossMidnight = false,
  saveStatus = 200,
  saveStatuses = null,
  saveConfirmation = 'success',
  targets = null,
  requestedDate = '',
  formAction = '/save',
  fetchError = null,
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
  const diagnostics = [];
  let pendingReads = 0;
  let currentConsId = '7654321';
  let scanReads = 0;
  let logWrites = 0;
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
            querySelectorAll: () => [fakeText(''), { querySelector: () => link }, fakeText(route)],
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
      getElementById: id => {
        const targetNumber = targets?.find(target => target.consId === currentConsId)?.consNumber ?? '123456789';
        if (id === 'hiddenConsBarcodeValue') return { value: detailNumber ?? targetNumber.replace(/^0(?=\d{8}$)/, '') };
        if (id === 'hiddenConsIdValue') return { value: detailId ?? currentConsId };
        return id === 'btnLogCall' && logCallEnabled ? { closest: () => ({ getAttribute: () => '/log', elements: [] }) } : null;
      },
      querySelector: () => null,
    },
    notes: { body: fakeText(notes), querySelectorAll: () => [] },
    scans: {
      getElementById: id => id === 'MAINTABLE' ? {} : null,
      querySelectorAll: () => {
        const day = irishDay(new RealDate(now)).split('-').reverse().join('/');
        const history = (scanReads > 1 && afterScans) || scans || [{ parcel: '1', type: 'CAD scan', date: day, time: '09:00:00' }];
        return history.map(scan => ({ querySelectorAll: () => Array.from({ length: 12 }, (_, i) => ({
          textContent: ({ 1: scan.route ?? 'cad', 3: scan.type, 4: `${scan.date} ${scan.time}`, 7: scan.parcel })[i] ?? '',
          getAttribute: () => null,
        })) }));
      },
    },
    form: {
      querySelector: (selector) => selector === 'form'
        ? { getAttribute: () => formAction, elements: [] }
        : null,
      body: fakeText(),
    },
    saved: {
      querySelector(selector) {
        if (saveConfirmation === 'success' && selector.includes('panel-success')) {
          return fakeText('Saved');
        }
        return null;
      },
      querySelectorAll: () => [],
      body: fakeText('Synthetic response without confirmation'),
    },
  };

  globalThis.window = {
    location: {
      href: 'http://synthetic.interlink.local/home?session=synthetic&UID=synthetic',
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
    if (fetchError) throw new Error(fetchError);
    let body;
    let responseStatus = 200;
    if (String(url).endsWith('/log')) { logWrites++; body = 'saved'; }
    else if (String(url).includes('woScanningHistoryList.p')) { scanReads++; body = 'scans'; }
    else if (options.method === 'POST' && String(url).endsWith('/save')) {
      saveWrites += 1;
      saveBody = options.body;
      responseStatus = saveStatuses?.[saveWrites - 1] ?? saveStatus;
      body = 'saved';
    }
    else if (String(url).includes('woConsignmentList.p')) {
      pendingReads += 1;
      body = 'pending';
    } else if (String(url).includes('woConsignmentDetails.p')) {
      currentConsId = new globalThis.URL(url).searchParams.get('ConsId'); body = 'detail';
    }
    else if (String(url).endsWith('/notes')) body = 'notes';
    else if (String(url).includes('woRearrangeConsignment.p')) {
      rescheduleReads += 1;
      if (crossMidnight) now = '2026-11-04T00:00:00Z';
      body = 'form';
    }
    else throw new Error(`Unexpected synthetic request: ${url}`);
    return {
      ok: responseStatus >= 200 && responseStatus < 300,
      status: responseStatus,
      text: async () => body,
    };
  };
  for (const key of consoleMethods.keys()) globalThis.console[key] = (...args) => diagnostics.push(args);

  try {
    const run = serialized ? vm.runInNewContext(`(${injectedDepotMain.toString()})`, {
      Date: globalThis.Date, Intl, URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams,
      window: globalThis.window, document: globalThis.document, DOMParser: globalThis.DOMParser, fetch: globalThis.fetch, console: globalThis.console,
    }) : injectedDepotMain;
    const result = await run(prepareDepotArgs({
      dryRun,
      mode,
      date: requestedDate,
      targets: mode !== 'cad'
        ? (targets ?? [{ consNumber: '123456789', consId: '7654321', type: 'PopUp' }])
        : [],
    }));
    return { result, pendingReads, rescheduleReads, saveWrites, saveBody, diagnostics, logWrites, scanReads };
  } finally {
    for (const [key, state] of original) {
      if (state.exists) globalThis[key] = state.value;
      else delete globalThis[key];
    }
    for (const [key, value] of consoleMethods) globalThis.console[key] = value;
  }
}

// Injected scripts check the page they run on; dry-run cases still need a depot page.
async function onDepotPage(run) {
  const had = Object.hasOwn(globalThis, 'window');
  const previous = globalThis.window;
  globalThis.window = {
    location: {
      href: 'http://synthetic.interlink.local/home?session=synthetic&UID=synthetic',
      search: '?session=synthetic&UID=synthetic',
    },
  };
  try {
    return await run();
  } finally {
    if (had) globalThis.window = previous;
    else delete globalThis.window;
  }
}

test('label dry-run verifies policy without reading Pending List or writing', async () => {
  const preview = await runReschedule('labels', { dryRun: true, serialized: true,
    targets: [{ consNumber: '012345678', consId: '7654321' }, { consNumber: '012345678', consId: '7654321' }],
  });
  assert.equal(preview.result.count, 1);
  assert.equal(preview.result.eligible, 1);
  assert.equal(preview.result.results[0].reason, 'CAD today; parcel remains in depot');
  assert.equal(preview.result.date, '04/11/2026');
  assert.equal(preview.result.calendarVersion, 'IE-BPFI-2026-2027-v1');
  assert.equal(preview.pendingReads, 0);
  assert.equal(preview.scanReads, 1);
  assert.equal(preview.saveWrites, 0);
  assert.equal(preview.logWrites, 0);
});

test('invalid exact label targets are rejected before depot access', async () => {
  const original = {
    log: globalThis.console.log,
    warn: globalThis.console.warn,
  };
  globalThis.console.log = () => {};
  globalThis.console.warn = () => {};

  try {
    const result = await onDepotPage(() => depotMain({
      dryRun: true,
      mode: 'labels',
      targets: [
        { consNumber: 'not-nine-digits', consId: '7654321' },
        { consNumber: '123456789', consId: 'not-numeric' },
      ],
    }));

    assert.deepEqual(result, {
      changed: 0,
      skipped: 0,
      errors: 0,
      warning: 'No exact verified label targets were supplied.',
    });
  } finally {
    globalThis.console.log = original.log;
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
      reason: 'CAD today; parcel remains in depot',
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
      reason: 'No confirmed delivery-date change to today',
    }],
  });
  assert.equal(labels.pendingReads, 0);
  assert.equal(labels.rescheduleReads, 0);
});

test('GOODS HELD with today qualifying note reaches reschedule once', async () => {
  const today = '03/11/26';
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
    now: '2026-08-28T12:00:00Z',
  });
  const submitted = new globalThis.URLSearchParams(labels.saveBody);

  assert.equal(labels.result.changed, 1);
  assert.equal(submitted.get('arranged-date'), '31/08/2026');
});

test('reschedule skips an Irish bank holiday', async () => {
  const labels = await runReschedule('labels', {
    now: '2026-03-16T12:00:00Z',
  });
  const submitted = new globalThis.URLSearchParams(labels.saveBody);

  assert.equal(labels.result.changed, 1);
  assert.equal(submitted.get('arranged-date'), '18/03/2026');
});

test('manual reschedule submits the exact operator-selected date', async () => {
  const manual = await runReschedule('manual', {
    now: '2026-09-01T12:00:00Z',
    requestedDate: '2026-09-03',
  });
  const submitted = new globalThis.URLSearchParams(manual.saveBody);

  assert.equal(manual.result.changed, 1);
  assert.equal(submitted.get('arranged-date'), '03/09/2026');
});

test('failed reschedule POST is reported as an error, never changed', async () => {
  const labels = await runReschedule('labels', { saveStatus: 500 });

  assert.equal(labels.saveWrites, 1);
  assert.equal(labels.result.changed, 0);
  assert.equal(labels.result.errors, 1);
  assert.equal(labels.result.results[0].action, 'ERROR');
});

test('unconfirmed HTTP 200 reschedule is reported as an error', async () => {
  const labels = await runReschedule('labels', {
    saveConfirmation: 'none',
  });

  assert.equal(labels.saveWrites, 1);
  assert.equal(labels.result.changed, 0);
  assert.equal(labels.result.errors, 1);
  assert.equal(labels.result.results[0].action, 'ERROR');
});

test('one failed parcel does not stop the next parcel in the batch', async () => {
  const labels = await runReschedule('labels', {
    saveStatuses: [500, 200],
    targets: [
      { consNumber: '123456789', consId: '7654321', type: 'PopUp' },
      { consNumber: '987654321', consId: '1234567', type: 'PopUp' },
    ],
  });

  assert.equal(labels.saveWrites, 2);
  assert.equal(labels.result.changed, 1);
  assert.equal(labels.result.errors, 1);
  assert.deepEqual(labels.result.results.map(({ consNumber, action }) => ({ consNumber, action })), [
    { consNumber: '123456789', action: 'ERROR' },
    { consNumber: '987654321', action: 'CHANGE_DATE' },
  ]);
});

test('reschedule refuses a cross-origin form action before posting session fields', async () => {
  const { result, saveWrites } = await runReschedule('labels', {
    formAction: 'http://evil.invalid/save',
  });

  assert.equal(saveWrites, 0);
  assert.equal(result.changed, 0);
  assert.equal(result.errors, 1);
});


test('depot diagnostics omit parcel identities and provider bodies while retaining failure', async () => {
  const success = await runReschedule('labels');
  assert.equal(success.result.changed, 1);
  assert.doesNotMatch(JSON.stringify(success.diagnostics), /123456789|7654321/);
  const failure = await runReschedule('labels', { fetchError: '<html>synthetic-secret Bearer synthetic-token</html>' });
  assert.equal(failure.result.errors, 1);
  assert.doesNotMatch(JSON.stringify(failure), /synthetic-secret|synthetic-token|<html>/);
  assert.match(JSON.stringify(failure.diagnostics), /Reschedule failed/);
});

test('Irish midnight during form loading prevents the subsequent save', async () => {
  const labels = await runReschedule('labels', { crossMidnight: true });
  assert.equal(labels.rescheduleReads, 1);
  assert.equal(labels.saveWrites, 0);
  assert.equal(labels.result.changed, 0);
  assert.equal(labels.result.errors, 1);
  assert.match(JSON.stringify(labels.diagnostics), /Calendar plan expired/);
});

const scan = (parcel, type, time = '09:00:00', date = '03/11/2026') => ({ parcel, type, time, date });

test('parcel histories decide series eligibility, never route or aggregate status alone', async () => {
  const cases = [
    ['PENDING', [scan('1', 'CAD scan')], true],
    ['  pending ', [scan('1', '  cad-SCAN  ')], true],
    ['PENDING', [scan('1', 'CAD scan', '09:00:00', '02/11/2026')], false],
    ['PENDING', [scan('1', 'Delivered')], false],
    ['PENDING', [scan('1', 'CAD scan'), scan('1', 'Out for delivery', '10:00:00')], false],
    ['OFD', [scan('1', 'CAD scan'), scan('1', 'Delivered', '10:00:00')], false],
    ['DELIVERED', [scan('1', 'Delivered'), scan('2', 'Delivered'), scan('3', 'CAD scan')], true],
    ['OFD', [scan('1', 'Out for delivery'), scan('2', 'CAD scan')], true],
    ['UNKNOWN', [scan('1', 'CAD scan')], false],
    ['PENDING', [scan('1', 'Cancelled out for delivery')], true],
    ['PENDING', [scan('1', 'Return to depot', '08:00:00'), scan('1', 'Cancelled out for delivery')], false],
    ['PENDING', [scan('1', 'Cancelled out for delivery'), scan('1', 'Returned to depot', '10:00:00')], false],
    ['PENDING', [scan('1', 'Cancelled out for delivery'), scan('2', 'Return to depot')], true],
    ['PENDING', [scan('1', 'Cancelled out for delivery'), scan('1', 'Delivered', '10:00:00')], false],
  ];
  for (const [status, scans, allowed] of cases) {
    const result = await runReschedule('labels', { status, scans, logCallEnabled: true });
    assert.equal(result.saveWrites, Number(allowed), JSON.stringify({ status, scans }));
    assert.equal(result.logWrites, 0, 'reschedule must not call Log Call');
    assert.ok(result.result.results[0].reason);
  }
  const all = await runReschedule('cad', { route: 'other', scans: [scan('1', 'Cancelled out for delivery')] });
  assert.equal(all.saveWrites, 1, 'all must evaluate non-CAD candidates too');
});

test('Goods Held requires an exact non-negated valid note TO today, with no CAD requirement', async () => {
  for (const [notes, allowed] of [
    ['Del. date changed FROM 01/01/20 TO 03/11/26', true],
    ['del.  date changed FROM 01/01/2020 TO 03/11/2026', true],
    ['NOT Del. date changed FROM 01/01/20 TO 03/11/26', false],
    ['Del. date changed FROM 31/02/26 TO 03/11/26', false],
    ['Del. date changed FROM 01/01/20 TO 03/11/2600', false],
    ['Del. date changed FROM 01/01/20 TO 04/11/26', false],
  ]) {
    const result = await runReschedule('labels', { status: 'GOODS HELD', notes, scans: [], logCallEnabled: true });
    assert.equal(result.saveWrites, Number(allowed), notes);
    assert.equal(result.logWrites, 0, 'reschedule must not call Log Call');
  }
});

test('missing or conflicting scan evidence refuses writes; changed evidence is checked before save', async () => {
  for (const scans of [[scan('1', 'New unknown depot event')], [], [scan('', 'CAD scan')], [scan('1', 'CAD scan', '25:00:00')],
    [scan('1', 'CAD scan', '09:00:00', '31/02/2026')],
    [scan('1', 'CAD scan'), scan('1', 'Delivered')],
    [scan('1', 'CAD scan'), scan('', 'Delivered', '10:00:00')],
  ]) {
    const result = await runReschedule('labels', { scans, logCallEnabled: true });
    assert.equal(result.saveWrites, 0);
    assert.equal(result.logWrites, 0);
    assert.equal(result.result.results[0].action, 'ERROR', 'ambiguous evidence remains recoverable for review');
  }
  for (const identity of [{ detailNumber: '987654321' }, { detailId: '999' }, { detailNumber: '' }]) {
    const mismatched = await runReschedule('labels', { ...identity, logCallEnabled: true });
    assert.equal(mismatched.saveWrites, 0);
    assert.equal(mismatched.logWrites, 0);
    assert.equal(mismatched.scanReads, 0);
  }
  const changed = await runReschedule('labels', {
    scans: [scan('1', 'CAD scan')], afterScans: [scan('1', 'CAD scan'), scan('1', 'Delivered', '10:00:00')],
  });
  assert.equal(changed.saveWrites, 0);
  assert.equal(changed.result.errors, 1);
});
