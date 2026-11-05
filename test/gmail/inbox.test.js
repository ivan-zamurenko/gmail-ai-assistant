import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { checkInbox, markHandled } from '../../src/gmail/inbox.js';

const body = text => Buffer.from(text).toString('base64url');
function gmail(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null });
    const route = routes.find(([pattern]) => pattern.test(String(url)));
    return { ok: true, json: async () => route[1](String(url), init) };
  };
  return { calls, fetchImpl };
}

test('inbox check reads unread Inbox mail without AI-Read and never changes it', async () => {
  const { calls, fetchImpl } = gmail([
    [/messages\?/, () => ({ messages: [{ id: 'm1' }] })],
    [/messages\/m1\?format=full/, () => ({ id: 'm1', threadId: 't1', internalDate: '1793900000000', payload: {
      mimeType: 'text/plain', headers: [{ name: 'From', value: 'Jane <jane@example.com>' }, { name: 'Subject', value: 'Parcel 123456789' }],
      body: { data: body('Where is my parcel 123456789?') } } })],
  ]);
  const mail = await checkInbox({ token: 't', fetchImpl });
  const query = new globalThis.URL(calls[0].url).searchParams.get('q');
  assert.match(query, /in:inbox/);
  assert.match(query, /is:unread/);
  assert.match(query, /-label:AI-Read/);
  assert.deepEqual(mail.map(m => [m.id, m.from, m.subject, m.text]), [['m1', 'Jane <jane@example.com>', 'Parcel 123456789', 'Where is my parcel 123456789?']]);
  assert.ok(calls.every(call => call.method === 'GET'));
});

test('handled mail only gets the AI-Read label (created once), never read/sent', async () => {
  const { calls, fetchImpl } = gmail([
    [/labels$/, (url, init) => (init.method === 'POST' ? { id: 'L9' } : { labels: [{ id: 'INBOX', name: 'INBOX' }] })],
    [/messages\/m1\/modify/, () => ({})],
  ]);
  await markHandled({ token: 't', messageId: 'm1', fetchImpl });
  assert.deepEqual(calls.filter(c => c.method === 'POST').map(c => [c.url.replace(/.*\/v1\/users\/me/, ''), c.body]), [
    ['/labels', { name: 'AI-Read', labelListVisibility: 'labelShow', messageListVisibility: 'show' }],
    ['/messages/m1/modify', { addLabelIds: ['L9'] }],
  ]);
  assert.ok(!calls.some(c => /send|drafts|trash/.test(c.url)));
});
