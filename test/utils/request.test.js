import test from 'node:test';
import assert from 'node:assert/strict';
import { safeErrorMessage } from '../../src/utils/errors.js';
import { request } from '../../src/utils/request.js';

const URL = 'https://synthetic.invalid/api';
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = globalThis.setTimeout(() => reject(new Error('Request failed to terminate')), 100);
    })]);
  } finally { globalThis.clearTimeout(timer); }
}
test('API reads distinguish auth/permissions and bound transient retry attempts', async (t) => {
  for (const [status, code, attempts] of [[401, 'unauthenticated', 1], [403, 'permission-denied', 1], [429, 'resource-exhausted', 3], [503, 'unavailable', 3]]) {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: false, status }; });
    await assert.rejects(request.get(URL, { retryDelayMs: 0 }), error => {
      assert.equal(error.code, code);
      assert.equal(error.attempts, attempts);
      assert.equal(error.exhausted, attempts === 3);
      if (attempts === 3) assert.match(safeErrorMessage(new Error(safeErrorMessage(error))), /retry-exhausted/);
      assert.doesNotMatch(error.message, /synthetic/);
      return true;
    });
    assert.equal(calls, attempts);
  }
});

test('read timeout covers response body and cancellation interrupts backoff', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: true, json: () => new Promise(() => {}) }; });
  await assert.rejects(bounded(request.get(URL, { timeoutMs: 5, retryDelayMs: 0 })), { code: 'deadline-exceeded', attempts: 3, exhausted: true });
  assert.equal(calls, 3);
  const controller = new globalThis.AbortController();
  calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    globalThis.setTimeout(() => controller.abort(), 5);
    return { ok: false, status: 429 };
  });
  await assert.rejects(request.get(URL, { signal: controller.signal, retryDelayMs: 500 }), { code: 'aborted' });
  assert.equal(calls, 1);
});

test('dispatched mutations never retry and timeout/abort remain uncertain', async (t) => {
  for (const kind of ['network', 'timeout', 'abort', 'body']) {
    let calls = 0;
    const controller = new globalThis.AbortController();
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      if (kind === 'network') throw new Error('synthetic-private-body');
      if (kind === 'body') return { ok: true, json: async () => { throw new Error('synthetic-private-body'); } };
      if (kind === 'abort') globalThis.setTimeout(() => controller.abort(), 1);
      return new Promise(() => {});
    });
    await assert.rejects(bounded(request.post(URL, { timeoutMs: 5, signal: controller.signal })), error => {
      assert.equal(error.code, 'uncertain-write');
      assert.equal(error.attempts, 1);
      assert.doesNotMatch(error.message, /synthetic-private|rolled back/);
      return true;
    });
    assert.equal(calls, 1);
  }
  const controller = new globalThis.AbortController();
  controller.abort();
  t.mock.method(globalThis, 'fetch', async () => assert.fail('pre-aborted request dispatched'));
  await assert.rejects(request.post(URL, { signal: controller.signal }), { code: 'aborted', attempts: 0 });
});
