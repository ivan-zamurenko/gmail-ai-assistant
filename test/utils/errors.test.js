import test from 'node:test';
import assert from 'node:assert/strict';

import { safeErrorMessage as extensionError } from '../../src/utils/errors.js';
import { safeErrorMessage as botError } from '../../bot/src/errors.js';

test('outbound errors redact URLs and sensitive query values', () => {
  const input = new Error(
    'HTTP 500: http://depot.interlink.local/x?session=secret&UID=user&key=maps',
  );
  for (const sanitize of [extensionError, botError]) {
    const output = sanitize(input);
    assert.doesNotMatch(output, /secret|maps|depot\.interlink/i);
  }
});


test('diagnostics expose only controlled reason, code and HTTP status', () => {
  for (const sanitize of [extensionError, botError]) {
    const raw = new Error('<html>session=synthetic-secret UID=synthetic-user Bearer synthetic-token {"customer":"synthetic-customer"}</html>');
    raw.code = 'permission-denied';
    assert.equal(sanitize(raw, 'Lookup failed'), 'Lookup failed [permission-denied]');
    assert.equal(sanitize(new Error(sanitize(raw)), 'Queue failed'), 'Queue failed [permission-denied]');
    assert.equal(sanitize(new Error('HTTP 403: synthetic-secret'), 'Drive failed'), 'Drive failed (HTTP 403)');
    assert.equal(sanitize(new Error('unknown synthetic-secret'), 'Lookup failed'), 'Lookup failed');
    const guidance = 'Розширення почало виконання, але результат не підтверджено. Не повторюй live-команду автоматично.';
    assert.equal(sanitize(new Error(guidance)), guidance);
  }
});


test('popup displays a controlled error and restores its button after provider failure', async () => {
  const { initSettingsFlow } = await import('../../src/popup/settingsFlow.js');
  const previous = globalThis.chrome;
  const element = () => ({ addEventListener(name, fn) { this[name] = fn; } });
  const browseDriveBtn = element();
  const messages = [];
  globalThis.chrome = {
    identity: { getAuthToken(_options, callback) { callback(); } },
    runtime: { lastError: { message: '<html>synthetic-secret UID=synthetic-user</html>' } },
  };
  try {
    initSettingsFlow({
      geminiKeyInput: element(), driveFolderInput: element(), browseDriveBtn,
      driveFolderPicker: element(), saveSettingsBtn: element(),
      onBrowseError: message => messages.push(message),
    });
    await browseDriveBtn.click();
    assert.deepEqual(messages, ['Browse failed: Drive browse failed']);
    assert.equal(browseDriveBtn.disabled, false);
  } finally {
    if (previous === undefined) delete globalThis.chrome;
    else globalThis.chrome = previous;
  }
});
