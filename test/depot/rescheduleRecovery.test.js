import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LABEL_RESCHEDULE_RECOVERY_KEY,
  addRecoveryTargets,
  applyRecoveryResult,
  loadRecoveryTargets,
  recoveryDay,
  remainingRecoveryTargets,
} from '../../src/depot/rescheduleRecovery.js';

function memoryStorage(initial = {}) {
  const copy = value => JSON.parse(JSON.stringify(value));
  const values = copy(initial);
  return {
    values,
    async get(key) { return { [key]: values[key] }; },
    async set(entries) { Object.assign(values, copy(entries)); },
    async remove(key) { delete values[key]; },
  };
}

const first = { consNumber: '123456789', consId: '1001', type: 'PopUp' };
const second = { consNumber: '987654321', consId: '1002', type: 'PopUp' };

test('live targets are persisted and merged without losing a same-day failed batch', async () => {
  const storage = memoryStorage();

  await addRecoveryTargets(storage, [first, first, { consNumber: 'invalid', consId: 'x' }]);
  const merged = await addRecoveryTargets(storage, [second]);

  assert.deepEqual(merged, [first, second]);
  assert.deepEqual(await loadRecoveryTargets(storage), [first, second]);
  assert.equal(storage.values[LABEL_RESCHEDULE_RECOVERY_KEY].version, 2);
  assert.equal(storage.values[LABEL_RESCHEDULE_RECOVERY_KEY].runDay, recoveryDay());
});

test('a previous-day recovery batch expires instead of moving to a new tomorrow', async () => {
  const today = new Date(2026, 8, 2, 9, 0, 0);
  const storage = memoryStorage({
    [LABEL_RESCHEDULE_RECOVERY_KEY]: {
      version: 2,
      runDay: '2026-09-01',
      updatedAt: '2026-09-01T16:00:00.000Z',
      targets: [first],
    },
  });

  assert.deepEqual(await loadRecoveryTargets(storage, { now: today }), []);
  assert.equal(storage.values[LABEL_RESCHEDULE_RECOVERY_KEY], undefined);
});

test('total or indeterminate depot failure keeps every target for retry', () => {
  assert.deepEqual(remainingRecoveryTargets([first, second], null), [first, second]);
  assert.deepEqual(
    remainingRecoveryTargets([first, second], { __error: 'Synthetic depot failure' }),
    [first, second],
  );
});

test('confirmed and skipped targets clear while errors remain recoverable', async () => {
  const storage = memoryStorage();
  await addRecoveryTargets(storage, [first, second]);

  const remaining = await applyRecoveryResult(storage, {
    results: [
      { ...first, action: 'CHANGE_DATE' },
      { ...second, action: 'ERROR' },
    ],
  });

  assert.deepEqual(remaining, [second]);
  assert.deepEqual(await loadRecoveryTargets(storage), [second]);

  await applyRecoveryResult(storage, {
    results: [{ ...second, action: 'SKIP' }],
  });
  assert.deepEqual(await loadRecoveryTargets(storage), []);
  assert.equal(storage.values[LABEL_RESCHEDULE_RECOVERY_KEY], undefined);
});
