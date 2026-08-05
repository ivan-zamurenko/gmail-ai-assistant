/**
 * gmail/watchEmails.js
 * ====================
 * Polls Gmail for new unread emails and triggers the processing pipeline
 * for each one via processEmail().
 *
 * Responsibility: decide WHICH messages to process → delegate each to
 * processEmail. Does NOT read email content — that is readEmail()'s job.
 *
 * Batching:
 *   Only MAX_EMAILS_PER_TICK messages are handled per call. MV3 service
 *   workers are terminated after roughly 30 seconds of inactivity, and one
 *   message costs a Gmail fetch plus an AI round-trip. Draining a large
 *   backlog in a single pass would be killed halfway through; the alarm
 *   simply picks up the remainder on the next tick.
 */

import { listMessages }  from './listMessages.js';
import { processEmail }  from '../workflow/processEmail.js';
import { getProcessedIds, markProcessed } from '../storage/processedStore.js';
import { getSettings }   from '../storage/settings.js';
import { logger }        from '../utils/logger.js';
import { CONSTANTS }     from '../utils/constants.js';

/**
 * Fetches new unread message IDs from Gmail and processes each one.
 * Called on every alarm tick from background.js.
 *
 * @param {{ force?: boolean }} [options]  force bypasses the autoProcess setting,
 *                                        used by the popup's "Run now" button
 * @returns {Promise<{ processed: number, failed: number, skipped: number }>}
 */
export async function watchEmails({ force = false } = {}) {
  const settings = await getSettings();

  if (!settings.autoProcess && !force) {
    logger.info('watchEmails: auto-process is off — skipping');
    return { processed: 0, failed: 0, skipped: 0 };
  }

  const ids       = await listMessages();
  const processed = await getProcessedIds();
  const pending   = ids.filter((id) => !processed.has(id));

  if (pending.length === 0) {
    logger.info(`watchEmails: nothing new (${ids.length} matched, all seen)`);
    return { processed: 0, failed: 0, skipped: 0 };
  }

  const batch = pending.slice(0, CONSTANTS.MAX_EMAILS_PER_TICK);
  logger.info(`watchEmails: ${pending.length} pending — handling ${batch.length} this tick`);

  const done   = [];
  let   failed = 0;

  for (const id of batch) {
    try {
      await processEmail(id);
      done.push(id);
    } catch (err) {
      failed++;
      // Marked as processed anyway: a message that fails deterministically
      // (unparseable body, blocked sender) would otherwise be retried on
      // every tick forever and block the rest of the queue.
      done.push(id);
      logger.error(`watchEmails: message ${id} failed — ${err.message}`);
    }
  }

  await markProcessed(done);

  const skipped = pending.length - batch.length;
  logger.info(`watchEmails: done — ${done.length - failed} ok, ${failed} failed, ${skipped} queued for next tick`);

  return { processed: done.length - failed, failed, skipped };
}

