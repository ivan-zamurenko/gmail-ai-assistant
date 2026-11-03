import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCapabilities, capabilitySummary, requireCapability } from '../../src/config/capabilities.js';
import { findLabelId, moveLabels } from '../../src/gmail/labels.js';
import { useChrome, useFetch } from '../helpers/harness.js';

const manifest = { permissions: ['identity'], oauth2: { scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/drive'] } };
test('capabilities separate implementation/config/permission/verification and guard actual Gmail operations', async t => {
  const config = { geminiApiKey: 'PRIVATE_MARKER', driveFolderId: 'synthetic-folder' };
  const capabilities = getCapabilities({ config, manifest });
  assert.equal(capabilities.aiReply.status, 'unsupported');
  assert.equal(capabilities.gmailRead.status, 'external_unverified');
  assert.equal(capabilities.driveLabels.status, 'external_unverified');
  assert.equal(getCapabilities({ config: {}, manifest }).driveLabels.status, 'missing_config');
  assert.equal(getCapabilities({ config, manifest: {} }).gmailRead.status, 'missing_permission');
  assert.doesNotMatch(capabilitySummary({ config, manifest }), /PRIVATE_MARKER|ready/i);
  assert.equal(config.geminiApiKey, 'PRIVATE_MARKER');
  assert.throws(() => requireCapability('aiReply', { config, manifest }), /not available/);
  assert.throws(() => requireCapability('invented', { config, manifest }), /not available/);
  assert.doesNotThrow(() => requireCapability('gmailRead', { manifest }));
  useChrome(t);
  globalThis.chrome.runtime.getManifest = () => ({});
  const net = useFetch(t, []);
  await assert.rejects(findLabelId('AI-Reply'), /permission is missing/);
  globalThis.chrome.runtime.getManifest = () => manifest;
  await assert.rejects(moveLabels('synthetic', { add: ['Label_SYN'] }), /not available/);
  assert.deepEqual(net.calls, []);
  assert.deepEqual(net.unexpected, []);
});
