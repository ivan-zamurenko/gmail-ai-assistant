import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import process from 'node:process';
import { URL, URLSearchParams } from 'node:url';
import { calendarPlan, irishDay, validateManualDate, prepareDepotArgs } from '../../shared/depotCalendar.js';
import { depotMain } from '../../src/depot/depotScript.js';
import { build } from 'esbuild';
import { useChrome } from '../helpers/harness.js';
import { LABEL_RESCHEDULE_RECOVERY_KEY } from '../../src/depot/rescheduleRecovery.js';

test('Irish calendar skips weekends and public/bank closures, refusing uncovered dates', () => {
  const cases = [
    ['2026-11-06', '2026-11-09'], ['2026-11-07', '2026-11-09'],
    ['2026-04-02', '2026-04-07'], ['2027-03-25', '2027-03-30'],
    ['2026-12-24', '2026-12-30'], ['2027-12-24', '2027-12-30'],
    ['2026-12-31', '2027-01-04'], ['2027-01-29', '2027-02-02'],
  ];
  for (const [today, expected] of cases) {
    for (const time of ['00:00:00', '12:00:00', '23:59:59']) {
      assert.equal(calendarPlan({ now: new Date(`${today}T${time}Z`) }).targetDate, expected);
    }
  }
  assert.throws(() => calendarPlan({ now: new Date('2027-12-31T12:00Z') }), /Calendar coverage unavailable/);
  assert.match(validateManualDate('2028-01-04', new Date('2027-12-01T12:00Z')), /Calendar coverage unavailable/);
  assert.equal(validateManualDate('2027-12-31', new Date('2027-12-30T12:00Z')), null);
  for (const date of ['2026-04-03', '2026-04-06', '2026-12-28', '2026-12-29', '2027-03-17']) {
    assert.match(validateManualDate(date, new Date('2026-01-01T12:00Z')), /working day/);
  }
});

test('Irish day and manual validity are independent of host timezone, including DST', () => {
  const oldTZ = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      for (const [instant, day] of [
        ['2026-06-01T23:30:00Z', '2026-06-02'],
        ['2026-03-29T00:30:00Z', '2026-03-29'],
        ['2026-03-29T23:30:00Z', '2026-03-30'],
        ['2026-10-25T00:30:00Z', '2026-10-25'],
        ['2026-10-25T23:30:00Z', '2026-10-25'],
      ]) assert.equal(irishDay(new Date(instant)), day);
      const now = new Date('2026-06-01T23:30:00Z');
      assert.match(validateManualDate('2026-06-02', now), /future/);
      assert.equal(validateManualDate('2026-06-03', now), null);
      assert.equal(calendarPlan({ now }).targetDate, '2026-06-03');
      assert.throws(() => prepareDepotArgs({ mode: 'labels', expectedDay: '2026-06-01' }, now), /Calendar plan expired/);
    }
  } finally {
    if (oldTZ === undefined) delete process.env.TZ;
    else process.env.TZ = oldTZ;
  }
});

test('serialized depot preview uses dated calendar plan and rejects missing/stale plans before IO', async () => {
  const now = new Date('2026-12-24T12:00Z');
  const plan = calendarPlan({ now });
  let requests = 0;
  const context = vm.createContext({
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } },
    Intl, URL, URLSearchParams, console: { log() {}, warn() {}, error() {} },
    window: { location: { href: 'http://synthetic.interlink.local/home' } },
    fetch(url, options) {
      assert.notEqual(options?.method, 'POST');
      requests++;
      return { ok: true, text: async () => String(url).includes('woScanningHistoryList') ? 'scans' : 'detail' };
    },
    DOMParser: class { parseFromString(kind) {
      return kind === 'detail' ? { querySelectorAll: () => [{}, { textContent: 'PENDING' }],
        getElementById: id => ({ value: id === 'hiddenConsBarcodeValue' ? '123456789' : '7654321' }) }
        : { getElementById: () => ({}), querySelectorAll: () => [{ querySelectorAll: () =>
          Array.from({ length: 12 }, (_, i) => ({ textContent: ({ 3: 'CAD scan', 4: '24/12/2026 09:00:00', 7: '1' })[i] ?? '', getAttribute: () => null })) }] };
    } },
  });
  const run = vm.runInContext(`(${depotMain.toString()})`, context);
  const args = { mode: 'labels', dryRun: true, calendar: plan,
    targets: [{ consNumber: '123456789', consId: '7654321' }] };
  const result = await run(args);
  assert.equal(result.date, '30/12/2026');
  assert.equal(result.calendarVersion, plan.version);
  assert.equal(result.calendarTimeZone, 'Europe/Dublin');
  assert.equal(result.eligible, 1);
  assert.equal(result.errors, 0);
  for (const calendar of [undefined, { ...plan, today: '2026-12-23' }, { ...plan, targetDate: '2026-12-32' }]) {
    assert.match((await run({ ...args, calendar })).__error, /Calendar plan/);
  }
  assert.match((await run({ ...args, mode: 'manual', date: '2026-12-31' })).__error, /Calendar plan/);
  assert.equal(requests, 2, 'invalid/stale plans must not add any requests');
});

test('popup retry confirmation crossing Irish midnight does not rewrite or execute saved targets', async (t) => {
  // Bundle as the extension does; barcode/credentials are unrelated to retry.
  const compiled = await build({ entryPoints: ['src/popup/depotFlow.js'], bundle: true,
    format: 'esm', platform: 'node', write: false, plugins: [{ name: 'retry-only', setup(builder) {
      builder.onLoad({ filter: /[/]driveScanner\.js$/ }, () => ({ contents: 'export function processLabels() { throw new Error("Unexpected Drive access"); }' }));
      builder.onLoad({ filter: /[/]config[/]config\.js$/ }, () => ({ contents: 'export function loadConfig() { throw new Error("Unexpected config access"); }' }));
    } }] });
  const { initDepotFlow } = await import(`data:text/javascript,${encodeURIComponent(compiled.outputFiles[0].text)}`);
  const originals = new Map(['Date', 'window', 'document'].map(key => [key, globalThis[key]]));
  t.after(() => { for (const [key, value] of originals) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  } });
  let now = '2026-06-01T22:59:59Z';
  const RealDate = Date;
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } };
  const batch = { version: 3, runDay: '2026-06-01', targets: [{ consNumber: '123456789', consId: '1001' }] };
  useChrome(t, { storage: { [LABEL_RESCHEDULE_RECOVERY_KEY]: batch } });
  let writes = 0;
  globalThis.chrome.storage.local.set = async () => { writes++; };
  globalThis.chrome.tabs = { query: async () => { writes++; throw new Error('Unexpected injection'); } };
  globalThis.window = { confirm() { now = '2026-06-01T23:00:01Z'; return true; } };
  const element = () => ({ classList: { add() {} }, style: {}, appendChild() {},
    addEventListener(name, handler) { this[name] = handler; } });
  globalThis.document = { createElement: element };
  const nodes = Object.fromEntries(['depotStatusDot', 'depotStatusLabel', 'depotMessage',
    'dryRunToggle', 'scanCADBtn', 'scanDriveBtn', 'retryRescheduleBtn',
    'scanProgress', 'progressFill', 'progressLabel', 'depotLogEl'].map(key => [key, element()]));
  nodes.dryRunToggle.checked = false;
  initDepotFlow(nodes);
  await nodes.retryRescheduleBtn.click();
  assert.equal(writes, 0);
  assert.match(nodes.depotMessage.textContent, /Calendar plan expired/);
});
