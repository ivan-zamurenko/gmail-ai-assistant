import { Buffer } from 'node:buffer';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resultReport } from '../../src/queue/resultDetails.js';
import { createRescheduleViews, rescheduleLines } from '../../bot/src/rescheduleViews.js';

test('reschedule pages retain every row, bind actor/channel and expire without depot replay', async () => {
  const escaped = resultReport(Array(4000).fill('"\\'.repeat(300)));
  assert.ok(rescheduleLines(escaped), 'producer output must pass consumer serialized size bound');
  assert.ok(Buffer.byteLength(JSON.stringify(escaped.parcel)) < 800000);
  let clock = 1000;
  const views = createRescheduleViews({ now: () => clock });
  const actor = { user: { id: 'owner' }, guildId: 'guild', channelId: 'channel', createdTimestamp: clock };
  const result = { summary: 'Preview', parcel: { rescheduleResults: { version: 1, lines: Array.from({ length: 35 }, (_, i) => `row ${i} — SKIP ${'x'.repeat(120)}`) } } };
  let payload = views.open(result, actor), denied = 0;
  const seen = [payload.content];
  const click = { ...actor, reply: async () => { denied++; }, deferUpdate: async () => {}, editReply: async p => { payload = p; } };
  const next = () => payload.components[0]?.toJSON().components.find(b => b.label === 'Далі →')?.custom_id;
  await views.handle({ ...click, customId: next(), user: { id: 'other' } });
  await views.handle({ ...click, customId: next(), channelId: 'other' });
  assert.equal(denied, 2);
  while (next()) { await views.handle({ ...click, customId: next() }); seen.push(payload.content); }
  for (let i = 0; i < 35; i++) assert.ok(seen.some(s => s.includes(`row ${i} —`)));
  assert.ok(seen.every(s => s.length <= 2000));
  clock += 14 * 60_000;
  await views.handle({ ...click, customId: payload.components[0].toJSON().components[0].custom_id });
  assert.equal(denied, 3);
  views.close();
});

test('reschedule and /result navigate snapshots without enqueue or ACK on page clicks', async () => {
  const { createInteractionHandler } = await import('../../bot/src/interactions.js');
  const result = { id: 'synthetic-result', command: 'reschedule', summary: 'Preview', status: 'done',
    parcel: { rescheduleResults: { version: 1, lines: Array.from({ length: 30 }, (_, i) => `row ${i} ${'x'.repeat(120)}`) } } };
  let enqueued = 0, acked = 0, payload, privateFlag;
  const handler = createInteractionHandler({ cfg: { guildId: 'guild' }, enqueueAndWait: async () => { enqueued++; return result; },
    buildParcelEmbed: () => assert.fail('reschedule must never render as find'), acknowledgeResult: async () => { acked++; }, getResult: async () => result });
  const base = { user: { id: 'owner' }, guildId: 'guild', channelId: 'channel', memberPermissions: { has: () => true },
    options: { getSubcommand: () => 'all', getBoolean: () => true }, isChatInputCommand: () => true, isButton: () => false,
    deferReply: async p => { privateFlag = p.flags; }, editReply: async p => { payload = p; } };
  await handler({ ...base, commandName: 'reschedule' });
  assert.ok(privateFlag); assert.equal(acked, 1);
  const id = payload.components[0].toJSON().components[0].custom_id;
  await handler({ ...base, isChatInputCommand: () => false, isButton: () => true, customId: id, deferUpdate: async () => {} });
  assert.match(payload.content, /Сторінка 2/); assert.equal(enqueued, 1); assert.equal(acked, 1);
  let denied = false;
  await handler({ ...base, isChatInputCommand: () => false, isButton: () => true, customId: id, memberPermissions: { has: () => false }, reply: async () => { denied = true; } });
  assert.equal(denied, true);
  await handler({ ...base, isChatInputCommand: () => false, isButton: () => true, customId: 'result:show:synthetic-result' });
  assert.match(payload.content, /Сторінка 1/); assert.equal(enqueued, 1); assert.equal(acked, 2);
});
