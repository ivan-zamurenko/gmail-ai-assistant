/**
 * gmail/watchEmails.js
 * ====================
 * Polls Gmail for new unread emails and triggers the processing pipeline
 * for each one via processEmail().
 *
 * Responsibility: list new message IDs → delegate each to processEmail.
 * Does NOT read email content — that is readEmail()'s job.
 */

import { processEmail } from '../workflow/processEmail.js';
import { logger }       from '../utils/logger.js';
import { CONSTANTS }    from '../utils/constants.js';

/**
 * Fetches new unread message IDs from Gmail and processes each one.
 * Called on every alarm tick from background.js.
 *
 * @returns {Promise<void>}
 */
export async function watchEmails() {
  logger.info('watchEmails: checking for new emails...');

  const messageIds = await listNewMessageIds();

  if (messageIds.length === 0) {
    logger.info('watchEmails: no new emails');
    return;
  }

  logger.info(`watchEmails: found ${messageIds.length} new email(s)`);

  for (const id of messageIds) {
    try {
      await processEmail(id);
    } catch (err) {
      // Log and continue — one failed email must not block the rest
      logger.error(`watchEmails: failed to process message ${id}`, err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lists unread Gmail message IDs from the INBOX.
 * TODO: implement using Gmail API — GET /gmail/v1/users/me/messages
 *       with query q="is:unread in:inbox" and maxResults limit.
 *
 * @returns {Promise<string[]>}
 */
async function listNewMessageIds() {
  // const token  = await getAuthToken();
  // const url    = `https://gmail.googleapis.com/gmail/v1/users/me/messages`
  //              + `?q=is:unread+in:inbox&maxResults=${CONSTANTS.GMAIL_MAX_RESULTS}`;
  // const result = await request.get(url, { headers: { Authorization: `Bearer ${token}` } });
  // return (result.messages ?? []).map(m => m.id);

  return []; // stub
}
