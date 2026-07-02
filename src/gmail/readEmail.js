/**
 * gmail/readEmail.js
 * ==================
 * Fetches the full content of a single Gmail message by ID.
 *
 * Responsibility: raw Gmail API call → structured email object.
 * Does NOT parse the content — that is parser/'s job.
 */

import { getAuthToken } from '../auth/getAuthToken.js';
import { request }      from '../utils/request.js';
import { logger }       from '../utils/logger.js';

/**
 * @typedef {Object} Email
 * @property {string} id       - Gmail message ID
 * @property {string} subject  - Subject line
 * @property {string} from     - "From" header (e.g. "John Doe <john@example.com>")
 * @property {string} body     - Plain-text body (decoded from base64)
 * @property {string} date     - ISO 8601 date string
 */

/**
 * Fetches and decodes the full email content for a given message ID.
 *
 * TODO: implement using Gmail API — GET /gmail/v1/users/me/messages/{id}
 *       decode base64url-encoded body parts from payload.parts[].body.data
 *
 * @param {string} messageId
 * @returns {Promise<Email>}
 */
export async function readEmail(messageId) {
  logger.info(`readEmail: fetching message ${messageId}`);

  const token = await getAuthToken();
  const url   = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const raw   = await request.get(url, { headers: { Authorization: `Bearer ${token}` } });

  return parseGmailMessage(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts structured data from a raw Gmail API message object.
 *
 * @param {object} raw  Full Gmail message resource (format=full)
 * @returns {Email}
 */
function parseGmailMessage(raw) {
  const headers = raw.payload?.headers ?? [];

  const getHeader = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  return {
    id:      raw.id,
    subject: getHeader('Subject'),
    from:    getHeader('From'),
    date:    getHeader('Date'),
    body:    extractBody(raw.payload),
  };
}

/**
 * Recursively walks Gmail message parts to find the plain-text body.
 * Gmail can nest parts (multipart/alternative inside multipart/mixed, etc.)
 *
 * @param {object} payload  raw.payload or a nested part
 * @returns {string}        decoded plain-text content, or empty string
 */
function extractBody(payload) {
  if (!payload) return '';

  // Single-part message — body is directly on payload
  if (payload.body?.data) {
    return decodeBase64url(payload.body.data);
  }

  // Multipart — recurse through parts; prefer text/plain over text/html
  if (payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (plain) return extractBody(plain);

    // Fall back to first available part
    return extractBody(payload.parts[0]);
  }

  return '';
}

/**
 * Decodes a base64url-encoded string (Gmail uses base64url, not standard base64).
 *
 * @param {string} data
 * @returns {string}
 */
function decodeBase64url(data) {
  // Replace base64url chars with standard base64 chars, then decode
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  );
}
