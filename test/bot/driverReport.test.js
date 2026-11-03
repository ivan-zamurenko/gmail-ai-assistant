import test from 'node:test';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { reportSelection } from '../../src/depot/reportSelection.js';
import { renderDriverReport, buildDriverReportText } from '../../bot/src/driverReport.js';
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

test('driver report uses effective Eircode, current-location routes and optional map/POD without losing core', async t => {
  const report = { version: 1, state: 'ready', consNumber: '123456789', event: { ...selection(delivered), signature: delivered.signature, coords: delivered.coords }, address: { contact: 'Synthetic recipient', lines: ['1 Example Street'], town: 'Dublin', postCode: 'D02AF30', mobile: '+353000000000', email: 'hidden@example.invalid' } };
  const output = await renderDriverReport({ report });
  assert.match(output.content, /Delivery recorded/);
  assert.match(output.content, /Signed for by: Synthetic signer/);
  assert.doesNotMatch(output.content, /History|hidden@example|Goods Held/);
  const routes = output.content.match(/https:\/\/www.google.com\/maps\/dir\/\?\S+/g).map(route => new URL(route));
  assert.equal(routes.length, 2);
  assert.deepEqual(routes.map(url => url.searchParams.get('destination')), ['53,-6', 'D02AF30']);
  for (const url of routes) {
    assert.equal(url.searchParams.has('origin'), false);
    assert.equal(url.searchParams.get('api'), '1');
    assert.equal(url.searchParams.get('travelmode'), 'driving');
    assert.equal(url.searchParams.get('dir_action'), 'navigate');
  }
  assert.deepEqual(output.allowedMentions, { parse: [] });
  assert.equal(output.files[0].name, 'driver-report.jpg');
  assert.deepEqual(output.files.map(file => file.name), ['driver-report.jpg', 'open-for-whatsapp.html']);
  assert.match(output.files[1].attachment.toString(), /Synthetic recipient/);
  const manual = await renderDriverReport({ report }, { eircode: 'd01 a1f2' });
  assert.match(manual.content, /D01A1F2/);
  assert.doesNotMatch(manual.content, /D02AF30/);
  assert.doesNotMatch(manual.content, /Operator note|Map preview unavailable/);
  assert.doesNotMatch(buildDriverReportText(report, { eircode: 'D01A1F2' }), /Operator note/);
  const attempted = await renderDriverReport({ report: { ...report, event: { ...report.event, type: 'Carded' } } });
  assert.match(attempted.content, /Navigate to attempted delivery point/);
  assert.doesNotMatch(attempted.content, /Navigate to collection point/);
  const missing = await renderDriverReport({ report: { ...report, event: { ...report.event, coords: null } } });
  assert.match(missing.content, /Location unavailable/);
  assert.match(missing.content, /destination=D02AF30/);
  const invalid = await renderDriverReport({ report: { ...report, address: { ...report.address, postCode: 'zz0000' } } });
  assert.match(invalid.content, /correct Eircode/);
  assert.doesNotMatch(invalid.content, /maps\/dir|Parcel recovery/);
  assert.equal(invalid.files, undefined);
  const long = await renderDriverReport({ report: { ...report, address: { ...report.address, contact: '@everyone'.repeat(1000), lines: ['x'.repeat(4000)] } } });
  assert.ok(long.content.length <= 2000);
  assert.doesNotMatch(long.content, /@everyone/);

  const requests = [];
  const sharp = createRequire(new URL('../../bot/package.json', import.meta.url))('sharp');
  const png = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#aaddcc' } }).png().toBuffer();
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url);
    return url.includes('/geocode/')
      ? new globalThis.Response(JSON.stringify({ status: 'OK', results: [{ geometry: { location: { lat: 54, lng: -7 } } }] }), { headers: { 'content-type': 'application/json' } })
      : new globalThis.Response(png, { headers: { 'content-type': 'image/png' } });
  });
  const withMap = await renderDriverReport({ report, pod: { body: png.toString('base64') } }, { eircode: 'D01A1F2', apiKey: 'PRIVATE_MAPS_KEY' });
  assert.equal(requests.length, 2);
  assert.match(requests[0], /address=D01A1F2/);
  assert.match(requests[1], /53,-6/);
  assert.match(requests[1], /54,-7/);
  assert.deepEqual(withMap.files.map(file => file.name), ['driver-report.jpg', 'open-for-whatsapp.html']);
  assert.doesNotMatch(withMap.content, /PRIVATE_MAPS_KEY/);
  globalThis.fetch = async () => { throw new Error('PRIVATE_MAPS_KEY'); };
  t.mock.method(globalThis.console, 'warn', () => {});
  const failed = await renderDriverReport({ report, pod: { body: png.toString('base64') } }, { apiKey: 'PRIVATE_MAPS_KEY' });
  assert.match(failed.content, /destination=D02AF30/);
  assert.equal(failed.files[0].name, 'driver-report.jpg');
  assert.doesNotMatch(failed.content, /Map preview unavailable|Operator note/);
  assert.doesNotMatch(failed.content, /PRIVATE_MAPS_KEY/);
});

test('report choices retain recovery state, check ownership, and acknowledge only after successful final delivery', async () => {
  const calls = { queue: [], ack: [], edit: [], reply: [] };
  const record = { id: 'synthetic-id', args: { eircode: 'D01A1F2' }, parcel: { report: { version: 1, state: 'choose', consNumber: '123456789', candidates: [selection(delivered), selection(carded)] } } };
  let allowed = true;
  let failDelivery = false;
  const order = [];
  const handler = createInteractionHandler({ cfg: { guildId: 'guild' },
    enqueueAndWait: async task => { calls.queue.push(task); return task.args.selection ? { id: 'selected-id', args: task.args, parcel: { report: { version: 1, state: 'ready', consNumber: '123456789', event: selection(delivered), address: {} } } } : record; },
    getResult: async () => { order.push('get'); return allowed ? record : null; },
    acknowledgeResult: async id => calls.ack.push(id),
  });
  const base = { guildId: 'guild', user: { id: 'actor' }, memberPermissions: { has: () => true },
    deferReply: async () => order.push('defer'), reply: async p => calls.reply.push(p), editReply: async p => { if (failDelivery) throw new Error('synthetic delivery failure'); calls.edit.push(p); } };
  await handler({ ...base, commandName: 'report', isChatInputCommand: () => true, options: { getString: key => key === 'eircode' ? 'D01 A1F2' : '123456789' } });
  assert.equal(calls.queue[0].args.eircode, 'D01A1F2');
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
  assert.equal(calls.queue.at(-1).args.eircode, 'D01A1F2');
  assert.match(calls.edit.at(-1).content, /D01A1F2/);
  const recovery = createResultRecovery({ listResults: async () => [record], acknowledgeResult: async id => calls.ack.push(id), cfg: {} });
  await recovery({ ...base, isButton: () => false, options: { getString: () => '123456789' } });
  assert.equal(calls.ack.length, 2, 'recovered choices remain unacknowledged');
  assert.ok(calls.edit.at(-1).components.length);
  const ready = { id: 'recovered-id', args: { choiceTaskId: record.id, eircode: 'D01A1F2' }, parcel: { report: { version: 1, state: 'ready', consNumber: '123456789', event: selection(delivered), address: {} } } };
  const recoverReady = createResultRecovery({ listResults: async () => [ready], acknowledgeResult: async id => calls.ack.push(id), cfg: {} });
  await recoverReady({ ...base, isButton: () => false, options: { getString: () => '123456789' } });
  assert.deepEqual(calls.ack.slice(-2), ['recovered-id', 'synthetic-id']);
  assert.match(calls.edit.at(-1).content, /D01A1F2/);
  const queued = calls.queue.length;
  await handler({ ...base, commandName: 'report', isChatInputCommand: () => true, options: { getString: key => key === 'eircode' ? 'zz0000' : '123456789' } });
  assert.equal(calls.queue.length, queued);
  assert.match(calls.reply.at(-1).content, /Eircode/);
});
