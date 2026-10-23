// Historical snapshot probe only: assertions describe the supplied archive, not current runtime.
// Deliberately excluded from node --test auto-discovery; run explicitly against DPD_SOURCE_ROOT.
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
const sourceRoot=path.resolve(process.env.DPD_SOURCE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const load=(relative)=>import(pathToFileURL(path.join(sourceRoot,relative)).href);
const botContract=await load('bot/src/contract.js');
const extensionContract=await load('src/queue/contract.js');
const {executeTask}=await load('src/queue/executor.js');
const {safeErrorMessage:botError}=await load('bot/src/errors.js');
const {safeErrorMessage:extensionError}=await load('src/utils/errors.js');


let calls;
let injectionResult;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  injectionResult = { dryRun: true, count: 0, packages: [] };
  globalThis.fetch = () => { throw new Error('Network forbidden in this offline check'); };
  globalThis.chrome = {
    tabs: {
      query: async (query) => { calls.push(['query', query]); return [{ id: 101 }]; },
      update: async (...args) => { calls.push(['update', args]); return {}; },
    },
    scripting: {
      executeScript: async (options) => {
        calls.push(['inject', options]);
        // Do not invoke options.func: this is a transport boundary stub.
        return [{ result: injectionResult }];
      },
    },
  };
});
afterEach(() => {
  delete globalThis.chrome;
  globalThis.fetch = originalFetch;
});

const task = (command, args) => ({ schemaVersion: 1, command, args });

test('bot and extension contract values agree', () => {
  for (const key of ['COMMANDS', 'RESCHEDULE_MODE', 'STATUS', 'TASK_SCHEMA_VERSION', 'TASKS_COLLECTION']) {
    assert.deepEqual(botContract[key], extensionContract[key]);
  }
});

test('invalid versions and unknown commands are rejected before Chrome calls', async () => {
  for (const value of [null, {}, { schemaVersion: 0 }, task('other', {})]) {
    assert.equal((await executeTask(value)).status, 'error');
  }
  assert.equal(calls.length, 0);
});

test('invalid consignment values are rejected before Chrome calls', async () => {
  for (const conId of ['', 'invalid', '12345678', 123456789]) {
    assert.equal((await executeTask(task('find', { conId }))).status, 'error');
  }
  assert.equal(calls.length, 0);
});

test('parcel and barcodes modes are registered in contract but not executed', async () => {
  for (const mode of ['parcel', 'barcodes']) {
    const result = await executeTask(task('reschedule', { mode, dryRun: true }));
    assert.equal(result.status, 'error');
    assert.ok(result.summary.includes(mode));
  }
  assert.equal(calls.length, 0);
});

test('nonboolean dryRun is rejected before Chrome calls', async () => {
  for (const dryRun of ['false', 0, null]) {
    assert.equal((await executeTask(task('reschedule', { mode: 'all', dryRun }))).status, 'error');
  }
  assert.equal(calls.length, 0);
});

test('reschedule all defaults to dryRun at the injection boundary', async () => {
  const result = await executeTask(task('reschedule', { mode: 'all' }));
  assert.equal(result.status, 'done');
  const injected = calls.find(([kind]) => kind === 'inject')[1];
  assert.deepEqual(injected.args, [{ dryRun: true, mode: 'cad' }]);
  assert.equal(injected.world, 'MAIN');
});

test('an explicitly false dryRun reaches only our fake injection boundary', async () => {
  injectionResult = { changed: 1, skipped: 0, errors: 0, results: [] };
  const result = await executeTask(task('reschedule', { mode: 'all', dryRun: false }));
  assert.equal(result.status, 'done');
  assert.equal(calls.find(([kind]) => kind === 'inject')[1].args[0].dryRun, false);
});

test('find returns minimized parcel fields while retaining location data', async () => {
  injectionResult = [{
    ok: true, query: '123456789', consNumber: '123456789',
    address: { name: 'SYNTHETIC PERSON', street: 'SYNTHETIC STREET', town: 'FixtureTown', county: 'FixtureCounty', postCode: 'FIXTURE_CODE' },
    scans: [{ parcel: '1', type: 'Received', date: '01/01/2026', time: '12:00:00', route: 'fixture', notes: 'Bay: T1 / Onward BC: SYNTHETIC / private SYNTHETIC_NOTE' }],
    drop: { lat: 0, lng: 0 }, timing: { search: 1 }, signature: 'SYNTHETIC_SIGNATURE',
  }];
  const result = await executeTask(task('find', { conId: '123456789' }));
  assert.equal(result.status, 'done');
  assert.deepEqual(Object.keys(result.parcel.address).sort(), ['county', 'postCode', 'town']);
  assert.equal(result.parcel.address.postCode, 'FIXTURE_CODE');
  assert.deepEqual(result.parcel.drop, { lat: 0, lng: 0 });
  assert.equal(result.parcel.scans[0].notes, 'Bay: T1 | Onward BC: SYNTHETIC');
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC PERSON|SYNTHETIC STREET|SYNTHETIC_SIGNATURE|SYNTHETIC_NOTE/);
});

test('missing depot tabs return an error without injection', async () => {
  globalThis.chrome.tabs.query = async () => [];
  assert.equal((await executeTask(task('find', { conId: '123456789' }))).status, 'error');
  assert.equal(calls.filter(([kind]) => kind === 'inject').length, 0);
});

test('outbound URL errors are redacted and bounded', () => {
  for (const sanitize of [botError, extensionError]) {
    const result = sanitize(new Error('HTTP error https://fixture.invalid/path?session=TEST_TOKEN&UID=TEST_USER'));
    assert.doesNotMatch(result, /fixture\.invalid|TEST_TOKEN|TEST_USER/);
    assert.ok(sanitize(new Error('x'.repeat(1000))).length <= 500);
  }
});
