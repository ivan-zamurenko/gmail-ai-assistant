/**
 * src/gmail/drafts.js
 * ===================
 * Creates one reply draft for a message approved by the reply policy (S05-05).
 * Never sends: the only Gmail endpoints used are drafts.create, threads.get
 * (reconcile after a lost response) and messages.modify (labels, after success).
 */
import { CONSTANTS } from '../utils/constants.js';

const API = CONSTANTS.GMAIL_API_BASE;
const inFlight = new Map();

const header = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const base64url = text => globalThis.btoa(unescape(encodeURIComponent(text)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function rawReply({ to, subject, messageIdHeader, references, body }) {
  const re = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const refs = [references, messageIdHeader].filter(Boolean).join(' ');
  return [
    `To: ${header(to)}`,
    `Subject: ${header(re)}`,
    ...(messageIdHeader ? [`In-Reply-To: ${header(messageIdHeader)}`, `References: ${header(refs)}`] : []),
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n');
}

async function call(fetchImpl, token, url, init = {}) {
  const res = await fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw Object.assign(new Error(`Gmail HTTP ${res.status}`), { code: 'http', status: res.status });
  return res.json();
}

async function draftExists(fetchImpl, token, threadId, messageIdHeader) {
  const thread = await call(fetchImpl, token, `${API}/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=In-Reply-To`);
  return (thread.messages ?? []).some(m => (m.labelIds ?? []).includes('DRAFT')
    && (m.payload?.headers ?? []).some(h => /^in-reply-to$/i.test(h.name) && h.value === messageIdHeader));
}

/**
 * @returns {Promise<{ status: 'created'|'uncertain'|'failed'|'refused', draftId?: string, reconciled?: boolean, labelError?: string }>}
 */
export function createReplyDraft({ message, decision, body, token, labels, fetchImpl = globalThis.fetch }) {
  if (decision?.decision !== 'draft' || !decision.to || !message?.messageId || !message.threadId || typeof body !== 'string' || !body) {
    return Promise.resolve({ status: 'refused' });
  }
  // A second click for the same message joins the first request instead of creating a duplicate.
  if (inFlight.has(message.messageId)) return inFlight.get(message.messageId);
  const messageIdHeader = message.headers?.messageId?.[0] ?? '';
  const run = (async () => {
    let result;
    try {
      const raw = base64url(rawReply({ to: decision.to, subject: message.headers?.subject?.[0] ?? '', messageIdHeader,
        references: message.headers?.references?.[0] ?? '', body }));
      const draft = await call(fetchImpl, token, `${API}/drafts`, { method: 'POST', body: JSON.stringify({ message: { raw, threadId: message.threadId } }) });
      result = { status: 'created', draftId: draft.id };
    } catch (err) {
      if (err.code === 'http') return { status: 'failed' };
      // The create may have reached Gmail: look before anyone retries.
      const found = messageIdHeader ? await draftExists(fetchImpl, token, message.threadId, messageIdHeader).catch(() => null) : null;
      if (!found) return { status: 'uncertain' };
      result = { status: 'created', reconciled: true };
    }
    if (labels?.queue && labels?.done) {
      try {
        await call(fetchImpl, token, `${API}/messages/${encodeURIComponent(message.messageId)}/modify`,
          { method: 'POST', body: JSON.stringify({ addLabelIds: [labels.done], removeLabelIds: [labels.queue] }) });
      } catch {
        result.labelError = 'Draft created; label not updated';
      }
    }
    return result;
  })().finally(() => inFlight.delete(message.messageId));
  inFlight.set(message.messageId, run);
  return run;
}
