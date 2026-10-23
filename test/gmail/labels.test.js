import test from 'node:test';
import assert from 'node:assert/strict';

import { useChrome, useFetch } from '../helpers/harness.js';
import { loadFixture } from '../helpers/fixtures.js';
import { NETWORK_BLOCKED } from '../helpers/networkGuard.js';
import { findLabelId, listByLabel, moveLabels } from '../../src/gmail/labels.js';

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

test('listByLabel returns message ids and an empty list when Gmail omits messages', async (t) => {
  useChrome(t);
  const net = useFetch(t, [
    { url: `${API}/messages?labelIds=Label_SYN_1`, json: { messages: fixture.messages } },
    { url: `${API}/messages?labelIds=Label_SYN_2`, json: { resultSizeEstimate: 0 } },
  ]);

  assert.deepEqual(await listByLabel('Label_SYN_1'), ['msg-syn-001', 'msg-syn-002']);
  assert.deepEqual(await listByLabel('Label_SYN_2'), []);
  assert.deepEqual(net.unused(), []);
});

test('moveLabels posts the exact modify payload', async (t) => {
  useChrome(t, { token: 'synthetic-token-2' });
  const net = useFetch(t, [
    { method: 'POST', url: `${API}/messages/msg-syn-001/modify`, json: { id: 'msg-syn-001' } },
  ]);

  await moveLabels('msg-syn-001', { add: ['Label_SYN_2'], remove: ['Label_SYN_1'] });

  assert.deepEqual(net.calls, [{
    method: 'POST',
    url: `${API}/messages/msg-syn-001/modify`,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-token-2' },
    body: { addLabelIds: ['Label_SYN_2'], removeLabelIds: ['Label_SYN_1'] },
  }]);
});

test('a non-2xx Gmail response is an error carrying the status', async (t) => {
  useChrome(t);
  useFetch(t, [
    { method: 'POST', url: `${API}/messages/msg-syn-002/modify`, status: 403, json: {} },
    { url: `${API}/labels`, status: 401, json: {} },
  ]);

  await assert.rejects(moveLabels('msg-syn-002', { add: ['Label_SYN_2'] }), /HTTP 403/);
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
