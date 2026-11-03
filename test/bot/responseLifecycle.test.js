import test from 'node:test';
import assert from 'node:assert/strict';
import { createResponseLifecycle } from '../../bot/src/responseLifecycle.js';

function fixture() {
  let time = 1000;
  const timers = [], warnings = [];
  const wrap = createResponseLifecycle({ now: () => time,
    schedule: (fn, delay) => { timers.push({ fn, delay }); return { unref() {} }; },
    warn: code => warnings.push(code) });
  return { wrap, timers, warnings, advance: ms => { time += ms; } };
}

test('private replies expire from interaction creation without extending edits or losing late results silently', async () => {
  const f = fixture(); let deleted = 0, edited = 0;
  const raw = { createdTimestamp: 1000, user: {}, deferReply: async () => {},
    editReply: async () => { edited++; }, deleteReply: async () => { deleted++; } };
  const i = f.wrap(raw);
  f.advance(2000);
  await i.deferReply({ flags: 64 });
  assert.equal(f.timers.length, 1);
  assert.equal(f.timers[0].delay, 838000);
  await i.editReply('progress');
  assert.equal(f.timers.length, 1);
  f.advance(838000);
  await f.timers[0].fn();
  assert.equal(deleted, 1);
  assert.equal(i.autoCleanupExpired, true);
  await assert.rejects(i.editReply('late result'), /Response window expired/);
  assert.equal(edited, 1);
  const denied = f.wrap({ createdTimestamp: 841000, user: {}, reply: async () => { throw new Error('send failure'); } });
  await assert.rejects(denied.reply({ flags: 64 }));
  assert.equal(f.timers.length, 1, 'failed replies do not schedule deletion');
});

test('normal messages and DMs use30min; private followups use token deadline; cleanup failure stays contained', async () => {
  const f = fixture(); let removed = 0;
  const message = { flags: { bitfield: 0 }, delete: async () => { removed++; } };
  const i = f.wrap({ createdTimestamp: 1000, user: { send: async () => message }, reply: async () => {},
    fetchReply: async () => message,
    followUp: async () => ({ flags: { bitfield: 64 }, id: 'synthetic' }),
    webhook: { deleteMessage: async () => { throw new Error('PRIVATE_TOKEN'); } } });
  await i.reply('normal');
  await i.user.send('DM');
  assert.deepEqual(f.timers.map(t => t.delay), [1800000, 1800000]);
  await f.timers[0].fn(); await f.timers[1].fn();
  assert.equal(removed, 2);
  f.advance(60000);
  await i.followUp({ content: 'private' });
  assert.equal(f.timers[2].delay, 780000);
  await f.timers[2].fn();
  assert.deepEqual(f.warnings, ['[cleanup] DELETE_FAILED']);
});
