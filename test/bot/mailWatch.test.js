import test from 'node:test';
import assert from 'node:assert/strict';

import { createMailStore } from '../../bot/src/mailStore.js';
import { createMailWatch } from '../../bot/src/mailWatch.js';
import { renderMailCard } from '../../bot/src/mailViews.js';

const mail = [{ id: 'm1', from: 'Jane', subject: 'Parcel 123456789', text: 'Where is it?', date: 1793900000000 }];

test('each mail is posted once; a problem is announced once and its recovery once', async () => {
  const sent = [];
  const replies = [{ status: 'done', id: 'a', parcel: { mail } }, { status: 'done', id: 'b', parcel: { mail } },
    { status: 'error', id: 'c', summary: 'Gmail не авторизовано' }, { status: 'error', id: 'd', summary: 'Gmail не авторизовано' },
    { status: 'done', id: 'e', parcel: { mail: [] } }];
  const watch = createMailWatch({ enqueueAndWait: async () => replies.shift(), acknowledgeResult: async () => true,
    getChannel: async () => ({ send: async msg => { sent.push(msg.content); return { id: `p${sent.length}` }; } }),
    store: createMailStore(), guildId: 'g' });
  for (let i = 0; i < 5; i++) await watch.poll();
  assert.equal(sent.filter(text => text.startsWith('📨')).length, 1);
  assert.equal(sent.filter(text => text.includes('не перевіряється')).length, 1);
  assert.equal(sent.filter(text => text.includes('знову перевіряється')).length, 1);
});

test('card offers AI reply only with exactly one consignment number', () => {
  const buttons = card => card.components[0].toJSON().components;
  assert.equal(buttons(renderMailCard({ ...mail[0], seenAt: 1 }))[1].disabled, false);
  assert.equal(buttons(renderMailCard({ ...mail[0], subject: 'Hi', seenAt: 1 }))[1].disabled, true);
  assert.deepEqual(buttons(renderMailCard({ ...mail[0], seenAt: 1 }, { handled: 2 })).map(b => b.custom_id), ['mail:more:m1']);
});

test('collapsed card shows sender name, subject and first sentences only', () => {
  const card = renderMailCard({ id: 'm1', from: 'Jane Doe <jane@example.com>', subject: 'Late parcel', seenAt: 1,
    text: 'Hi there. My parcel is late again! Can you check? Thanks a lot for the help, this is a long tail sentence that should not fit in.\n> old quoted reply' });
  assert.match(card.content, /\*\*Jane Doe\*\*/);
  assert.doesNotMatch(card.content, /jane@example\.com|old quoted/);
  assert.match(card.content, /> Hi there\. My parcel is late again! Can you check\?/);
  assert.match(renderMailCard({ ...mail[0], from: 'Jane <jane@example.com>', seenAt: 1 }, { expanded: true }).content, /jane@example\.com/);
});
