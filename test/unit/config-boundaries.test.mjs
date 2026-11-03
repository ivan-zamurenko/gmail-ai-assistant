import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { processDriveLabels } from '../../src/depot/driveLabels.js';

// Compile real loaders with synthetic local.js; never import/read private config.
async function loader(entry, local, missing = false, accountMode = null) {
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm',
    define: { 'import.meta.url': JSON.stringify(new URL(`../../${entry}`, import.meta.url).href) },
    plugins: [{ name: 'synthetic-config', setup(b) {
      if (accountMode) {
        b.onResolve({ filter: /^(node:fs|firebase-admin)$/ }, args => ({ path: args.path, namespace: 'account' }));
        b.onLoad({ filter: /.*/, namespace: 'account' }, args => ({ contents: args.path === 'node:fs'
          ? `export function readFileSync(path) { ${accountMode === 'json' ? 'return "PRIVATE_MARKER";' : 'return JSON.stringify({ observedPath: path });'} }`
          : `let credential; export default { credential: { cert(value) { ${accountMode === 'sdk' ? 'throw new Error("PRIVATE_MARKER");' : 'return value;'} } }, initializeApp(value) { credential = value.credential; }, firestore() { return credential; } };`
        }));
      }
      b.onResolve({ filter: /\/local\.js$/ }, () => ({ path: 'local', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: missing ? 'throw new Error("PRIVATE_MARKER"); export const LOCAL = {};' : `export const LOCAL = ${JSON.stringify(local)};`,
      }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const validBot = {
  discordToken: 'synthetic-token', applicationId: '123456789012345678', guildId: '234567890123456789',
  firebase: { serviceAccountPath: 'config/serviceAccount.json', executorUid: 'synthetic-executor' },
  googleMapsApiKey: '', legacy: 'keep',
};
function safeFailure(fn) {
  assert.throws(fn, error => error.message.startsWith('Config ') && !error.message.includes('PRIVATE_MARKER'));
}

test('bot config refuses missing/placeholder/wrong shape safely before any startup', async () => {
  const good = await loader('bot/config/config.js', validBot);
  assert.deepEqual(good.loadConfig(), validBot);
  for (const local of [null, [], {}, ...['discordToken', 'applicationId', 'guildId'].flatMap(key =>
    [null, 42, ' ', 'YOUR_PRIVATE_MARKER'].map(value => ({ ...validBot, [key]: value }))),
  { ...validBot, firebase: [] },
  ...['serviceAccountPath', 'executorUid'].flatMap(key => [42, ' ', 'YOUR_PRIVATE_MARKER'].map(value =>
    ({ ...validBot, firebase: { ...validBot.firebase, [key]: value } }))),
  { ...validBot, googleMapsApiKey: {} }]) {
    const mod = await loader('bot/config/config.js', local);
    safeFailure(() => mod.loadConfig());
  }
  const firebase = await loader('bot/src/firebase.js', validBot, false, 'valid');
  assert.equal(firebase.db.observedPath, new URL('../../bot/config/serviceAccount.json', import.meta.url).pathname);
  for (const mode of ['json', 'sdk']) {
    await assert.rejects(loader('bot/src/firebase.js', validBot, false, mode), error =>
      error.message === 'Config firebase service account invalid — check the configured JSON file');
  }
  await assert.rejects(loader('bot/config/config.js', {}, true), error =>
    error.message.startsWith('Config ') && !error.message.includes('PRIVATE_MARKER'));
});

test('extension optional config and Drive folder input fail before external work', async t => {
  const minimal = await loader('src/config/config.js', {});
  assert.equal(minimal.loadConfig().driveFolderId, '');
  const local = { driveFolderId: 'https://drive.google.com/drive/u/0/folders/synthetic-folder?usp=sharing',
    firebase: { apiKey: '', projectId: '' }, podAuth: { user: '', password: '', type: 'HO' }, legacy: 'keep' };
  const mod = await loader('src/config/config.js', local);
  assert.equal(mod.loadConfig().driveFolderId, 'synthetic-folder');
  assert.equal(mod.loadConfig().podAuth.basicAuthorization, undefined, 'omitted header preserves provider fallback');
  assert.deepEqual(minimal.getContact(), { brand: '', email: '', phone: '' });
  const contact = await loader('src/config/config.js', { contact: { brand: 'Synthetic' } });
  assert.equal(contact.getContact().phone, '');
  const badContact = await loader('src/config/config.js', { contact: { phone: 42 } });
  safeFailure(() => badContact.getContact());
  for (const invalid of [null, [], { driveFolderId: 5 }, { firebase: [] }, { podAuth: 'PRIVATE_MARKER' },
    { geminiApiKey: {} }, { driveFolderId: "PRIVATE_MARKER' or trashed=false" }]) {
    const bad = await loader('src/config/config.js', invalid);
    safeFailure(() => bad.loadConfig());
  }
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('network must not run'); });
  for (const folderInput of [null, 42, '', "PRIVATE_MARKER' or trashed=false", 'https://evil.invalid/folders/abc',
    'https://drive.google.com/folders/abc/extra', 'https://user:password@drive.google.com/folders/abc']) {
    await assert.rejects(processDriveLabels({ folderInput, token: 'synthetic-token' }), /Config driveFolderId invalid/);
  }
  assert.equal(calls, 0);
});
