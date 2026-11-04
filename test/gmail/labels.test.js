import test from 'node:test';
import assert from 'node:assert/strict';

import { useChrome, useFetch } from '../helpers/harness.js';
import { loadFixture } from '../helpers/fixtures.js';
import { NETWORK_BLOCKED } from '../helpers/networkGuard.js';
import { findLabelId, listByLabel, moveLabels } from '../../src/gmail/labels.js';
import { initGmailFlow } from '../../src/popup/gmailFlow.js';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const fixture = await loadFixture('gmail-labels.json');

test('findLabelId resolves the exact label name with the identity token', async (t) => {
  const chrome = useChrome(t, { token: 'synthetic-token-1' });
  const net = useFetch(t, [
    { url: `${API}/labels`, json: { labels: fixture.labels } },
    { url: `${API}/labels`, json: { labels: fixture.labels } },
  ]);

  assert.equal(await findLabelId('AI-Reply'), 'Label_SYN_1');
  assert.equal(await findLabelId('ai-reply'), null, 'label match must be exact');

  assert.deepEqual(chrome.tokenRequests, [{ interactive: true }, { interactive: true }]);
  assert.equal(net.calls[0].method, 'GET');
  assert.equal(net.calls[0].headers.Authorization, 'Bearer synthetic-token-1');
  assert.deepEqual(net.unexpected, []);
});

test('listByLabel enumerates unique ids across pages and distinguishes an empty queue', async (t) => {
  const chrome = useChrome(t);
  const net = useFetch(t, [
    { url: `${API}/messages?labelIds=Label_SYN_1`, json: { messages: fixture.messages, nextPageToken: 'page-2', resultSizeEstimate: 999 } },
    { url: `${API}/messages?labelIds=Label_SYN_1&pageToken=page-2`, json: { messages: [{ id: 'msg-syn-002' }, { id: 'msg-syn-003' }], nextPageToken: 'page-3' } },
    { url: `${API}/messages?labelIds=Label_SYN_1&pageToken=page-3`, json: { messages: [{ id: 'msg-syn-004' }] } },
    { url: `${API}/messages?labelIds=Label_SYN_2`, json: { resultSizeEstimate: 0 } },
  ]);

  assert.deepEqual(await listByLabel('Label_SYN_1'), {
    ids: ['msg-syn-001', 'msg-syn-002', 'msg-syn-003', 'msg-syn-004'], complete: true, reason: null,
  });
  assert.deepEqual(await listByLabel('Label_SYN_2'), { ids: [], complete: true, reason: null });
  assert.equal(chrome.tokenRequests.length, 2, 'one authentication per enumeration');
  assert.ok(net.calls.every(call => call.method === 'GET'));
  assert.deepEqual(net.unused(), []);
});

test('label mutations require the gmail.modify permission', async (t) => {
  const chrome = useChrome(t);
  const net = useFetch(t, []);
  await assert.rejects(moveLabels('msg-syn-001', { add: ['Label_SYN_2'] }), /permission is missing/);
  assert.deepEqual(net.calls, []);
  assert.deepEqual(chrome.tokenRequests, []);
});

test('a non-2xx Gmail response is an error carrying the status', async (t) => {
  useChrome(t);
  useFetch(t, [
    { url: `${API}/labels`, status: 403, json: {} },
    { url: `${API}/labels`, status: 401, json: {} },
  ]);

  await assert.rejects(findLabelId('AI-Reply'), /HTTP 403/);
  await assert.rejects(findLabelId('AI-Reply'), /HTTP 401/);
});

test('an identity failure stops before any Gmail request', async (t) => {
  useChrome(t, { tokenError: 'synthetic: user not signed in' });
  const net = useFetch(t, []);

  await assert.rejects(findLabelId('AI-Reply'), /user not signed in/);
  assert.deepEqual(net.calls, []);
  assert.deepEqual(net.unexpected, []);
});

test('an unlisted Gmail endpoint is refused by the harness', async (t) => {
  useChrome(t);
  const net = useFetch(t, []);

  await assert.rejects(listByLabel('Label_SYN_1'), { code: NETWORK_BLOCKED });
  assert.deepEqual(net.unexpected, [{ method: 'GET', url: `${API}/messages?labelIds=Label_SYN_1` }]);
});


test('Gmail enumeration bounds loops/size and rejects malformed responses without writes', async (t) => {
  useChrome(t);
  const base = `${API}/messages?labelIds=Label_SYN_1`;
  const net = useFetch(t, [
    { url: base, json: { messages: [{ id: 'a' }], nextPageToken: 'repeat' } },
    { url: `${base}&pageToken=repeat`, json: { messages: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'repeat' } },
    { url: base, json: { messages: [{ id: 'a' }], nextPageToken: 'more' } },
    { url: base, json: { messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } },
    { url: base, json: { messages: [{ id: 'a' }, { id: 'a' }] } },
    { url: base, json: { messages: [{ id: null }] } },
    { url: base, json: { messages: 'PRIVATE_MARKER' } },
    { url: base, json: { nextPageToken: {} } },
    { url: base, status: 403, json: {} },
    { url: `${API}/labels`, json: { labels: 'PRIVATE_MARKER' } },
  ]);
  assert.deepEqual(await listByLabel('Label_SYN_1'), { ids: ['a', 'b'], complete: false, reason: 'repeated_page_token' });
  assert.deepEqual(await listByLabel('Label_SYN_1', { maxPages: 1 }), { ids: ['a'], complete: false, reason: 'page_limit' });
  assert.deepEqual(await listByLabel('Label_SYN_1', { maxMessages: 2 }), { ids: ['a', 'b'], complete: false, reason: 'message_limit' });
  assert.deepEqual(await listByLabel('Label_SYN_1', { maxMessages: 1 }), { ids: ['a'], complete: true, reason: null });
  for (let i = 0; i < 3; i++) await assert.rejects(listByLabel('Label_SYN_1'), /^Error: Gmail queue response invalid$/);
  await assert.rejects(listByLabel('Label_SYN_1'), /HTTP 403/);
  await assert.rejects(findLabelId('AI-Reply'), /^Error: Gmail labels response invalid$/);
  const before = net.calls.length;
  for (const options of [{ maxPages: 0 }, { maxMessages: Infinity }, { maxPages: 101 }, { maxMessages: 10001 }]) {
    await assert.rejects(listByLabel('Label_SYN_1', options), /Gmail queue options invalid/);
  }
  await assert.rejects(listByLabel(null), /Gmail label invalid/);
  assert.equal(net.calls.length, before);
  assert.ok(net.calls.every(call => call.method === 'GET'));
  assert.deepEqual(net.unused(), []);
});

test('actual Gmail UI separates missing label, empty queue, partial enumeration and API failure', async (t) => {
  useChrome(t);
  const base = `${API}/messages?labelIds=Label_SYN_1`;
  const label = { labels: fixture.labels };
  const net = useFetch(t, [
    { url: `${API}/labels`, json: { labels: [] } },
    { url: `${API}/labels`, json: label }, { url: base, json: {} },
    { url: `${API}/labels`, json: label }, { url: base, json: { messages: [{ id: 'a' }], nextPageToken: 'again', resultSizeEstimate: 10000 } },
    { url: `${base}&pageToken=again`, json: { messages: [{ id: 'a' }], nextPageToken: 'again' } },
    { url: `${API}/labels`, status: 403, json: {} },
  ]);
  const element = () => ({ textContent: '', hidden: false, className: '', classList: { add() {} } });
  const ui = { gmailStatusDot: element(), gmailStatusLabel: element(), gmailMessage: element(), checkLabelBtn: {
    disabled: false, addEventListener(_event, callback) { this.click = callback; },
  } };
  initGmailFlow(ui);
  await ui.checkLabelBtn.click();
  assert.equal(ui.gmailStatusLabel.textContent, 'Label not found');
  assert.match(ui.gmailMessage.textContent, /AI-Reply/);
  await ui.checkLabelBtn.click();
  assert.equal(ui.gmailStatusLabel.textContent, 'Queue empty');
  await ui.checkLabelBtn.click();
  assert.equal(ui.gmailStatusLabel.textContent, 'At least 1 email(s) found');
  assert.match(ui.gmailMessage.textContent, /Partial list/);
  assert.doesNotMatch(ui.gmailMessage.textContent, /10000/);
  await ui.checkLabelBtn.click();
  assert.equal(ui.gmailStatusLabel.textContent, 'Error');
  assert.match(ui.gmailMessage.textContent, /403/);
  assert.equal(ui.checkLabelBtn.disabled, false);
  assert.ok(net.calls.every(call => call.method === 'GET'));
  assert.deepEqual(net.unused(), []);
});
