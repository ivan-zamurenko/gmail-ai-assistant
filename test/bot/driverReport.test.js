import test from 'node:test';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { reportSelection } from '../../src/depot/reportSelection.js';
import { renderDriverReport } from '../../bot/src/driverReport.js';
import { executeTask } from '../../src/queue/executor.js';
import { createResultRecovery } from '../../bot/src/resultRecovery.js';
import { createInteractionHandler } from '../../bot/src/interactions.js';

const delivered = { parcel: '1', type: 'Delivered', date: '01/11/2026', time: '12:00:00', eventId: '111', signature: 'Synthetic signer', coords: { lat: 53, lng: -6 } };
const carded = { ...delivered, parcel: '2', type: 'Carded', eventId: '222', signature: '', coords: { lat: 54, lng: -7 } };
const selection = ({ parcel, type, date, time }) => ({ parcel, type, date, time });

test('report selects one exact parcel/event and never borrows later unrelated GPS or photo', async (t) => {
  const scans = [delivered, carded, { ...delivered, type: 'Goods Held', coords: { lat: 55, lng: -8 } }];
  const choices = reportSelection(scans);
  assert.equal(choices.candidates.length, 2);
  assert.doesNotMatch(JSON.stringify(choices.candidates), /eventId|signature|coords|111|222/);
  const chosen = reportSelection(scans, selection(delivered));
  assert.equal(chosen.event, delivered);
  assert.equal(reportSelection([delivered]).event, delivered);
  assert.ok(reportSelection([delivered, { ...delivered }], selection(delivered)).error);
  assert.ok(reportSelection(scans, { ...selection(delivered), time: '13:00:00' }).error);
  assert.ok(reportSelection([{ ...delivered, date: '31/02/2026' }]).error);
  assert.ok(reportSelection([{ ...delivered, parcel: '' }]).error);
  assert.ok(reportSelection([{ ...delivered, type: 'Goods Held' }]).error);
  const original = globalThis.chrome;
  t.after(() => { if (original === undefined) delete globalThis.chrome; else globalThis.chrome = original; });
  const fullLine = 'Synthetic address '.repeat(20);
  const source = { ok: true, consNumber: '123456789', scans, address: { lines: [fullLine], contact: 'Recipient', email: 'PRIVATE_EMAIL' },
    drop: { lat: 55, lng: -8 }, podEventId: 'PRIVATE_WRONG_EVENT', pod: { body: 'PRIVATE_WRONG_PHOTO' } };
  globalThis.chrome = { tabs: { query: async () => [{ id: 7, url: 'http://synthetic.interlink.local/home' }], update: async () => ({}) }, scripting: { executeScript: async () => [{ result: [source] }] } };
  const task = { schemaVersion: 2, command: 'report', args: { conId: '123456789' } };
  const pending = await executeTask(task);
  assert.equal(pending.parcel.report.state, 'choose');
  const selected = await executeTask({ ...task, args: { ...task.args, selection: selection(carded) } });
  assert.equal(selected.parcel.report.state, 'ready');
  assert.deepEqual(selected.parcel.report.event.coords, carded.coords);
  assert.equal(selected.parcel.report.address.lines[0], fullLine);
  assert.equal(selected.parcel.pod, undefined);
  assert.doesNotMatch(JSON.stringify(selected), /PRIVATE_|eventId|email/);
  source.address.lines = ['x'.repeat(2000)];
  assert.equal((await executeTask({ ...task, args: { ...task.args, selection: selection(carded) } })).status, 'error');

});

test('driver report is copyable, bounded, event-specific and honest without GPS/POD', () => {
  const report = { version: 1, state: 'ready', consNumber: '123456789', event: { ...selection(delivered), signature: delivered.signature, coords: delivered.coords }, address: { contact: 'Synthetic recipient', lines: ['1 Example Street'], town: 'Dublin', postCode: 'D02AF30', mobile: '+353000000000', email: 'hidden@example.invalid' } };
  const output = renderDriverReport({ report });
  assert.match(output.content, /Delivery point/);
  assert.match(output.content, /Signed for by: Synthetic signer/);
  assert.doesNotMatch(output.content, /History|hidden@example|Goods Held/);
  const route = output.content.match(/https:\/\/www.google.com\/maps\/dir\/\?\S+/)[0];
  const url = new URL(route);
  assert.equal(url.searchParams.get('origin'), '53,-6');
  assert.equal(url.searchParams.get('destination'), 'D02AF30');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('travelmode'), 'driving');
  assert.deepEqual(output.allowedMentions, { parse: [] });
  assert.equal(output.files[0].name, 'pod-unavailable.png');
  const attempted = renderDriverReport({ report: { ...report, event: { ...report.event, type: 'Carded' } } });
  assert.match(attempted.content, /Attempted delivery point/);
  assert.match(attempted.content, /not confirmed/);
  assert.doesNotMatch(attempted.content, /maps\/dir/);
  const missing = renderDriverReport({ report: { ...report, event: { ...report.event, coords: null } } });
  assert.match(missing.content, /Location unavailable/);
  assert.doesNotMatch(missing.content, /maps\/dir/);
  const long = renderDriverReport({ report: { ...report, address: { contact: '@everyone'.repeat(1000), lines: ['x'.repeat(4000)] } } });
  assert.ok(long.content.length <= 2000);
  assert.doesNotMatch(long.content, /@everyone/);
});

test('report choices retain recovery state, check ownership, and acknowledge only after successful final delivery', async () => {
  const calls = { queue: [], ack: [], edit: [], reply: [] };
  const record = { id: 'synthetic-id', parcel: { report: { version: 1, state: 'choose', consNumber: '123456789', candidates: [selection(delivered), selection(carded)] } } };
  let allowed = true;
  let failDelivery = false;
  const order = [];
  const handler = createInteractionHandler({ cfg: { guildId: 'guild' },
    enqueueAndWait: async task => { calls.queue.push(task); return task.args.selection ? { id: 'selected-id', parcel: { report: { version: 1, state: 'ready', consNumber: '123456789', event: selection(delivered), address: {} } } } : record; },
    getResult: async () => { order.push('get'); return allowed ? record : null; },
    acknowledgeResult: async id => calls.ack.push(id),
  });
  const base = { guildId: 'guild', user: { id: 'actor' }, memberPermissions: { has: () => true },
    deferReply: async () => order.push('defer'), reply: async p => calls.reply.push(p), editReply: async p => { if (failDelivery) throw new Error('synthetic delivery failure'); calls.edit.push(p); } };
  await handler({ ...base, commandName: 'report', isChatInputCommand: () => true, options: { getString: () => '123456789' } });
  assert.equal(calls.queue.length, 1);
  assert.equal(calls.ack.length, 0);
  assert.ok(calls.edit[0].components.length);
  const button = { ...base, isChatInputCommand: () => false, isButton: () => true, customId: 'report:select:synthetic-id:0' };
  allowed = false;
  order.length = 0;
  await handler(button);
  assert.deepEqual(order, ['defer', 'get']);
  assert.equal(calls.queue.length, 1);
  allowed = true; failDelivery = true;
  await handler(button);
  assert.equal(calls.ack.length, 0);
  failDelivery = false;
  await handler(button);
  assert.deepEqual(calls.ack, ['selected-id', 'synthetic-id']);
  assert.deepEqual(calls.queue.at(-1).args.selection, selection(delivered));
  const recovery = createResultRecovery({ listResults: async () => [record], acknowledgeResult: async id => calls.ack.push(id), cfg: {} });
  await recovery({ ...base, isButton: () => false, options: { getString: () => '123456789' } });
  assert.equal(calls.ack.length, 2, 'recovered choices remain unacknowledged');
  assert.ok(calls.edit.at(-1).components.length);
  const ready = { id: 'recovered-id', args: { choiceTaskId: record.id }, parcel: { report: { version: 1, state: 'ready', consNumber: '123456789', event: selection(delivered), address: {} } } };
  const recoverReady = createResultRecovery({ listResults: async () => [ready], acknowledgeResult: async id => calls.ack.push(id), cfg: {} });
  await recoverReady({ ...base, isButton: () => false, options: { getString: () => '123456789' } });
  assert.deepEqual(calls.ack.slice(-2), ['recovered-id', 'synthetic-id']);
});
