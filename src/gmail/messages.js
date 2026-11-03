import { requireCapability } from '../config/capabilities.js';
/** Read one explicitly selected message; no attachments, label changes or writes. */
import { getAuthToken } from '../auth/getAuthToken.js';
import { request } from '../utils/request.js';
import { CONSTANTS } from '../utils/constants.js';
import { normalizeMessage } from './mime.js';

export async function getMessage(messageId, { signal } = {}) {
  if (typeof messageId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(messageId)) {
    throw new Error('Gmail message ID invalid');
  }
  requireCapability('gmailRead', { manifest: chrome.runtime.getManifest() });
  const token = await getAuthToken();
  const raw = await request.get(`${CONSTANTS.GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}?format=full`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  if (raw?.id !== messageId) {
    return { ...normalizeMessage(null), messageId, reason: 'identity_mismatch' };
  }
  return normalizeMessage(raw);
}
