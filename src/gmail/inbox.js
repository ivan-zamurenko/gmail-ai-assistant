/**
 * src/gmail/inbox.js
 * ==================
 * Mail-to-Discord (owner decision MAIL-IN-DISCORD 2026-11-05): list unread
 * Inbox mail without the AI-Read label, and add that label after the owner
 * handled a message in Discord. Never sends, never marks as read, never deletes.
 */
import { CONSTANTS } from '../utils/constants.js';
import { normalizeMessage } from './mime.js';

const API = CONSTANTS.GMAIL_API_BASE;
export const READ_LABEL = 'AI-Read';
export const INBOX_QUERY = `in:inbox is:unread -label:${READ_LABEL} newer_than:3d`;
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
const clip = (value, max) => String(value ?? '').slice(0, max);

async function call(fetchImpl, token, url, init = {}) {
  const res = await fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw Object.assign(new Error(`Gmail HTTP ${res.status}`), { code: 'http', status: res.status });
  return res.json();
}

/** @returns {Promise<Array<{id, threadId, from, subject, date, text, noText}>>} newest first, at most max. */
export async function checkInbox({ token, fetchImpl = globalThis.fetch, max = 10 }) {
  const params = new URLSearchParams({ q: INBOX_QUERY, maxResults: String(Math.min(Math.max(max, 1), 20)) });
  const list = await call(fetchImpl, token, `${API}/messages?${params}`);
  const ids = (Array.isArray(list?.messages) ? list.messages : []).map(m => m?.id).filter(identifier);
  const mail = [];
  for (const id of ids) {
    const raw = await call(fetchImpl, token, `${API}/messages/${encodeURIComponent(id)}?format=full`);
    if (raw?.id !== id) continue;
    const message = normalizeMessage(raw);
    const date = Number(raw.internalDate);
    mail.push({
      id, threadId: identifier(raw.threadId) ? raw.threadId : '',
      from: clip(message.headers.from[0], 200), subject: clip(message.headers.subject[0], 200),
      date: Number.isSafeInteger(date) && date > 0 ? date : 0,
      text: clip(message.text, 3500), noText: !message.text,
    });
  }
  return mail;
}

/** Add the AI-Read label (created once if missing). Idempotent in Gmail. */
export async function markHandled({ token, messageId, fetchImpl = globalThis.fetch }) {
  if (!identifier(messageId)) throw new Error('Gmail message ID invalid');
  const labels = await call(fetchImpl, token, `${API}/labels`);
  let labelId = (Array.isArray(labels?.labels) ? labels.labels : []).find(l => l?.name === READ_LABEL)?.id;
  if (!labelId) labelId = (await call(fetchImpl, token, `${API}/labels`, { method: 'POST',
    body: JSON.stringify({ name: READ_LABEL, labelListVisibility: 'labelShow', messageListVisibility: 'show' }) })).id;
  if (!identifier(labelId)) throw new Error('Gmail label unavailable');
  await call(fetchImpl, token, `${API}/messages/${encodeURIComponent(messageId)}/modify`,
    { method: 'POST', body: JSON.stringify({ addLabelIds: [labelId] }) });
  return { labelId };
}
