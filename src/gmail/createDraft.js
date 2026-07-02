/**
 * gmail/createDraft.js
 * ====================
 * Creates a Gmail draft reply to a given message.
 *
 * Responsibility: encode the reply as RFC 2822, POST it to the Gmail API.
 * Does NOT decide what the reply says — that is ai/'s job.
 */

import { logger } from '../utils/logger.js';

/**
 * Creates a Gmail draft that replies to the original message.
 *
 * TODO: implement using Gmail API — POST /gmail/v1/users/me/drafts
 *       Body must be a base64url-encoded RFC 2822 message with
 *       In-Reply-To and References headers set to originalMessageId.
 *
 * @param {string} originalMessageId  The Gmail message ID to reply to
 * @param {string} replyText          Plain-text body for the draft
 * @returns {Promise<{ draftId: string }>}
 */
export async function createDraft(originalMessageId, replyText) {
  logger.info(`createDraft: creating draft reply for message ${originalMessageId}`);

  // const token      = await getAuthToken();
  // const encoded    = encodeRFC2822({ originalMessageId, replyText });
  // const response   = await request.post(
  //   'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
  //   { headers: { Authorization: `Bearer ${token}` }, body: { message: { raw: encoded } } }
  // );
  // return { draftId: response.id };

  return { draftId: '' }; // stub
}
