import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { LABEL_RESCHEDULE_RECOVERY_KEY } from '../../src/depot/rescheduleRecovery.js';

// Execute real entrypoints; replace adapters BEFORE graph loading, including config.
// No actual local.js, Firebase credentials, Chrome, provider or live startup.
const exportsByModule = {
  'firebase/app': ['initializeApp'],
  'firebase/auth': ['getAuth', 'signInAnonymously', 'onAuthStateChanged'],
  'firebase/firestore': ['getFirestore', 'collection', 'query', 'where', 'onSnapshot', 'doc', 'runTransaction', 'serverTimestamp', 'updateDoc'],
  '../config/config.js': ['loadConfig'],
  '../queue/barcodeExecutor.js': ['executeBarcodeTask'],
  '../queue/executor.js': ['executeTask', 'lookupLabelTarget', 'rescheduleLabelTargets'],
  '../auth/getAuthToken.js': ['getAuthToken', 'removeCachedAuthToken'],
};
async function bundle(entry) {
  const built = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser',
    plugins: [{ name: 'synthetic-runtime-adapters', setup(b) {
      b.onResolve({ filter: /.*/ }, args => exportsByModule[args.path] ? { path: args.path, namespace: 'ports' } : null);
      b.onLoad({ filter: /.*/, namespace: 'ports' }, args => ({ contents: exportsByModule[args.path]
        .map(name => `export const ${name} = (...args) => globalThis.__ports.${name}(...args);`).join('\n') }));
    } }],
  });
  return built.outputFiles[0].text;
}
const backgroundCode = await bundle('src/background/background.js');
const offscreenCode = await bundle('src/offscreen/offscreen.js');
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function context(code, chrome, ports) {
  const intervals = new Map();
  const logs = [];
  let counter = 0;
  vm.runInNewContext(code, {
    chrome, __ports: ports, URL, setTimeout, clearTimeout, AbortController,
    setInterval: (fn, ms) => { const id = ++counter; intervals.set(id, { fn, ms }); return id; },
    clearInterval: id => intervals.delete(id),
    console: Object.fromEntries(['log', 'info', 'warn', 'error'].map(key => [key, (...args) => logs.push(args.join(' '))])),
  });
  return { intervals, logs };
}
function background() {
  const listeners = {};
  const calls = { create: 0, has: 0, alarms: 0, effects: 0, tabs: 0 };
  let createGate;
  let fail = false;
  const hook = key => ({ addListener: callback => { listeners[key] = callback; } });
  const chrome = {
    runtime: { id: 'synthetic-extension', getURL: path => `chrome-extension://synthetic-extension/${path}`,
      onInstalled: hook('installed'), onStartup: hook('startup'), onMessage: hook('message') },
    offscreen: { hasDocument: async () => { calls.has++; return false; }, createDocument: async () => {
      calls.create++; if (fail) throw new Error('PRIVATE_MARKER'); if (createGate) await createGate;
    } },
    tabs: { query: async () => { calls.tabs++; if (fail) throw new Error('PRIVATE_MARKER'); return []; } },
    scripting: { executeScript: async () => [] },
    alarms: { create: async () => { calls.alarms++; if (fail) throw new Error('PRIVATE_MARKER'); }, onAlarm: hook('alarm') },
    storage: { local: Object.fromEntries(['get', 'set', 'remove'].map(name => [name, async () => { calls.effects++; return {}; }])) },
  };
  const ports = Object.fromEntries(['executeTask', 'lookupLabelTarget', 'rescheduleLabelTargets', 'getAuthToken', 'removeCachedAuthToken']
    .map(name => [name, async () => { calls.effects++; return { status: 'done' }; }]));
  const ctx = context(backgroundCode, chrome, ports);
  return { ...ctx, listeners, calls, chrome, blockCreate: promise => { createGate = promise; }, setFailure: value => { fail = value; } };
}
function database() {
  const records = new Map();
  const updates = [];
  let serial = Promise.resolve();
  const now = () => Date.now();
  const timestamp = value => ({ toMillis: () => value });
  return { records, updates, timestamp,
    seed(id, fields = {}) { records.set(id, { status: 'pending', command: 'find', schemaVersion: 2, executorUid: 'executor-a', args: { conId: '123456789' }, expiresAt: timestamp(now() + 60000), ...fields }); },
    transaction: operation => {
      const result = serial.then(async () => {
        const pendingUpdates = [];
        const value = await operation({ get: async ref => ({ exists: () => records.has(ref.id), data: () => records.get(ref.id) }), update: (ref, fields) => pendingUpdates.push([ref.id, fields]) });
        for (const [id, fields] of pendingUpdates) { records.set(id, { ...records.get(id), ...fields }); updates.push([id, fields]); }
        return value;
      });
      serial = result.catch(() => {});
      return result;
    },
  };
}
async function offscreen(db, { uid = 'executor-a', execute, heartbeat, signInError } = {}) {
  let snapshot;
  let snapshotError;
  let authChanged;
  let unsubscribed = 0;
  const auth = { currentUser: { uid } };
  const effects = [];
  const filters = [];
  const ports = {
    loadConfig: () => ({ firebase: { apiKey: 'synthetic-key', projectId: 'synthetic-project' } }),
    initializeApp: () => ({}), getAuth: () => auth,
    signInAnonymously: async () => { if (signInError) throw new Error('PRIVATE_MARKER'); return { user: { uid } }; },
    onAuthStateChanged: (_auth, listener) => { authChanged = listener; return () => {}; },
    getFirestore: () => db, collection: (_db, name) => name,
    where: (...args) => { filters.push(args); return args; }, query: (...args) => args,
    onSnapshot: (_query, next, error) => { snapshot = next; snapshotError = error; return () => { unsubscribed++; }; },
    doc: (_db, name, id) => ({ name, id }), runTransaction: (_db, callback) => db.transaction(callback),
    serverTimestamp: () => db.timestamp(Date.now()), updateDoc: async () => {},
    executeBarcodeTask: async task => { effects.push(task.args.conId); return { status: 'done', summary: '' }; },
  };
  const sent = [];
  let runtimeListener;
  const chrome = { runtime: {
    id: 'synthetic-extension', getURL: path => `chrome-extension://synthetic-extension/${path}`,
    onMessage: { addListener: listener => { runtimeListener = listener; } },
    sendMessage: async message => {
      if (message.type === 'keepalive') return heartbeat ? heartbeat() : { ok: true };
      if (message.type?.startsWith('label-scan-')) { sent.push(message); return { ok: true }; }
      effects.push(message.task.args.conId);
      return execute ? execute(message.task) : { status: 'done', summary: 'synthetic done' };
    },
  } };
  const ctx = context(offscreenCode, chrome, ports);
  await flush();
  return { ...ctx, effects, filters, auth, sent, chrome, runtimeMessage: (...args) => runtimeListener?.(...args),
    get unsubscribed() { return unsubscribed; },
    snapshot: (...ids) => snapshot?.({ forEach: callback => ids.forEach(id => callback({ id, data: () => db.records.get(id) })) }),
    failSnapshot: () => snapshotError?.(new Error('PRIVATE_MARKER')),
    changeIdentity: next => { auth.currentUser = next ? { uid: next } : null; authChanged?.(auth.currentUser); },
  };
}

test('worker admits only offscreen sender and bounds document/timer creation with safe recovery', async () => {
  const h = background();
  const valid = { id: h.chrome.runtime.id, url: h.chrome.runtime.getURL('src/offscreen/offscreen.html') };
  const messages = [{ type: 'execute', task: {} }, { type: 'label-lookup', number: '123456789' },
    { type: 'label-reschedule', options: {} }, { type: 'drive-auth-token' }, { type: 'drive-remove-token', token: 'synthetic' },
    { type: 'label-recovery-get', key: LABEL_RESCHEDULE_RECOVERY_KEY }, { type: 'label-recovery-set', entries: { [LABEL_RESCHEDULE_RECOVERY_KEY]: {} } }, { type: 'label-recovery-remove', key: LABEL_RESCHEDULE_RECOVERY_KEY }];
  for (const sender of [undefined, {}, { ...valid, id: 'other' }, { ...valid, url: 'https://example.invalid/' },
    { ...valid, url: h.chrome.runtime.getURL('src/popup/popup.html') }, { ...valid, tab: { id: 7 } }]) {
    for (const message of messages) h.listeners.message(message, sender, () => {});
  }
  await flush();
  assert.equal(h.calls.effects, 0, 'untrusted messages must not reach any privileged adapter');
  for (const message of messages) h.listeners.message(message, valid, () => {});
  await flush();
  assert.equal(h.calls.effects, messages.length);

  const gate = deferred(); h.blockCreate(gate.promise);
  h.listeners.installed(); h.listeners.startup(); h.listeners.alarm({ name: 'offscreen-keepalive' });
  await flush();
  assert.equal(h.calls.create, 1, 'one in-flight offscreen creation');
  assert.equal(h.intervals.size, 1, 'one health timer per worker');
  gate.resolve(); await flush();
  h.blockCreate(null); h.setFailure(true);
  const tick = [...h.intervals.values()][0].fn;
  await tick(); await flush();
  const failedLogCount = h.logs.length;
  await tick(); await flush();
  assert.equal(h.logs.length, failedLogCount, 'one diagnostic per failure episode');
  assert.ok(h.logs.some(line => line.includes('OFFSCREEN_UNAVAILABLE')));
  assert.ok(!h.logs.join('\n').includes('PRIVATE_MARKER'));
  h.setFailure(false); await tick(); await flush();
  h.setFailure(true); await tick(); await flush();
  assert.ok(h.logs.length > failedLogCount, 'success resets failed episode');
  const broken = background(); broken.setFailure(true); broken.listeners.startup(); await flush();
  assert.ok(broken.logs.some(line => line.includes('KEEPALIVE_ALARM_UNAVAILABLE')));
  assert.ok(broken.logs.some(line => line.includes('DEPOT_WARMUP_UNAVAILABLE')));
  assert.ok(!broken.logs.join('\n').includes('PRIVATE_MARKER'));
  const responded = [];
  h.listeners.message({ type: 'keepalive' }, valid, response => responded.push(response.ok));
  h.listeners.message({ type: 'keepalive' }, { ...valid, tab: { id: 1 } }, response => responded.push(response.ok));
  assert.deepEqual(responded, [true, undefined]);
});

test('actual listener serializes local duplicates, transaction winners, restart and expiry', async () => {
  const db = database();
  db.seed('first'); db.seed('second', { args: { conId: '234567890' } });
  db.seed('expired', { expiresAt: db.timestamp(0) });
  db.seed('claimed-before-restart', { status: 'claimed' });
  const gate = deferred();
  const h = await offscreen(db, { execute: async task => { if (task.args.conId === '123456789') await gate.promise; return { status: 'done', summary: '' }; } });
  const peer = await offscreen(db);
  h.snapshot('first', 'first', 'second', 'expired', 'claimed-before-restart');
  peer.snapshot('first');
  await flush();
  assert.equal(h.effects.length + peer.effects.length, 1, 'two listeners share one transaction winner');
  assert.equal(h.effects.length, 1, 'second task waits for first');
  gate.resolve(); await flush();
  assert.deepEqual(h.effects, ['123456789', '234567890']);
  assert.equal(db.records.get('expired').status, 'cancelled');
  assert.equal(db.records.get('claimed-before-restart').status, 'claimed');
  assert.equal(db.updates.filter(([id, fields]) => id === 'first' && fields.status === 'claimed').length, 1);
  const restarted = await offscreen(db);
  restarted.snapshot('first', 'second', 'expired', 'claimed-before-restart'); await flush();
  assert.equal(restarted.effects.length, 0, 'restart never replays completed/claimed');
  assert.deepEqual(h.filters, [['executorUid', '==', 'executor-a']]);
});

test('listener rejects foreign identity, stops on UID change, and reports worker failures without replay', async () => {
  const db = database();
  db.seed('foreign', { executorUid: 'executor-b' });
  let heartbeatFails = true;
  let heartbeats = 0;
  const h = await offscreen(db, { heartbeat: async () => { heartbeats++; if (heartbeatFails) throw new Error('PRIVATE_MARKER'); return { ok: true }; } });
  h.snapshot('foreign'); await flush();
  assert.equal(h.effects.length, 0);
  assert.equal(db.records.get('foreign').status, 'pending');
  const tick = [...h.intervals.values()][0].fn;
  await tick(); await flush();
  const warnings = h.logs.filter(line => line.includes('WORKER_UNAVAILABLE')).length;
  assert.equal(warnings, 1);
  await tick(); await flush();
  assert.equal(h.logs.filter(line => line.includes('WORKER_UNAVAILABLE')).length, 1);
  heartbeatFails = false; await tick(); await flush();
  heartbeatFails = true; await tick(); await flush();
  assert.equal(h.logs.filter(line => line.includes('WORKER_UNAVAILABLE')).length, 2);
  assert.equal(heartbeats, 4, 'only scheduled health checks, no immediate retry burst');
  h.changeIdentity('executor-b'); await flush();
  assert.equal(h.unsubscribed, 1);
  assert.equal(h.intervals.size, 0);
  assert.ok(h.logs.some(line => line.includes('IDENTITY_CHANGED')));
  db.seed('after-change'); h.snapshot('after-change'); await flush();
  assert.equal(h.effects.length, 0);
  assert.ok(!h.logs.join('\n').includes('PRIVATE_MARKER'));

  const failingDb = database(); failingDb.seed('worker-failure');
  const fail = await offscreen(failingDb, { execute: async () => { throw new Error('PRIVATE_MARKER'); } });
  fail.snapshot('worker-failure'); await flush(); fail.snapshot('worker-failure'); await flush();
  assert.equal(fail.effects.length, 1);
  assert.equal(failingDb.records.get('worker-failure').status, 'error');
  assert.ok(!JSON.stringify([...failingDb.records]).includes('PRIVATE_MARKER'));
  fail.failSnapshot(); await flush();
  assert.ok(!fail.logs.join('\n').includes('PRIVATE_MARKER'));
  const queuedDb = database(); queuedDb.seed('running'); queuedDb.seed('queued', { args: { conId: '234567890' } });
  const gate = deferred();
  const queued = await offscreen(queuedDb, { execute: async () => { await gate.promise; return { status: 'done', summary: '' }; } });
  queued.snapshot('running', 'queued'); await flush();
  queued.changeIdentity('executor-b'); gate.resolve(); await flush();
  assert.equal(queued.effects.length, 1, 'identity change prevents queued execution');
  assert.equal(queuedDb.records.get('running').status, 'claimed', 'uncertain in-flight result remains claimed, never replayed');
  assert.equal(queuedDb.records.get('queued').status, 'pending');

  const heartbeatGate = deferred(); let attempts = 0;
  const busy = await offscreen(database(), { heartbeat: async () => { attempts++; await heartbeatGate.promise; return { ok: true }; } });
  const busyTick = [...busy.intervals.values()][0].fn;
  void busyTick(); void busyTick(); await flush();
  assert.equal(attempts, 1, 'one in-flight heartbeat even when health ticks overlap');
  heartbeatGate.resolve(); await flush();
  const login = await offscreen(database(), { signInError: true });
  assert.equal(login.intervals.size, 0);
  assert.ok(!login.logs.join('\n').includes('PRIVATE_MARKER'));
});

test('offscreen runs a popup label scan only for background, in the shared serial queue', async () => {
  const db = database();
  const h = await offscreen(db);
  const worker = { id: h.chrome.runtime.id, url: h.chrome.runtime.getURL('src/background/background.js') };
  assert.deepEqual(JSON.parse(JSON.stringify(h.sent.map(m => m.type))), ['label-scan-boot'], 'a fresh runner reports itself once');

  const responses = [];
  for (const sender of [{ ...worker, url: h.chrome.runtime.getURL('src/popup/popup.html') }, { ...worker, tab: { id: 7 } }, { ...worker, id: 'other' }]) {
    h.runtimeMessage({ type: 'label-scan-run', jobId: 'job-1', dryRun: true }, sender, r => responses.push(r));
  }
  h.runtimeMessage({ type: 'label-scan-run', jobId: 'bad id!', dryRun: true }, worker, r => responses.push(r));
  h.runtimeMessage({ type: 'label-scan-run', jobId: 'job-1', dryRun: 'yes' }, worker, r => responses.push(r));
  await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(responses)), Array(5).fill({ accepted: false }));
  assert.equal(h.sent.length, 1, 'rejected requests never run');

  h.runtimeMessage({ type: 'label-scan-run', jobId: 'job-1', dryRun: true }, worker, r => responses.push(r));
  assert.deepEqual(JSON.parse(JSON.stringify(responses.at(-1))), { accepted: true }, 'accepted before the long scan finishes');
  await flush();
  const finish = h.sent.find(m => m.type === 'label-scan-finish');
  assert.deepEqual(JSON.parse(JSON.stringify([finish?.jobId, finish?.status])), ['job-1', 'done']);
});

test('a popup label scan waits behind a running Discord task', async () => {
  const db = database();
  db.seed('discord-task');
  const gate = deferred();
  const h = await offscreen(db, { execute: async () => { await gate.promise; return { status: 'done', summary: '' }; } });
  const worker = { id: h.chrome.runtime.id, url: h.chrome.runtime.getURL('src/background/background.js') };
  h.snapshot('discord-task');
  await flush();
  h.runtimeMessage({ type: 'label-scan-run', jobId: 'job-2', dryRun: true }, worker, () => {});
  await flush();
  assert.equal(h.sent.some(m => m.type === 'label-scan-finish'), false, 'scan must not run beside the Discord task');
  gate.resolve();
  await flush();
  assert.equal(h.sent.some(m => m.type === 'label-scan-finish' && m.jobId === 'job-2'), true);
});
