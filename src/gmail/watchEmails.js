/**
 * gmail/watchEmails.js
 * ====================
 * Polls Gmail for new unread emails and triggers the processing pipeline
 * for each one via processEmail().
 *
 * Responsibility: list new message IDs → delegate each to processEmail.
 * Does NOT read email content — that is readEmail()'s job.
 */

import { logger } from '../utils/logger.js';

/**
 * Fetches new unread message IDs from Gmail and processes each one.
 * Called on every alarm tick from background.js.
 *
 * @returns {Promise<void>}
 */
export async function watchEmails() {
  // TODO: Gmail auto-reply feature not yet implemented — skip everything
  logger.info('watchEmails: email processing not yet implemented — skipping');
}

