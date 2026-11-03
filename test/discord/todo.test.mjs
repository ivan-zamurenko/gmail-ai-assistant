import test from 'node:test';
import assert from 'node:assert/strict';
import { createTodoService, renderList, todoErrorMessage } from '../../bot/src/todoService.js';
import { createInteractionHandler } from '../../bot/src/interactions.js';

const stamp = n => ({ toMillis: () => n });
function fixture() {
  const documents = new Map();
  let clock = 10000;
  let nextId = 0;
  let intercept;
  const failed = new Set();
  const snapshot = id => ({ id, exists: documents.has(id), data: () => documents.get(id) });
  const doc = id => ({ id,
    get: async () => snapshot(id),
    set: async data => documents.set(id, data),
    update: async patch => documents.set(id, { ...documents.get(id), ...patch }),
    delete: async () => { if (failed.has(id)) throw new Error('PRIVATE_MARKER'); documents.delete(id); },
  });
  const db = { collection(name) {
    assert.equal(name, 'todos', 'checklist cannot access queue or other collections');
    return { doc, where(field, operation, value) {
      assert.equal(field, 'userId'); assert.equal(operation, '==');
      const query = { cap: Infinity, limit(n) { this.cap = n; return this; }, get: async () => ({
        docs: [...documents].filter(([, item]) => item.userId === value).slice(0, query.cap).map(([id]) => snapshot(id)),
      }) };
      return query;
    } };
  }, runTransaction: async fn => {
    intercept?.(); intercept = null;
    const writes = [];
    const result = await fn({ get: ref => ref.get(),
      update: (ref, patch) => writes.push(() => ref.update(patch)),
      delete: ref => writes.push(() => ref.delete()),
    });
    for (const write of writes) await write();
    return result;
  } };
  const service = () => createTodoService({ db, serverTimestamp: () => stamp(clock), randomId: () => `new-${++nextId}`, now: () => clock });
  return { documents, failed, service, advance(n) { clock += n; }, beforeTransaction(fn) { intercept = fn; } };
}
const row = (userId, text, time = 10, done = false) => ({ userId, text, done, createdAt: stamp(time) });

test('todo service scopes ownership, preserves displayed IDs, and reports partial clear safely', async () => {
  assert.equal(todoErrorMessage({ code: 'toString' }), null);

  const f = fixture();
  const service = f.service();
  f.documents.set('second', row('owner', 'Second', 20));
  f.documents.set('first', row('owner', 'First', 10, true));
  f.documents.set('foreign', row('other', 'PRIVATE_MARKER', 1, true));
  const shown = await service.listTodos('owner');
  assert.deepEqual(shown.map(item => item.text), ['First', 'Second']);
  service.rememberTodoList('owner', shown);
  f.documents.delete('first'); // clear in another session shifts current positions
  assert.equal((await service.markDone('owner', 2)).text, 'Second');
  assert.equal(f.documents.get('second').done, true);
  await assert.rejects(f.service().markDone('owner', 1), { code: 'todo-relist' });
  for (const number of [0, -1, 1.5, Infinity, 99]) assert.equal(await service.markDone('owner', number), null);

  f.documents.set('second', { ...row('owner', 'Second', 20), id: 'foreign' });
  service.rememberTodoList('owner', await service.listTodos('owner'));
  f.beforeTransaction(() => { f.documents.get('second').userId = 'other'; });
  await assert.rejects(service.markDone('owner', 1), { code: 'todo-relist' });
  assert.equal(f.documents.get('second').done, false);
  assert.equal(f.documents.get('foreign').text, 'PRIVATE_MARKER');

  f.documents.set('done-ok', row('owner', 'Done', 10, true));
  f.documents.set('done-fail', row('owner', 'Fail', 20, true));
  f.documents.set('pending', row('owner', 'Pending', 30));
  f.failed.add('done-fail');
  assert.deepEqual(await service.clearDone('owner'), { removed: 1, failed: 1 });
  assert.equal(f.documents.has('pending'), true);
  assert.equal(f.documents.has('foreign'), true);
  assert.equal(f.documents.has('done-fail'), true);
  f.failed.clear();
  f.beforeTransaction(() => { f.documents.get('done-fail').done = false; });
  assert.deepEqual(await service.clearDone('owner'), { removed: 0, failed: 0 });
  assert.equal(f.documents.has('done-fail'), true);

  for (const text of ['', ' ', 'x'.repeat(501), null]) await assert.rejects(service.addTodo('owner', text), { code: 'todo-text-invalid' });
  await service.addTodo('owner', '  New task  ');
  assert.equal([...f.documents.values()].find(item => item.text === 'New task').userId, 'owner');
  f.documents.set('no-time', { userId: 'owner', text: 'No time', done: false });
  const listed = await service.listTodos('owner');
  assert.equal(listed.at(-1).id, 'no-time');
  assert.match(renderList(listed), /без дати/);
  service.rememberTodoList('owner', listed);
  f.advance(600001);
  await assert.rejects(service.markDone('owner', 1), { code: 'todo-relist' });
});

test('actual todo handler bounds replies, suppresses mentions, and records only delivered list snapshots', async () => {
  const f = fixture();
  const service = f.service();
  for (let i = 0; i < 25; i++) f.documents.set(`item-${i}`, row('owner', '@everyone **task**\n'.repeat(25), i));
  let remembered = 0;
  const replies = [];
  let rejectReply = false;
  const handler = createInteractionHandler({ cfg: { guildId: 'guild' }, ...service, renderList,
    rememberTodoList: (...args) => { remembered++; service.rememberTodoList(...args); },
    enqueueAndWait: () => { throw new Error('Checklist must not enqueue'); },
  });
  const interaction = (sub, value) => ({
    isChatInputCommand: () => true, commandName: 'todo', guildId: 'guild', user: { id: 'owner' },
    options: { getSubcommand: () => sub, getString: () => value, getInteger: () => value },
    deferReply: async options => assert.equal(options.flags, 64),
    reply: async payload => replies.push(payload),
    editReply: async payload => { if (rejectReply) throw new Error('PRIVATE_MARKER'); replies.push(payload); },
  });
  await handler(interaction('list'));
  assert.equal(remembered, 1);
  assert.ok(replies[0].content.length <= 1900);
  assert.match(replies[0].content, /20.*25/);
  assert.deepEqual(replies[0].allowedMentions, { parse: [] });
  assert.equal(await service.markDone('owner', 21), null, 'hidden rows have no selectable number');
  await handler(interaction('add', '@everyone task'));
  await handler(interaction('done', 1));
  await handler(interaction('clear'));
  assert.ok(replies.every(payload => payload.content.length <= 1900 && payload.allowedMentions.parse.length === 0));
  rejectReply = true;
  await assert.rejects(handler(interaction('list')));
  assert.equal(remembered, 1, 'failed Discord delivery does not replace numbering snapshot');
});
