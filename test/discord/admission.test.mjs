import test from 'node:test';
import assert from 'node:assert/strict';
import { createInteractionHandler } from '../../bot/src/interactions.js';
import { commands } from '../../bot/src/commands.js';

function fixture({ command = 'reschedule', sub = 'all', guild = 'synthetic-guild', admin = true,
  values = {}, options, userId = 'synthetic-actor', queueResult, queueError } = {}) {
  const calls = { queue: [], todo: [], reply: [], defer: [], edit: [], dm: [] };
  const interaction = {
    isChatInputCommand: () => true,
    commandName: command, guildId: guild,
    memberPermissions: { has: () => admin },
    user: { id: userId, send: async value => calls.dm.push(value) },
    options: options ?? {
      getSubcommand: () => sub,
      getBoolean: key => values[key] ?? null,
      getString: key => values[key] ?? null,
      getInteger: key => values[key] ?? null,
    },
    reply: async value => calls.reply.push(value),
    deferReply: async value => calls.defer.push(value),
    editReply: async value => calls.edit.push(value),
  };
  const handler = createInteractionHandler({
    cfg: { guildId: 'synthetic-guild' },
    enqueueAndWait: async (...args) => {
      calls.queue.push(args);
      if (queueError) throw queueError;
      return queueResult ?? { status: 'done', summary: 'Synthetic result' };
    },
    buildParcelEmbed: async () => ({ content: 'Synthetic parcel' }),
    addTodo: async (...args) => { calls.todo.push(['add', ...args]); },
    listTodos: async (...args) => { calls.todo.push(['list', ...args]); return []; },
    markDone: async (...args) => { calls.todo.push(['done', ...args]); return null; },
    clearDone: async (...args) => { calls.todo.push(['clear', ...args]); return 0; },
    renderList: () => 'Synthetic list',
  });
  return { calls, interaction, run: () => handler(interaction) };
}

function assertDenied(calls) {
  assert.equal(calls.queue.length, 0);
  assert.equal(calls.todo.length, 0);
  assert.equal(calls.defer.length, 0);
  assert.equal(calls.reply.length, 1);
  assert.equal(calls.reply[0].flags, 64);
  assert.doesNotMatch(JSON.stringify(calls), /SYNTHETIC_SECRET/);
}

test('wrong guild and non-admin depot actors are denied before effects', async () => {
  for (const command of ['find', 'reschedule', 'todo', 'result']) {
    const h = fixture({ command, guild: 'other-guild' });
    await h.run();
    assertDenied(h.calls);
  }
  for (const command of ['find', 'reschedule', 'result']) {
    const h = fixture({ command, admin: false });
    await h.run();
    assertDenied(h.calls);
  }
});

test('registered depot modes enqueue once with safe defaults and explicit false confirmation', async () => {
  const schema = commands.map(command => command.toJSON());
  assert.deepEqual(schema.map(command => command.name), ['reschedule', 'find', 'todo', 'result']);
  assert.equal(schema[0].default_member_permissions, '8');
  assert.equal(schema[1].default_member_permissions, '8');
  assert.ok(!schema[2].default_member_permissions);
  const date = new Date();
  do date.setDate(date.getDate() + 1);
  while ([0, 6].includes(date.getDay()));
  const future = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  for (const option of schema[0].options) {
    assert.ok(!option.options.some(value => value.name === 'confirm_live'));
    for (const dryRun of [undefined, true, false]) {
      const h = fixture({ sub: option.name, values: { dry_run: dryRun, con_id: '123456789', new_date: future } });
      await h.run();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(h.calls.queue.length, 1, option.name);
      const [task] = h.calls.queue[0];
      assert.equal(task.args.mode, option.name);
      assert.equal(task.args.dryRun, dryRun ?? true);
      assert.equal(task.requestedBy, 'synthetic-actor');
      assert.equal(h.calls.defer[0].flags, 64);
      if (option.name === 'barcodes') assert.equal(h.calls.dm.length, 1);
    }
  }
  const h = fixture({ command: 'find', values: { con_id: '123456789' } });
  await h.run();
  assert.equal(h.calls.queue.length, 1);
  assert.deepEqual(h.calls.queue[0][0], { command: 'find', args: { conId: '123456789' }, requestedBy: 'synthetic-actor' });
  assert.equal(h.calls.defer[0].flags, 64);
});

test('todo schema routes without admin and uses only interaction user identity', async () => {
  const subs = commands.find(command => command.name === 'todo').toJSON().options;
  for (const { name } of subs) {
    const h = fixture({ command: 'todo', sub: name, admin: false,
      values: { text: 'Synthetic task', number: 1, userId: 'other-user' } });
    await h.run();
    assert.equal(h.calls.queue.length, 0);
    assert.equal(h.calls.todo.length, 1);
    assert.equal(h.calls.todo[0][0], name);
    assert.equal(h.calls.todo[0][1], 'synthetic-actor');
    assert.equal(h.calls.defer[0].flags, 64);
    assert.equal(h.calls.edit.length, 1);
  }
});

test('unknown commands and subcommands are rejected without enqueue or unfinished defer', async () => {
  for (const input of [
    { command: 'SYNTHETIC_SECRET' },
    { sub: 'SYNTHETIC_SECRET' },
    { command: 'todo', sub: 'SYNTHETIC_SECRET' },
  ]) {
    const h = fixture(input);
    await h.run();
    assertDenied(h.calls);
  }
});

test('malformed options and actor return safe errors before side effects', async () => {
  const broken = new Proxy({}, { get() { throw new Error('SYNTHETIC_SECRET'); } });
  for (const input of [
    { options: broken },
    { command: 'find', options: broken },
    { command: 'todo', options: broken },
    { values: { dry_run: 'SYNTHETIC_SECRET' } },
    { command: 'find', values: { con_id: 'SYNTHETIC_SECRET' } },
    { command: 'find', values: { con_id: 123456789 } },
    { sub: 'parcel', values: { con_id: 123456789, new_date: '2099-01-01' } },
    { sub: 'parcel', values: { con_id: '123456789', new_date: 'SYNTHETIC_SECRET' } },
    { sub: 'parcel', values: { con_id: '123456789', new_date: 20990101 } },
    { command: 'todo', sub: 'add', values: { text: {} } },
    { command: 'todo', sub: 'add', values: { text: '  ' } },
    { command: 'todo', sub: 'done', values: { number: 0 } },
    { command: 'todo', sub: 'done', values: { number: '1' } },
    { command: 'todo', sub: 'list', userId: '' },
  ]) {
    const h = fixture(input);
    await h.run();
    assertDenied(h.calls);
  }
});


test('find diagnostics omit tracking, provider errors and raw tab metadata', async () => {
  const previous = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args);
  try {
    const found = fixture({ command: 'find', values: { con_id: '123456789' }, queueResult: {
      status: 'done', execMs: 1,
      parcel: { timing: { search: 'synthetic-secret', detail: 2, scans: 3 }, _diag: [{ err: 'synthetic-secret' }] },
    } });
    await found.run();
    assert.deepEqual(found.calls.edit, [{ content: 'Synthetic parcel' }]);
    assert.doesNotMatch(JSON.stringify(logs), /6789|synthetic-secret/);
    const failed = fixture({ command: 'find', values: { con_id: '123456789' },
      queueError: new Error('<html>synthetic-secret UID=synthetic-user</html>') });
    await failed.run();
    assert.deepEqual(failed.calls.edit, ['⚠️ Discord operation failed']);
  } finally { console.log = previous; }
});
