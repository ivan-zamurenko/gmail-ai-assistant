import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueueService } from '../../bot/src/queueService.js';
import { createInteractionHandler } from '../../bot/src/interactions.js';

const actor = { requestedBy: 'synthetic-requester', guildId: 'synthetic-guild' };
const stamp = value => ({ toMillis: () => value });
function fixture({ automatic = true } = {}) {
  const documents = new Map();
  const listeners = new Map();
  let clock = 100000;
  let creates = 0;
  let timer;
  let failDelete = false;
  const snapshot = id => ({ id, exists: documents.has(id), data: () => documents.get(id) });
  const doc = id => ({ id,
    get: async () => snapshot(id),
    onSnapshot: callback => { listeners.set(id, callback); return () => listeners.delete(id); },
    set: async value => {
      creates++;
      documents.set(id, value);
      if (automatic) {
        documents.set(id, { ...value, status: 'done', summary: 'Synthetic completed result', completedAt: stamp(clock) });
        queueMicrotask(() => listeners.get(id)?.(snapshot(id)));
      }
    },
    delete: async () => { if (failDelete) throw new Error('Synthetic delete failure'); documents.delete(id); },
  });
  const db = {
    collection: () => ({ doc, where: () => ({ get: async () => ({ docs: [...documents.keys()].map(snapshot) }) }) }),
    runTransaction: async fn => fn({
      get: ref => ref.get(), update: (ref, patch) => documents.set(ref.id, { ...documents.get(ref.id), ...patch }),
      delete: ref => documents.delete(ref.id),
    }),
  };
  const service = () => createQueueService({ db, executorUid: 'synthetic-executor', guildId: actor.guildId,
    randomId: () => 'synthetic-task', serverTimestamp: () => stamp(clock), timestampFromMillis: stamp,
    now: () => clock, scheduleTimeout: callback => { timer = callback; return 1; }, cancelTimeout: () => {},
  });
  return { service, documents, creates: () => creates, timeout: () => timer(),
    advance: value => { clock += value; }, failDelete: value => { failDelete = value; } };
}
function interaction(editReply) {
  return { isChatInputCommand: () => true, guildId: actor.guildId, commandName: 'reschedule',
    memberPermissions: { has: () => true }, user: { id: actor.requestedBy },
    options: { getSubcommand: () => 'all', getBoolean: () => true },
    deferReply: async () => {}, editReply,
  };
}
const task = { command: 'reschedule', args: { mode: 'all', dryRun: true }, requestedBy: actor.requestedBy };

test('confirmed terminal result survives rejected reply; success ACK follows actual delivery only', async () => {
  for (const fails of [true, false]) {
    const f = fixture();
    const service = f.service();
    let sends = 0;
    let acks = 0;
    const handler = createInteractionHandler({ cfg: { guildId: actor.guildId }, enqueueAndWait: service.enqueueAndWait,
      acknowledgeResult: async (...args) => { acks++; assert.equal(sends, 1); return service.acknowledgeResult(...args); },
    });
    await handler(interaction(async () => { sends++; if (fails) throw new Error('Synthetic Discord rejection'); }));
    assert.equal(f.creates(), 1);
    assert.equal(acks, fails ? 0 : 1);
    assert.equal(f.documents.has('synthetic-task'), fails);
  }
});

test('restart recovery scopes identity and expires results; ACK delete failure remains acknowledged for sweep', async () => {
  const f = fixture();
  const service = f.service();
  await service.enqueueAndWait({ ...task, args: { conId: '123456789' } });
  const restarted = f.service();
  const completedAt = f.documents.get('synthetic-task').completedAt;
  f.documents.get('synthetic-task').completedAt = stamp(completedAt.toMillis() + 1000);
  assert.ok(await restarted.getResult('synthetic-task', actor), 'small server clock skew must not discard a fresh result');
  await restarted.sweepResults();
  assert.equal(f.documents.has('synthetic-task'), true);
  f.documents.get('synthetic-task').completedAt = completedAt;
  assert.equal((await restarted.listResults(actor, '123456789')).length, 1);
  assert.equal(await restarted.getResult('synthetic-task', { ...actor, requestedBy: 'someone-else' }), null);
  assert.deepEqual(await restarted.listResults({ ...actor, guildId: 'other-guild' }), []);
  assert.deepEqual(await restarted.listResults(actor, '987654321'), []);
  assert.equal(f.creates(), 1);
  f.failDelete(true);
  await assert.rejects(restarted.acknowledgeResult('synthetic-task', actor), /delete failure/);
  assert.ok(f.documents.get('synthetic-task').delivery.deliveredAt);
  assert.equal(await restarted.getResult('synthetic-task', actor), null);
  f.failDelete(false);
  await restarted.sweepResults();
  assert.equal(f.documents.size, 0);
  await service.enqueueAndWait(task);
  f.advance(24 * 60 * 60_000);
  assert.equal(await restarted.getResult('synthetic-task', actor), null);
  await restarted.sweepResults();
  assert.equal(f.documents.size, 0);
  const base = { executorUid: 'synthetic-executor', requestedBy: actor.requestedBy, status: 'done', delivery: { version: 1, guildId: actor.guildId } };
  f.documents.set('future', { ...base, completedAt: stamp(9999999999999) });
  f.documents.set('legacy', { ...base, delivery: undefined });
  f.documents.set('foreign', { ...base, delivery: { version: 1, guildId: 'other-guild' } });
  f.documents.set('pending', { ...base, status: 'pending' });
  assert.deepEqual(await restarted.listResults(actor), []);
  await restarted.sweepResults();
  assert.deepEqual([...f.documents.keys()], ['foreign', 'pending']);
});

test('pending timeout cancels without execution; claimed timeout remains uncertain and is never swept', async () => {
  for (const status of ['pending', 'claimed']) {
    const f = fixture({ automatic: false });
    const service = f.service();
    const pending = service.enqueueAndWait(task);
    const checked = status === 'claimed' ? assert.rejects(pending, /Не повторюй live-команду автоматично/) : pending;
    f.documents.get('synthetic-task').status = status;
    await f.timeout();
    const result = await checked;
    if (status === 'pending') assert.equal(result.status, 'cancelled');
    else {
      f.advance(48 * 60 * 60_000);
      await service.sweepResults();
      assert.equal(f.documents.get('synthetic-task').status, 'claimed');
    }
    assert.equal(f.creates(), 1);
  }
});

test('recovery lists ambiguous results and rechecks button ownership without enqueue', async () => {
  const f = fixture();
  const service = f.service();
  await service.enqueueAndWait({ ...task, args: { conId: '123456789' } });
  f.documents.set('synthetic-second', { ...f.documents.get('synthetic-task'), id: 'synthetic-second' });
  let reads = 0;
  const handler = createInteractionHandler({ cfg: { guildId: actor.guildId }, ...service,
    getResult: async (...args) => { reads++; return service.getResult(...args); },
    listResults: async (...args) => { reads++; return service.listResults(...args); },
  });
  const edits = [];
  const request = { ...interaction(async payload => edits.push(payload)), commandName: 'result',
    options: { getString: () => '123456789' }, reply: async payload => edits.push(payload) };
  for (const denied of [
    { ...request, guildId: 'other-guild' },
    { ...request, commandName: 'todo', isChatInputCommand: () => false, isButton: () => true, customId: 'result:show:synthetic-task', memberPermissions: { has: () => false } },
  ]) await handler(denied);
  assert.equal(reads, 0);
  edits.length = 0;
  await handler(request);
  assert.ok(edits[0].components?.length > 0, 'ambiguous retained results need selection controls');
  assert.equal(f.documents.size, 2, 'a list is not delivery acknowledgement');
  const label = edits[0].components[0].toJSON().components[0].label;
  assert.match(label, /123456789.*UTC/);
  for (let n = 0; n < 4; n++) f.documents.set(`extra-${n}`, { ...f.documents.get('synthetic-task') });
  await handler(request);
  assert.equal(edits.at(-1).components.length, 5);
  const next = edits.at(-1).components[4].toJSON().components[0].custom_id;
  assert.equal(next, 'result:page:4:123456789');
  await handler({ ...request, isChatInputCommand: () => false, isButton: () => true, customId: next });
  assert.match(edits.at(-1).content, /5–6/);
  for (let n = 0; n < 4; n++) f.documents.delete(`extra-${n}`);
  f.documents.get('synthetic-task').parcel = { consNumber: '123456789' };
  const failingRender = createInteractionHandler({ cfg: { guildId: actor.guildId }, ...service,
    buildParcelEmbed: async () => { throw new Error('Synthetic rendering failure'); } });
  await failingRender({ ...request, isChatInputCommand: () => false, isButton: () => true, customId: 'result:show:synthetic-task' });
  assert.equal(f.documents.size, 2);
  delete f.documents.get('synthetic-task').parcel;
  const other = { ...request, user: { id: 'other-requester' }, isChatInputCommand: () => false,
    isButton: () => true, customId: 'result:show:synthetic-task' };
  await handler(other);
  assert.equal(f.documents.size, 2);
  await handler({ ...other, user: request.user });
  assert.equal(f.documents.has('synthetic-task'), false);
  assert.equal(f.creates(), 1);
});

test('barcode DM is the final delivery boundary even if the progress message expires', async () => {
  const f = fixture();
  const service = f.service();
  let dm = 0;
  let edits = 0;
  const handler = createInteractionHandler({ cfg: { guildId: actor.guildId }, ...service });
  const request = { ...interaction(async () => { if (++edits > 1) throw new Error('Synthetic expired interaction'); }),
    options: { getSubcommand: () => 'barcodes', getBoolean: () => true },
    user: { id: actor.requestedBy, send: async () => { dm++; } } };
  await handler(request);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dm, 1);
  assert.equal(f.documents.size, 0);
  assert.equal(f.creates(), 1);
});
