import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { depotMain as injectedDepotMain } from '../../src/depot/depotScript.js';

import { prepareDepotArgs, irishDay } from '../../shared/depotCalendar.js';
import { remainingRecoveryTargets } from '../../src/depot/rescheduleRecovery.js';
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
  realNotesPage = false,
  now = '2026-11-03T12:00:00Z',
  crossMidnight = false,
  saveStatus = 200,
  saveStatuses = null,
  saveConfirmation = 'success',
  targets = null,
  requestedDate = '',
  formAction = '/save',
  fetchError = null,
  formFields = [],
  postThrows = false,
  busy = false,
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
          // Real depot page (2026-11-06): URL built in a variable, then .load(urlConNotes).
          return [fakeText(realNotesPage
            ? "var my_num = Math.random(); var consReq = '4688011'; var urlConNotes = '/scripts/cgiip.exe/WService=wsInterlink/woConsignmentsNotes.p?session=S&ConsId=' + consReq + '&rnd=' + my_num + '&UID=U'; $(\"#ConsignmentsNotes\").load(urlConNotes);"
            : "$('#ConsignmentsNotes').load('/notes')")];
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
    notes: { body: fakeText(notes), querySelectorAll: selector => (realNotesPage && selector === '.form-row' ? [fakeText(notes)] : []) },
    scans: {
      getElementById: id => id === 'MAINTABLE' ? {} : null,
      querySelectorAll: () => {
        const day = irishDay(new RealDate(now)).split('-').reverse().join('/');
        const history = (scanReads > 1 && afterScans) || scans || [{ parcel: '1', type: 'CAD scan', date: day, time: '09:00:00' }];
        return history.map(scan => ({ querySelectorAll: () => Array.from({ length: 12 }, (_, i) => ({
          textContent: ({ 1: scan.route ?? 'cad', 3: scan.type, 4: scan.dateTimeText ?? `${scan.date} ${scan.time}`, 7: scan.parcel })[i] ?? '',
          getAttribute: () => null,
        })) }));
      },
    },
    form: {
      querySelector: (selector) => selector === 'form'
        ? { getAttribute: () => formAction, elements: formFields }
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
  if (busy) globalThis.window.__dpdAssistanceRescheduleLock = true;
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
      // The request left the browser; only the response is lost.
      if (postThrows) throw new TypeError('Failed to fetch');
      responseStatus = saveStatuses?.[saveWrites - 1] ?? saveStatus;
      body = 'saved';
    }
    else if (String(url).includes('woConsignmentList.p')) {
      pendingReads += 1;
      body = 'pending';
    } else if (String(url).includes('woConsignmentDetails.p')) {
      currentConsId = new globalThis.URL(url).searchParams.get('ConsId'); body = 'detail';
    }
    else if (String(url).endsWith('/notes') || String(url).includes('woConsignmentsNotes.p?session=S&ConsId=4688011&rnd=')) body = 'notes';
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
    const lockAfter = globalThis.window.__dpdAssistanceRescheduleLock ?? false;
    return { result, pendingReads, rescheduleReads, saveWrites, saveBody, diagnostics, logWrites, scanReads, lockAfter };
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
    review: 0,
    errors: 0,
    results: [{
      consNumber: '123456789',
      consId: '7654321',
      status: 'PENDING',
      action: 'CHANGE_DATE',
      reason: 'CAD today; parcel remains in depot',
      checkedAt: '2026-11-03T12:00:00.000Z',
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
    review: 0,
    errors: 0,
    results: [{
      consNumber: '123456789',
      consId: '7654321',
      status: 'GOODS HELD',
      action: 'SKIP',
      reason: 'No confirmed delivery-date change to today',
      checkedAt: '2026-11-03T12:00:00.000Z',
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


test('depot diagnostics show ordered progress with approved con_id, no private fields or false success', async () => {
  const success = await runReschedule('labels', { serialized: true });
  assert.equal(success.result.changed, 1);
  const lines = success.diagnostics.map(args => args.join(' '));
  const log = lines.join('\n');
  assert.match(log, /\[DPD reschedule\] START.*LIVE/);
  assert.match(log, /TARGETS.*1/);
  let previous = -1;
  for (const phase of ['CHECK', 'FORM', 'RECHECK', 'SAVE', 'SAVED']) {
    const index = lines.findIndex(line => line.includes(`[1/1] ${phase} |`));
    assert.ok(index > previous, `${phase} must occur in order`);
    previous = index;
  }
  assert.match(log, /DONE.*Changed: 1/);
  assert.match(log, /123456789 → ✅ Перенесено/);
  assert.doesNotMatch(log, /7654321|session=|ConsId=/);
  const preview = await runReschedule('labels', { dryRun: true });
  const previewLog = JSON.stringify(preview.diagnostics);
  assert.match(previewLog, /WOULD_CHANGE.*123456789 → 🔎 Буде перенесено/);
  assert.doesNotMatch(previewLog, /\[1\/1\] (?:FORM|RECHECK|SAVE|SAVED) \|/);
  assert.match(previewLog, /DONE.*Eligible: 1.*Changed: 0/);
  const skipped = await runReschedule('labels', { status: 'GOODS HELD' });
  assert.match(JSON.stringify(skipped.diagnostics), /SKIPPED.*123456789 → ⏭️ Пропущено.*No confirmed delivery-date change/);
  const review = await runReschedule('labels', { status: 'SYNTHETIC_PRIVATE_STATUS' });
  assert.match(JSON.stringify(review.diagnostics), /REVIEW/);
  assert.doesNotMatch(JSON.stringify(review.diagnostics), /SYNTHETIC_PRIVATE_STATUS/);
  const rejected = await runReschedule('labels', { saveStatus: 500 });
  assert.match(JSON.stringify(rejected.diagnostics), /\[1\/1\] ERROR.*123456789 → ❌ Помилка/);
  assert.doesNotMatch(JSON.stringify(rejected.diagnostics), /\[1\/1\] SAVED/);
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
    ['PENDING', [scan('1', 'NearRoute')], true],
    ['PENDING', [scan('1', 'CAD scan', '03:07:44'), { ...scan('1', 'Nearest Route assigned', '09:30:38'), route: 'NearRoute' }], true],
    ['PENDING', [{ ...scan('1', 'Nearest Route assigned'), route: ' nearroute ' }], true],
    ['PENDING', [{ ...scan('1', 'Nearest Route assigned', '09:00:00', '02/11/2026'), route: 'NearRoute' }], false],
    ['PENDING', [{ ...scan('1', 'Nearest Route assigned'), route: 'NearRoute' }, scan('1', 'Out for delivery', '10:00:00')], false],
    ['PENDING', [{ ...scan('1', 'Delivered'), route: 'NearRoute' }], false],
    ['PENDING', [{ ...scan('1', 'Out for delivery'), route: 'NearRoute' }], false],
    ['PENDING', [{ ...scan('1', 'Nearest Route assigned'), route: 'other' }], false],
    ['OFD', [scan('1', 'Out for delivery'), { ...scan('2', 'Nearest Route assigned'), route: 'NearRoute' }], true],
    ['PENDING', [scan('1', ' nearroute ')], true],
    ['PENDING', [scan('1', 'NearRoute', '09:00:00', '02/11/2026')], false],
    ['PENDING', [scan('1', 'NearRoute'), scan('1', 'Out for delivery', '10:00:00')], false],
    ['PENDING', [scan('1', 'NearRoute'), scan('1', 'Delivered', '10:00:00')], false],
    ['OFD', [scan('1', 'Out for delivery'), scan('2', 'NearRoute')], true],
    ['PENDING', [scan('1', 'Out for delivery'), scan('2', 'CAD scan')], true],
    ['OFD', [scan('1', 'Out for delivery'), scan('2', 'CAD scan', '09:00:00', '02/11/2026')], false],
    ['OFD', [scan('1', 'Out for delivery'), scan('2', 'CAD scan'), scan('2', 'Out for delivery', '10:00:00')], false],
    ['PENDING', [scan('0', 'Order received', '14:59:47', '02/11/2026'), scan('1', 'Received into depot', '01:11:21'), scan('1', 'CAD scan', '07:25:26')], true],
    ['PENDING', [scan('0', 'Order received')], false],
    ['PENDING', [scan('0', 'Order received via synthetic system', '', ''), { ...scan('1', 'CAD scan'), dateTimeText: '03/11/202609:00:00' }], true],
    ['PENDING', [scan('0', '', '', ''), scan('1', 'CAD scan')], true],
    ['PENDING', [scan('0', 'Unknown administrative event', '25:00:00'), scan('1', 'CAD scan')], true],
    ['PENDING', [{ ...scan('1', 'CAD scan'), dateTimeText: '03/11/202609:00:00' }], true],
    ['PENDING', [{ ...scan('1', 'CAD scan'), dateTimeText: '03/11/2026\n09:00:00' }], true],
    ['PENDING', [scan('0', 'Order received', '', '')], false],
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
    // Owner 2026-11-04: the depot names the event "Cancelled OFD scan". New Pending parcel,
    // CAD today, then any number of cancelled OFD scans → still rescheduled.
    ['PENDING', [scan('0', 'Order received', '10:29:46', '02/11/2026'), scan('1', 'Received into depot', '22:09:26', '02/11/2026'),
      scan('1', 'CAD scan', '06:54:56'), scan('1', 'Cancelled OFD scan', '08:24:48'), scan('1', 'Cancelled OFD scan', '08:24:52')], true],
    ['PENDING', [scan('1', 'CAD scan'), scan('1', 'Cancelled OFD scan', '10:00:00'), scan('1', 'Out for delivery', '11:00:00')], false],
    ['PENDING', [scan('1', 'CAD scan'), scan('1', 'Cancelled OFD scan', '10:00:00'), scan('1', 'Returned to depot', '11:00:00')], false],
    ['PENDING', [scan('1', 'CAD scan'), scan('1', 'Cancelled OFD scanner', '10:00:00')], false],
  ];
  for (const [status, scans, allowed] of cases) {
    const result = await runReschedule('labels', { status, scans, logCallEnabled: true });
    assert.equal(result.saveWrites, Number(allowed), JSON.stringify({ status, scans }));
    assert.equal(result.logWrites, 0, 'reschedule must not call Log Call');
    assert.ok(result.result.results[0].reason);
  }
  const nearPreview = await runReschedule('labels', { serialized: true, dryRun: true, scans: [{ ...scan('1', 'Nearest Route assigned'), route: 'NearRoute' }] });
  assert.equal(nearPreview.result.eligible, 1);
  assert.match(nearPreview.result.results[0].reason, /NearRoute today/);
  assert.equal(nearPreview.saveWrites, 0);
  const all = await runReschedule('cad', { route: 'other', scans: [scan('1', 'Cancelled out for delivery')] });
  assert.equal(all.saveWrites, 1, 'all must evaluate non-CAD candidates too');
  const preview = await runReschedule('labels', { serialized: true, dryRun: true, scans: [scan('0', 'Ignored administrative row', '', ''), { ...scan('1', 'CAD scan'), dateTimeText: '03/11/202609:00:00' }] });
  assert.equal(preview.result.eligible, 1);
  assert.equal(preview.saveWrites, 0);
});

test('Goods Held requires an exact non-negated valid note TO today, with no CAD requirement', async () => {
  for (const [notes, allowed] of [
    ['Del. date changed FROM 01/01/20 TO 03/11/26', true],
    ['del.  date changed FROM 01/01/2020 TO 03/11/2026', true],
    ['NOT Del. date changed FROM 01/01/20 TO 03/11/26', false],
    ['Del. date changed FROM 31/02/26 TO 03/11/26', false],
    ['Del. date changed FROM 01/01/20 TO 03/11/2600', false],
    ['Del. date changed FROM 01/01/20 TO 04/11/26', false],
    // Real depot note format (owner screenshot 2026-11-06).
    ['Reschedule requested by customer. Del. date changed FROM 02/11/26 TO 03/11/26.', true],
    ['- Reschedule requested by customer. Del. date changed FROM 02/11/26 TO 03/11/26.', true],
    ['Ivan Example, Depot 22 FARRANFORE - Reschedule requested by customer. Del. date changed FROM 02/11/26 TO 03/11/26.', true],
    ['Customer refused. Del. date changed FROM 02/11/26 TO 03/11/26.', false],
    ['Reschedule requested by customer. Del. date changed FROM 02/11/26 TO 04/11/26.', false],
  ]) {
    const result = await runReschedule('labels', { status: 'GOODS HELD', notes, scans: [], logCallEnabled: true });
    assert.equal(result.saveWrites, Number(allowed), notes);
    assert.equal(result.logWrites, 0, 'reschedule must not call Log Call');
  }
});

test('Goods Held reads the real depot notes page: URL in a variable, notes as form rows', async () => {
  const row = `05/11/2026\n    11:25 \u00a0\u00a0 Ivan Example, \n   Depot 22\u00a0FARRANFORE\n   \u00a0\u00a0- Reschedule requested by customer. Del. date changed FROM 02/11/26 TO 03/11/26.\n`;
  const result = await runReschedule('labels', { status: 'GOODS HELD', notes: row, realNotesPage: true, scans: [] });
  assert.equal(result.saveWrites, 1);
  const other = await runReschedule('labels', { status: 'GOODS HELD', notes: row.replace('TO 03/11/26', 'TO 04/11/26'), realNotesPage: true, scans: [] });
  assert.equal(other.saveWrites, 0);
});

test('missing or conflicting scan evidence refuses writes; changed evidence is checked before save', async () => {
  for (const scans of [[scan('1', 'New unknown depot event')], [], [scan('', 'CAD scan')], [scan('1', 'CAD scan', '25:00:00')],
    [scan('1', 'CAD scan', '09:00:00', '31/02/2026')],
    [scan('1', 'CAD scan'), scan('1', 'Delivered')],
    [scan('1', 'CAD scan'), scan('', 'Delivered', '10:00:00')],
    [scan('1', 'CAD scan'), scan('', 'Order received')],
    [{ ...scan('1', 'CAD scan'), dateTimeText: '03/11/202625:00:00' }],
    [{ ...scan('1', 'CAD scan'), dateTimeText: '31/02/202609:00:00' }],
    [{ ...scan('1', 'CAD scan'), dateTimeText: '03/11/202609:00:00 extra' }],
    [scan('0', '', '', ''), scan('', 'CAD scan')],
    [{ ...scan('1', 'Nearest Route assigned'), route: 'NearRoute' }, scan('1', 'Delivered')],
    [{ ...scan('1', 'Unknown latest movement'), route: 'NearRoute' }],
    [{ ...scan('1', 'Nearest Route cancelled'), route: 'NearRoute' }],
    [{ ...scan('1', 'Nearest Route out for delivery'), route: 'NearRoute' }],
  ]) {
    const result = await runReschedule('labels', { scans, logCallEnabled: true });
    assert.equal(result.saveWrites, 0);
    assert.equal(result.logWrites, 0);
    assert.equal(result.result.results[0].action, 'REVIEW', 'ambiguous evidence goes to a human');
    assert.equal(result.result.review, 1);
    assert.equal(result.result.errors, 0);
    assert.equal(remainingRecoveryTargets(result.result.results, result.result).length, 1, 'review stays recoverable');
  }
  for (const identity of [{ detailNumber: '987654321' }, { detailId: '999' }, { detailNumber: '' }]) {
    const mismatched = await runReschedule('labels', { ...identity, logCallEnabled: true });
    assert.equal(mismatched.saveWrites, 0);
    assert.equal(mismatched.logWrites, 0);
    assert.equal(mismatched.scanReads, 0);
  }
  for (const type of ['CAD scan', 'NearRoute']) {
    const changed = await runReschedule('labels', {
      scans: [scan('1', type)], afterScans: [scan('1', type), scan('1', 'Delivered', '10:00:00')],
    });
    assert.equal(changed.saveWrites, 0);
    assert.equal(changed.result.errors, 1);
  }
});

test('preview separates eligible, skipped, needs-review and failed parcels without any write', async () => {
  const cases = {
    eligible: await runReschedule('labels', { dryRun: true, scans: [scan('1', 'CAD scan')] }),
    skipped: await runReschedule('labels', { dryRun: true, status: 'GOODS HELD' }),
    review: await runReschedule('labels', { dryRun: true, scans: [scan('1', 'New unknown depot event')] }),
    failed: await runReschedule('labels', { dryRun: true, fetchError: 'synthetic outage' }),
  };
  const expected = {
    eligible: { action: 'CHANGE_DATE', eligible: 1, skipped: 0, review: 0, errors: 0 },
    skipped: { action: 'SKIP', eligible: 0, skipped: 1, review: 0, errors: 0 },
    review: { action: 'REVIEW', eligible: 0, skipped: 0, review: 1, errors: 0 },
    failed: { action: 'ERROR', eligible: 0, skipped: 0, review: 0, errors: 1 },
  };
  for (const [name, run] of Object.entries(cases)) {
    const { action, ...counts } = expected[name];
    const { result } = run;
    assert.equal(result.results[0].action, action, name);
    assert.deepEqual(
      { eligible: result.eligible, skipped: result.skipped, review: result.review, errors: result.errors },
      counts, name);
    assert.equal(result.changed, 0, name);
    assert.equal(run.rescheduleReads + run.saveWrites + run.logWrites, 0, `${name}: no form, save or log call`);
    // Plan freshness: the proposal says which rules and when each parcel was read.
    assert.equal(result.dryRun, true);
    assert.equal(result.date, '04/11/2026');
    assert.equal(result.calendarVersion, 'IE-BPFI-2026-2027-v1');
    assert.match(result.policyVersion, /^IE-reschedule-\d{4}-\d{2}-\d{2}(?:\.\d+)?$/);
    assert.equal(result.results[0].consNumber, '123456789');
    assert.equal(result.results[0].consId, '7654321');
    if (name !== 'failed') assert.equal(result.results[0].checkedAt, '2026-11-03T12:00:00.000Z', name);
    assert.doesNotMatch(JSON.stringify(result), /session=|synthetic outage/);
  }
  assert.match(JSON.stringify(cases.review.diagnostics), /DONE.*Review: 1.*Errors: 0/);
});

test('a lost response after the date POST is uncertain and stays for a checked retry', async () => {
  const lost = await runReschedule('labels', { serialized: true, postThrows: true });

  assert.equal(lost.saveWrites, 1);
  assert.equal(lost.result.changed, 0);
  assert.equal(lost.result.errors, 1);
  assert.equal(lost.result.results[0].action, 'ERROR');
  assert.equal(lost.result.results[0].reason, 'Reschedule outcome uncertain; check the depot before retrying');
  assert.doesNotMatch(JSON.stringify(lost.result), /rolled back|Перенесено/);
  assert.equal(remainingRecoveryTargets(lost.result.results, lost.result).length, 1);
});

test('retry reconciles first: a form already at the target date sends nothing', async () => {
  const field = (name, value) => ({ name, value, type: 'text' });
  // Owner-verified: an untouched form pre-fills today's date. That must still be sent.
  const fresh = await runReschedule('labels', {
    serialized: true, formFields: [field('arranged-date', '03/11/2026')],
  });
  assert.equal(fresh.saveWrites, 1);
  assert.equal(fresh.result.changed, 1);
  assert.equal(new globalThis.URLSearchParams(fresh.saveBody).get('arranged-date'), '04/11/2026');

  const already = await runReschedule('labels', {
    serialized: true, formFields: [field('arranged-date', '04/11/2026')],
  });
  assert.equal(already.rescheduleReads, 1);
  assert.equal(already.saveWrites, 0);
  assert.equal(already.result.changed, 0);
  assert.equal(already.result.skipped, 1);
  assert.equal(already.result.results[0].action, 'SKIP');
  assert.equal(already.result.results[0].reason, 'Already arranged for the target date; nothing sent');
  assert.equal(remainingRecoveryTargets(already.result.results, already.result).length, 0);
  assert.doesNotMatch(JSON.stringify(already.diagnostics), /Перенесено/);
});

test('a second live run in the same tab is refused while one is writing', async () => {
  const blocked = await runReschedule('labels', { serialized: true, busy: true });
  assert.equal(blocked.result.__error, 'Another reschedule is already running in this tab');
  assert.equal(blocked.scanReads + blocked.rescheduleReads + blocked.saveWrites, 0);

  const preview = await runReschedule('labels', { serialized: true, busy: true, dryRun: true });
  assert.equal(preview.result.eligible, 1, 'a read-only preview is not blocked');

  const live = await runReschedule('labels', { serialized: true });
  assert.equal(live.result.changed, 1);
  assert.equal(live.lockAfter, false, 'the lock is released after the run');

  const failed = await runReschedule('labels', { serialized: true, saveStatus: 500 });
  assert.equal(failed.result.errors, 1);
  assert.equal(failed.lockAfter, false, 'the lock is released after a failure');
});
