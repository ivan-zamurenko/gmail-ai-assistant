/** Describes local availability only; never probes a provider or reveals values. */
const GMAIL = 'https://www.googleapis.com/auth/gmail.readonly';
// Owner 2026-11-04: drafts + labels. Covers reading too; send is never called (drafts.js).
const GMAIL_MODIFY = 'https://www.googleapis.com/auth/gmail.modify';
const DRIVE = 'https://www.googleapis.com/auth/drive';
const state = (implemented, configured, permission) => ({
  implemented, configured, permission, verified: false,
  status: !implemented ? 'unsupported' : !permission ? 'missing_permission'
    : !configured ? 'missing_config' : 'external_unverified',
});

export function getCapabilities({ config = {}, manifest = {} } = {}) {
  const permissions = Array.isArray(manifest?.permissions) ? manifest.permissions : [];
  const scopes = Array.isArray(manifest?.oauth2?.scopes) ? manifest.oauth2.scopes : [];
  const identity = permissions.includes('identity');
  return {
    gmailRead: state(true, true, identity && (scopes.includes(GMAIL) || scopes.includes(GMAIL_MODIFY))),
    driveLabels: state(true, typeof config?.driveFolderId === 'string' && !!config.driveFolderId.trim(), identity && scopes.includes(DRIVE)),
    gmailModify: state(true, true, identity && scopes.includes(GMAIL_MODIFY)),
    aiReply: state(false, false, false),
  };
}

export function requireCapability(feature, options) {
  const capabilities = getCapabilities(options);
  const capability = Object.hasOwn(capabilities, feature) ? capabilities[feature] : null;
  if (!capability || capability.status === 'unsupported') throw new Error('This feature is not available yet');
  if (capability.status === 'missing_permission') throw new Error('Required extension permission is missing');
  if (capability.status === 'missing_config') throw new Error('Required local configuration is missing');
  // Allow an explicit operator action to verify auth/provider access normally.
  return capability;
}

export function capabilitySummary(options) {
  const capabilities = getCapabilities(options);
  const labels = { unsupported: 'not available yet', missing_permission: 'required permission missing',
    missing_config: 'local configuration missing', external_unverified: 'connection checked when used' };
  return `Drive labels: ${labels[capabilities.driveLabels.status]}.\nGmail reading: ${labels[capabilities.gmailRead.status]}.\nAI replies and email changes: not available yet.`;
}
