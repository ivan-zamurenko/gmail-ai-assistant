import test from 'node:test';
import assert from 'node:assert/strict';

import * as bot from '../../bot/src/contract.js';
import * as extension from '../../src/queue/contract.js';

const fields = ['COMMANDS', 'RESCHEDULE_MODE', 'STATUS', 'TASK_SCHEMA_VERSION', 'TASKS_COLLECTION'];

function assertMirrors(candidate) {
  for (const field of fields) {
    assert.deepEqual(candidate[field], extension[field], `Queue contract mismatch: ${field}`);
  }
}

test('bot and extension share the queue vocabulary; each mirror drift is detected', () => {
  assertMirrors(bot);
  for (const field of fields) {
    // Synthetic drift, never mutate the actual runtime modules.
    const changed = typeof bot[field] === 'object'
      ? { ...bot[field], SYNTHETIC_DRIFT: 'unsupported' }
      : `${bot[field]}-unsupported`;
    assert.throws(() => assertMirrors({ ...bot, [field]: changed }), {
      code: 'ERR_ASSERTION', message: new RegExp(`Queue contract mismatch: ${field}`),
    });
  }
});

test('pending task separates the requester from the trusted executor and envelope', async () => {
  const { buildPendingTask } = await import('../../bot/src/pendingTask.js');
  const context = {
    id: 'synthetic-task', executorUid: 'synthetic-executor',
    createdAt: { synthetic: 'server-timestamp' }, expiresAt: { synthetic: 'expiry' },
  };
  const args = {
    conId: '123456789', requestedBy: 'args-requester', executorUid: 'args-executor',
    id: 'args-id', schemaVersion: 0, status: 'done', createdAt: null, expiresAt: null,
  };
  const record = buildPendingTask({
    command: bot.COMMANDS.FIND, args, requestedBy: 'synthetic-operator',
    id: 'untrusted-task-id', executorUid: 'untrusted-task-executor',
    schemaVersion: 0, status: 'done', createdAt: null, expiresAt: null,
  }, context);
  assert.deepEqual(record, {
    id: context.id, schemaVersion: 2, command: 'find', args,
    requestedBy: 'synthetic-operator', executorUid: context.executorUid, status: 'pending',
    createdAt: context.createdAt, expiresAt: context.expiresAt,
  });
  assert.equal(record.createdAt, context.createdAt);
  assert.equal(record.expiresAt, context.expiresAt);
  assert.deepEqual(buildPendingTask({ command: 'find', requestedBy: 'synthetic-operator' }, context).args, {});
});
