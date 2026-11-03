/**
 * gmail/labels.js
 * ===============
 * Labels are the queue. A message carrying AI-Reply is waiting to be handled,
 * and moving its labels is how it leaves the queue — no separate bookkeeping.
 */

import { getAuthToken } from '../auth/getAuthToken.js';
import { request }      from '../utils/request.js';
import { CONSTANTS }    from '../utils/constants.js';

const API = CONSTANTS.GMAIL_API_BASE;

async function authHeader() {
  return { Authorization: `Bearer ${await getAuthToken()}` };
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);

/** Gmail addresses labels by id, not by the name shown in the UI. */
export async function findLabelId(name) {
  if (typeof name !== 'string' || !name || name.length > 225) throw new Error('Gmail label name invalid');
  const res = await request.get(`${API}/labels`, { headers: await authHeader() });
  if (!record(res) || !Array.isArray(res.labels) || res.labels.length > 10000
      || res.labels.some(l => !record(l) || !identifier(l.id) || typeof l.name !== 'string')) {
    throw new Error('Gmail labels response invalid');
  }
  const matches = res.labels.filter(l => l.name === name);
  if (matches.length > 1) throw new Error('Gmail labels response invalid');
  return matches[0]?.id ?? null;
}

/** Read-only bounded enumeration, not a mailbox snapshot or processed count. */
export async function listByLabel(labelId, { maxPages = 20, maxMessages = 1000, signal } = {}) {
  if (!identifier(labelId)) throw new Error('Gmail label invalid');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100
      || !Number.isInteger(maxMessages) || maxMessages < 1 || maxMessages > 10000) {
    throw new Error('Gmail queue options invalid');
  }
  const headers = await authHeader();
  const ids = new Set();
  const tokens = new Set();
  let pageToken = '';
  const result = reason => ({ ids: [...ids], complete: reason === null, reason });
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ labelIds: labelId });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await request.get(`${API}/messages?${params}`, { headers, signal });
    if (!record(res) || (res.messages !== undefined && !Array.isArray(res.messages))
        || (res.messages?.length ?? 0) > 500
        || res.messages?.some(m => !record(m) || !identifier(m.id))
        || (res.nextPageToken !== undefined
          && (typeof res.nextPageToken !== 'string' || res.nextPageToken.length > 2048))) {
      throw new Error('Gmail queue response invalid');
    }
    for (const { id } of res.messages ?? []) {
      if (!ids.has(id) && ids.size === maxMessages) return result('message_limit');
      ids.add(id);
    }
    pageToken = res.nextPageToken ?? '';
    if (!pageToken) return result(null);
    if (tokens.has(pageToken)) return result('repeated_page_token');
    if (ids.size === maxMessages) return result('message_limit');
    tokens.add(pageToken);
  }
  return result('page_limit');
}

export async function moveLabels(messageId, { add = [], remove = [] }) {
  await request.post(`${API}/messages/${messageId}/modify`, {
    headers: await authHeader(),
    body:    { addLabelIds: add, removeLabelIds: remove },
  });
}
