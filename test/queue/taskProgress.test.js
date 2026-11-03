import test from 'node:test';
import assert from 'node:assert/strict';

import { createTaskProgressReporter } from '../../src/queue/taskProgress.js';

test('queue progress is PII-free, bounded and coalesced', async () => {
  const writes = [];
  let release;
  const firstWrite = new Promise((resolve) => { release = resolve; });
  const reporter = createTaskProgressReporter(async (value) => {
    writes.push(value);
    if (writes.length === 1) await firstWrite;
  });

  reporter.push(0, 0, 'depot-probe', 12);
  reporter.push(1, 700, 'downloading', 20); // console-only stage
  reporter.push(1, 700, 'done', 30);
  reporter.push(99999, 700, 'done', 99999999);
  release();
  await reporter.flush();

  assert.deepEqual(writes, [
    { stage: 'depot-probe', current: 0, total: 0, elapsedMs: 12 },
    { stage: 'done', current: 700, total: 700, elapsedMs: 7200000 },
  ]);
  assert.deepEqual(Object.keys(writes[0]).sort(), [
    'current', 'elapsedMs', 'stage', 'total',
  ]);
});
