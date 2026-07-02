/**
 * gmail/readEmail.js
 * ==================
 * Fetches the full content of a single Gmail message by ID.
 *
 * Responsibility: raw Gmail API call → structured email object.
 * Does NOT parse the content — that is parser/'s job.
 */

import { logger } from '../utils/logger.js';

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

  // const token = await getAuthToken();
  // const url   = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  // const raw   = await request.get(url, { headers: { Authorization: `Bearer ${token}` } });
  // return parseGmailMessage(raw);

  // Stub — returns a minimal email shape so downstream code can run
  return {
    id:      messageId,
    subject: '',
    from:    '',
    body:    '',
    date:    new Date().toISOString(),
  };
}
