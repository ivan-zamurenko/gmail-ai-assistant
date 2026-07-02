/**
 * gmail/sendReply.js
 * ==================
 * Sends an existing draft immediately via the Gmail API.
 *
 * Responsibility: one API call — send the draft.
 * Only called when the user has explicitly enabled auto-send in settings
 * (draftMode: false). Default behaviour is createDraft only.
 */

import { logger } from '../utils/logger.js';

/**
 * Sends an existing Gmail draft.
 *
 * TODO: implement using Gmail API — POST /gmail/v1/users/me/drafts/send
 *       with body { "id": draftId }
 *
 * @param {string} draftId
 * @returns {Promise<void>}
 */
export async function sendReply(draftId) {
  logger.info(`sendReply: sending draft ${draftId}`);

  // const token = await getAuthToken();
  // await request.post(
  //   'https://gmail.googleapis.com/gmail/v1/users/me/drafts/send',
  //   { headers: { Authorization: `Bearer ${token}` }, body: { id: draftId } }
  // );
}
