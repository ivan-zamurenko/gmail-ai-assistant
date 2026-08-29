import test from 'node:test';
import assert from 'node:assert/strict';

import { executeTask } from '../../src/queue/executor.js';

test('invalid or unversioned tasks cannot reach a depot command', async () => {
  const tasks = [
    null,
    { schemaVersion: 0 },
    { schemaVersion: 1, command: 'other', args: { mode: 'all', dryRun: false } },
    { schemaVersion: 1, command: 'find', args: { conId: 'not-a-consignment' } },
  ];
  for (const task of tasks) {
    assert.equal((await executeTask(task)).status, 'error');
  }
});
