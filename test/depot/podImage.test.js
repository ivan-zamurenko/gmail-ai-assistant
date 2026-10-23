import test from 'node:test';
import assert from 'node:assert/strict';

import { useFetch } from '../helpers/harness.js';
import { fetchPodImage } from '../../src/depot/podImage.js';

const AUTHORIZE = 'https://api2.dpd.ie/common/api/authorize';
const IMAGE = 'https://papi.dpd.ie/pw/rs/mwcon/webresources/consignment/event/image/';
const AUTH = { user: 'synthetic-user', password: 'synthetic-pass', type: 'HO' };

test('POD image is fetched from the extension with exact authorize and image requests', async (t) => {
  const net = useFetch(t, [
    { method: 'POST', url: AUTHORIZE, json: { AccessToken: 'synthetic-access', TokenType: 'Bearer' } },
    { method: 'POST', url: IMAGE, json: { Image: [{ ImgType: 'POD', ImgBody: '/9j/synthetic' }] } },
  ]);

  const result = await fetchPodImage('123456', AUTH);

  assert.deepEqual(result, { image: { mime: 'image/jpeg', body: '/9j/synthetic' } });
  assert.deepEqual(net.calls.map((c) => [c.method, c.url]), [['POST', AUTHORIZE], ['POST', IMAGE]]);
  assert.equal(net.calls[0].headers.Authorization, `Basic ${globalThis.btoa('synthetic-user:synthetic-pass')}`);
  assert.deepEqual(net.calls[0].body, { User: 'synthetic-user', Password: 'synthetic-pass', Type: 'HO' });
  assert.equal(net.calls[1].headers.Authorization, 'Bearer synthetic-access');
  assert.deepEqual(net.calls[1].body, { ImgType: 'POD', EventID: '123456', Original: false });
  assert.deepEqual(net.unexpected, []);
});

test('missing configuration or a malformed event id stops before any request', async (t) => {
  const net = useFetch(t, []);

  assert.deepEqual(await fetchPodImage('', AUTH), { error: 'POD event ID is missing' });
  assert.deepEqual(await fetchPodImage('12a', AUTH), { error: 'POD event ID is invalid' });
  assert.deepEqual(await fetchPodImage('123', { user: 'u' }), { error: 'POD authorization is not configured' });
  assert.deepEqual(await fetchPodImage('123', undefined), { error: 'POD authorization is not configured' });
  assert.deepEqual(net.calls, []);
  assert.deepEqual(net.unexpected, []);
});

test('POD failures return safe errors without credentials or tokens', async (t) => {
  useFetch(t, [
    { method: 'POST', url: AUTHORIZE, status: 401, json: {} },
    { method: 'POST', url: AUTHORIZE, json: {} },
    { method: 'POST', url: AUTHORIZE, json: { AccessToken: 'synthetic-access' } },
    { method: 'POST', url: IMAGE, json: { Status: 'NOT FOUND <b>', Image: [] } },
  ]);

  const errors = [
    await fetchPodImage('1', AUTH),
    await fetchPodImage('2', AUTH),
    await fetchPodImage('3', AUTH),
  ].map((r) => r.error);

  assert.deepEqual(errors, [
    'POD authorize HTTP 401',
    'POD authorization returned no access token',
    'POD image unavailable (NOTFOUNDb, 0 image records)',
  ]);
  for (const message of errors) assert.doesNotMatch(message, /synthetic-(pass|user)|synthetic-access/);
});

test('a network failure becomes a generic POD error', async (t) => {
  const net = useFetch(t, []);
  const result = await fetchPodImage('4', AUTH);
  assert.deepEqual(result, { error: 'POD request failed' });
  assert.deepEqual(net.unexpected, [{ method: 'POST', url: AUTHORIZE }]);
});
