import test from 'node:test';
import assert from 'node:assert/strict';

import { maskContacts, proposeReply } from '../../bot/src/aiReply.js';

const parcel = { consNumber: '123456789', scans: [
  { parcel: '1', type: 'At Depot', date: '01/11/2026', time: '06:00:00' },
  { parcel: '1', type: 'Delivered', date: '02/11/2026', time: '12:30:00', route: 'R1', signature: 'PRIVATE' },
] };
const ollama = content => async (url, init) => {
  const body = JSON.parse(init.body);
  ollama.last = { url, body };
  return { ok: true, json: async () => ({ message: { content: JSON.stringify(content) } }) };
};

test('contacts are masked before the prompt; the consignment number is kept', () => {
  const text = 'Parcel 123456789. Call me 087 123 4567 or +353 87 765 4321, mail jane.doe@example.com, D02 X285.';
  const masked = maskContacts(text, ['123456789']);
  assert.match(masked, /123456789/);
  assert.doesNotMatch(masked, /087|765 4321|jane\.doe|X285/);
});

test('grounded reply passes; false date, wrong number or a promise is rejected', async () => {
  const good = await proposeReply({ parcel, query: '123456789', text: 'Where is it? jane@example.com',
    fetch: ollama({ reply_text: 'Your parcel 123456789 was delivered on 02/11/2026.', needs_human: false }) });
  assert.equal(good.status, 'ok');
  const sent = JSON.stringify(ollama.last.body);
  assert.doesNotMatch(sent, /jane@example\.com|PRIVATE|R1/);
  assert.match(sent, /02\/11\/2026/);

  for (const [reply, reason] of [
    ['Delivered on 03/11/2026.', 'unsupported_date'],
    ['Parcel 987654321 was delivered.', 'unsupported_number'],
    ['We guarantee delivery tomorrow.', 'unsupported_commitment'],
    ['It is scheduled to be delivered soon.', 'unsupported_commitment'],
    ['We have rescheduled your parcel.', 'action_claim'],
  ]) {
    const result = await proposeReply({ parcel, query: '123456789', text: 'Hi', fetch: ollama({ reply_text: reply, needs_human: false }) });
    assert.deepEqual([result.status, result.reason], ['rejected', reason], reply);
  }
  const down = await proposeReply({ parcel, query: '123456789', text: 'Hi', fetch: async () => { throw new Error('ECONNREFUSED secret'); } });
  assert.deepEqual([down.status, down.reason], ['error', 'model_unavailable']);
});

test('/reply view marks rejected proposals and never claims a send', async () => {
  const { renderReply } = await import('../../bot/src/interactions.js');
  const view = renderReply({ status: 'rejected', reason: 'unsupported_date', model: 'm', factCount: 2, replyText: 'x' }, parcel);
  assert.match(view, /Відхилено/);
  assert.match(view, /Нічого не надіслано/);
});
