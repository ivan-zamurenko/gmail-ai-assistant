/**
 * gmail/createDraft.js
 * ====================
 * Creates a Gmail draft reply to a given message.
 *
 * Responsibility: encode the reply as RFC 2822, POST it to the Gmail API.
 * Does NOT decide what the reply says — that is ai/'s job.
 *
 * Threading note:
 *   Passing threadId alone is not enough. Gmail also needs In-Reply-To and
 *   References headers, otherwise the reply opens a separate conversation
 *   in most non-Gmail clients.
 */

import { getAuthToken } from '../auth/getAuthToken.js';
import { request }      from '../utils/request.js';
import { logger }       from '../utils/logger.js';
import { CONSTANTS }    from '../utils/constants.js';

/**
 * Creates a Gmail draft that replies to the original message.
 *
 * @param {import('./readEmail.js').Email} email  The message being replied to
 * @param {string} replyText                      Plain-text body for the draft
 * @returns {Promise<{ draftId: string }>}
 */
export async function createDraft(email, replyText) {
  const token = await getAuthToken();
  const mime  = buildReplyMime(email, replyText);

  const res = await request.post(`${CONSTANTS.GMAIL_API_BASE}/drafts`, {
    headers: { Authorization: `Bearer ${token}` },
    body: {
      message: {
        threadId: email.threadId,
        raw:      encodeBase64url(mime),
      },
    },
  });

  logger.info(`createDraft: draft ${res.id} created for message ${email.id}`);
  return { draftId: res.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assembles the raw RFC 2822 reply.
 *
 * @param {import('./readEmail.js').Email} email
 * @param {string} replyText
 * @returns {string}
 */
function buildReplyMime(email, replyText) {
  const subject = email.subject.toLowerCase().startsWith('re:')
    ? email.subject
    : `Re: ${email.subject}`;

  const headers = [
    `To: ${email.from}`,
    `Subject: ${encodeHeader(subject)}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ];

  // Absent on malformed messages — threading degrades gracefully without it.
  if (email.messageIdHeader) {
    headers.push(`In-Reply-To: ${email.messageIdHeader}`);
    headers.push(`References: ${email.messageIdHeader}`);
  }

  return `${headers.join('\r\n')}\r\n\r\n${replyText}`;
}

/**
 * Encodes a header value per RFC 2047 when it contains non-ASCII characters.
 * Raw UTF-8 in headers renders as mojibake in many mail clients.
 *
 * @param {string} value
 * @returns {string}
 */
function encodeHeader(value) {
  const isAscii = [...value].every((ch) => ch.charCodeAt(0) < 128);
  if (isAscii) return value;
  return `=?UTF-8?B?${encodeBase64(value)}?=`;
}

/**
 * @param {string} str
 * @returns {string} standard base64
 */
function encodeBase64(str) {
  // btoa() only accepts single-byte values, so UTF-8 text must be expanded
  // to one byte per character before encoding.
  const bytes  = new TextEncoder().encode(str);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary);
}

/**
 * @param {string} str
 * @returns {string} base64url — the variant Gmail's `raw` field expects
 */
function encodeBase64url(str) {
  return encodeBase64(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
