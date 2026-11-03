import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeStorage } from '../../src/queue/runtimeStorage.js';

test('offscreen recovery storage uses only the narrow runtime bridge', async () => {
  const calls = [];
  const storage = createRuntimeStorage(async (message) => {
    calls.push(message);
    return { result: message.type === 'label-recovery-get' ? { recovery: 1 } : true };
  });

  assert.deepEqual(await storage.get('recovery'), { recovery: 1 });
  await storage.set({ recovery: { targets: [] } });
  await storage.remove('recovery');

  assert.deepEqual(calls, [
    { type: 'label-recovery-get', key: 'recovery' },
    { type: 'label-recovery-set', entries: { recovery: { targets: [] } } },
    { type: 'label-recovery-remove', key: 'recovery' },
  ]);
});
