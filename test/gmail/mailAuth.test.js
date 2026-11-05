import test from 'node:test';
import assert from 'node:assert/strict';

import { createMailAuth } from '../../src/auth/mailAuth.js';

function memory() {
  const data = {};
  return { data, get: async key => ({ [key]: data[key] }), set: async value => Object.assign(data, value), remove: async key => { delete data[key]; } };
}
const setup = (email, flows = []) => {
  const storage = memory();
  const auth = createMailAuth({ storage, clientId: 'c', account: 'Depot22@gmail.com', redirectUri: 'https://x.chromiumapp.org/', now: () => 1000,
    identity: { launchWebAuthFlow: async opts => { flows.push(opts); return 'https://x.chromiumapp.org/#access_token=T&expires_in=3600'; } },
    fetchImpl: async () => ({ ok: true, json: async () => ({ emailAddress: email }) }) });
  return { auth, storage, flows };
};

test('work mailbox token is used only when Gmail confirms the configured account', async () => {
  const wrong = setup('me.personal@gmail.com');
  await assert.rejects(wrong.auth.getToken(), { code: 'wrong_account' });
  assert.deepEqual(wrong.storage.data, {});

  const flows = [];
  const right = setup('depot22@gmail.com', flows);
  assert.equal(await right.auth.getToken(), 'T');
  assert.equal(await right.auth.getToken(), 'T');
  assert.equal(flows.length, 1, 'cached until expiry');
  const url = new globalThis.URL(flows[0].url);
  assert.equal(url.searchParams.get('login_hint'), 'depot22@gmail.com');
  assert.equal(url.searchParams.get('prompt'), 'none');
  assert.equal(flows[0].interactive, false);

  const missing = createMailAuth({ storage: memory(), clientId: '', account: '', redirectUri: '' });
  await assert.rejects(missing.getToken(), { code: 'not_configured' });
});
