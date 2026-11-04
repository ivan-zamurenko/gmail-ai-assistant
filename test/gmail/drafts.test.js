import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createReplyDraft } from '../../src/gmail/drafts.js';
import { buildDraftText } from '../../src/workflow/draftTemplate.js';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const message = { messageId: 'm1', threadId: 't1', headers: { subject: ['Where is my parcel'], messageId: ['<orig@example.com>'], references: [] } };
const decision = { decision: 'draft', to: 'jane@example.com' };
const labels = { queue: 'L_Q', done: 'L_D' };

function fakeGmail({ createFails, threadHasDraft = false, modifyFails = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ method: init.method ?? 'GET', url, body: init.body });
    const json = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
    if (url === `${API}/drafts`) {
      if (createFails === 'network') throw new TypeError('lost');
      if (createFails === 'http') return json({}, false);
      return json({ id: 'd1' });
    }
    if (url.startsWith(`${API}/threads/t1`)) return json({ messages: threadHasDraft
      ? [{ labelIds: ['DRAFT'], payload: { headers: [{ name: 'In-Reply-To', value: '<orig@example.com>' }] } }] : [] });
    if (url === `${API}/messages/m1/modify`) return json({}, !modifyFails);
    throw new Error(`unexpected ${url}`);
  };
  return { calls, fetchImpl };
}

test('reply draft: one create in the same thread, labels after success, never send', async () => {
  const g = fakeGmail();
  const [a, b] = await Promise.all([1, 2].map(() => createReplyDraft({ message, decision, body: 'Hello', token: 't', labels, fetchImpl: g.fetchImpl })));
  assert.deepEqual([a, b], [{ status: 'created', draftId: 'd1' }, { status: 'created', draftId: 'd1' }]);
  assert.deepEqual(g.calls.map(c => `${c.method} ${c.url.replace(API, '')}`), ['POST /drafts', 'POST /messages/m1/modify']);
  const sent = JSON.parse(g.calls[0].body);
  const raw = Buffer.from(sent.message.raw, 'base64url').toString();
  assert.equal(sent.message.threadId, 't1');
  assert.match(raw, /^To: jane@example.com\r\nSubject: Re: Where is my parcel\r\nIn-Reply-To: <orig@example.com>\r\nReferences: <orig@example.com>/);
  assert.deepEqual(JSON.parse(g.calls[1].body), { addLabelIds: ['L_D'], removeLabelIds: ['L_Q'] });

  const lost = fakeGmail({ createFails: 'network', threadHasDraft: true });
  assert.deepEqual(await createReplyDraft({ message, decision, body: 'Hi', token: 't', labels, fetchImpl: lost.fetchImpl }),
    { status: 'created', reconciled: true });
  const unknown = fakeGmail({ createFails: 'network' });
  assert.deepEqual(await createReplyDraft({ message, decision, body: 'Hi', token: 't', labels, fetchImpl: unknown.fetchImpl }), { status: 'uncertain' });
  assert.equal(unknown.calls.some(c => c.url.includes('/modify')), false, 'labels stay while the result is uncertain');
  const labelFails = fakeGmail({ modifyFails: true });
  assert.equal((await createReplyDraft({ message, decision, body: 'Hi', token: 't', labels, fetchImpl: labelFails.fetchImpl })).labelError,
    'Draft created; label not updated');
  assert.deepEqual(await createReplyDraft({ message, decision: { decision: 'review' }, body: 'Hi', token: 't', fetchImpl: g.fetchImpl }), { status: 'refused' });
  for (const fake of [g, lost, unknown, labelFails]) assert.equal(fake.calls.some(c => /\/send\b/.test(c.url)), false);
});

test('draft text states depot facts only', () => {
  const text = buildDraftText({ consignments: [
    { consNumber: '123456789', plannedDate: '05/11/2026', scans: [
      { type: 'CAD scan', date: '04/11/2026', time: '06:54:56' }, { type: 'Received into depot', date: '03/11/2026', time: '18:38:18' }] },
    { consNumber: '987654321' },
  ] });
  assert.match(text, /Parcel 123456789:\n- Latest update: CAD scan on 04\/11\/2026 at 06:54\.\n- Scheduled delivery date: 05\/11\/2026\./);
  assert.match(text, /Parcel 987654321:\n- We are checking the latest information/);
  assert.doesNotMatch(text, /compensat|guarantee|will be delivered/i);
});
