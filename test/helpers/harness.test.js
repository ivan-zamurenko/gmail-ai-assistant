import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NETWORK_BLOCKED, blockedFetch } from './networkGuard.js';
import { useChrome, useFetch } from './harness.js';
import { assertSyntheticFixture, loadFixture } from './fixtures.js';

const TEST_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('a fetch nobody faked is rejected before it leaves the process', async () => {
  // Loopback discard port: without the guard this fails locally, never externally.
  await assert.rejects(
    globalThis.fetch('http://127.0.0.1:9/should-not-be-called'),
    (error) => error.code === NETWORK_BLOCKED,
  );
});

test('fake fetch answers only listed routes and records the rest', async (t) => {
  const net = useFetch(t, [
    { method: 'GET', url: 'https://synthetic.invalid/ok', json: { value: 1 } },
    { method: 'POST', url: 'https://synthetic.invalid/never', json: {} },
  ]);

  const res = await globalThis.fetch('https://synthetic.invalid/ok');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { value: 1 });

  await assert.rejects(globalThis.fetch('https://synthetic.invalid/ok'), { code: NETWORK_BLOCKED });
  await assert.rejects(
    globalThis.fetch('https://synthetic.invalid/never', { method: 'GET' }),
    { code: NETWORK_BLOCKED },
  );
  assert.deepEqual(net.unexpected, [
    { method: 'GET', url: 'https://synthetic.invalid/ok' },
    { method: 'GET', url: 'https://synthetic.invalid/never' },
  ]);
  assert.deepEqual(net.unused(), [{ method: 'POST', url: 'https://synthetic.invalid/never' }]);
});

// The next two tests run in order: the first leaves state behind on purpose.
let leakedTimerFired = false;

test('isolation setup: storage, clock, fetch and a pending timer', async (t) => {
  const chrome = useChrome(t, { storage: { leaked: 'from-first-test' } });
  await globalThis.chrome.storage.local.set({ second: 2 });
  assert.equal(chrome.data.second, 2);

  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  assert.equal(Date.now(), 0);
  globalThis.setTimeout(() => { leakedTimerFired = true; }, 1_000);

  useFetch(t, [{ url: 'https://synthetic.invalid/first-only', json: {} }]);
});

test('isolation check: nothing from the previous test survives', async (t) => {
  assert.equal(globalThis.chrome, undefined);
  assert.equal(globalThis.fetch, blockedFetch);
  assert.ok(Date.now() > Date.UTC(2020, 0, 1), 'fake clock leaked');

  await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
  assert.equal(leakedTimerFired, false, 'pending fake timer fired later');

  await assert.rejects(globalThis.fetch('https://synthetic.invalid/first-only'), { code: NETWORK_BLOCKED });

  useChrome(t);
  assert.deepEqual(await globalThis.chrome.storage.local.get(null), {});
});

test('fixture validator accepts synthetic data and rejects real-looking data', async () => {
  const labels = await loadFixture('gmail-labels.json');
  assert.ok(labels.labels.length > 0);

  const bad = [
    [{ labels: [] }, /synthetic/],
    [{ synthetic: true, auth: 'Bearer abc.def' }, /OAuth token/],
    [{ synthetic: true, from: 'customer@gmail.com' }, /email/],
    [{ synthetic: true, photo: 'data:image/jpeg;base64,AAAA' }, /image/],
    [{ synthetic: true, page: '<html><body>card</body></html>' }, /HTML/],
    [{ synthetic: true, link: 'http://x.interlink.local/a?sid=1' }, /depot host/],
  ];
  for (const [fixture, reason] of bad) {
    assert.throws(() => assertSyntheticFixture(fixture), reason);
  }
  assert.doesNotThrow(() => assertSyntheticFixture({ synthetic: true, to: 'driver@example.com' }));
});

test('required test directories are not empty', async () => {
  const required = ['bot', 'depot', 'gmail', 'helpers', 'queue', 'tooling', 'utils'];
  for (const dir of required) {
    const files = (await readdir(join(TEST_ROOT, dir))).filter((f) => /\.test\.m?js$/.test(f));
    assert.ok(files.length > 0, `test/${dir} has no test files`);
  }
});
