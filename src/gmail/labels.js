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

/** Gmail addresses labels by id, not by the name shown in the UI. */
export async function findLabelId(name) {
  const { labels } = await request.get(`${API}/labels`, { headers: await authHeader() });
  return labels.find((l) => l.name === name)?.id ?? null;
}

/** @returns {Promise<string[]>} message ids carrying the label */
export async function listByLabel(labelId) {
  const res = await request.get(`${API}/messages?labelIds=${labelId}`, {
    headers: await authHeader(),
  });
  return (res.messages ?? []).map((m) => m.id);
}

export async function moveLabels(messageId, { add = [], remove = [] }) {
  await request.post(`${API}/messages/${messageId}/modify`, {
    headers: await authHeader(),
    body:    { addLabelIds: add, removeLabelIds: remove },
  });
}
