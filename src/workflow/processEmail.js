/**
 * workflow/processEmail.js
 * ========================
 * The ONLY file that owns the end-to-end email processing sequence.
 * All other modules are pure functions / services — this file connects them.
 *
 * Workflow:
 *
 *   readEmail(messageId)
 *     → extractEmailData(email)
 *     → getShipment(trackingNumber)
 *     → generateReply(email, shipment)   ← builds prompt + calls AI internally
 *     → createDraft(messageId, reply)
 */

import { readEmail }        from '../gmail/readEmail.js';
import { extractEmailData } from '../parser/extractEmailData.js';
import { getShipment }      from '../shipment/getShipment.js';
import { generateReply }    from '../ai/generateReply.js';
import { createDraft }      from '../gmail/createDraft.js';
import { logger }           from '../utils/logger.js';

/**
 * Orchestrates the full email processing pipeline for a single message.
 *
 * @param {string} messageId  Gmail message ID to process
 * @returns {Promise<{ draftId: string }>}
 */
export async function processEmail(messageId) {
  logger.info(`processEmail: ▶ starting pipeline for message ${messageId}`);

  // Step 1 — Fetch the full email content from Gmail
  const email = await readEmail(messageId);
  logger.info(`processEmail: ✓ email read — subject: "${email.subject}"`);

  // Step 2 — Extract structured data (tracking number, order, customer)
  const { trackingNumber, orderNumber, customer } = extractEmailData(email);
  logger.info(`processEmail: ✓ extracted — tracking=${trackingNumber ?? 'none'} order=${orderNumber ?? 'none'} customer=${customer ?? 'unknown'}`);

  // Step 3 — Fetch shipment status from carrier API (null if no tracking number)
  const shipment = await getShipment(trackingNumber);
  logger.info(`processEmail: ✓ shipment — status=${shipment?.status ?? 'n/a'}`);

  // Step 4 — Generate AI reply (buildPrompt is called internally by generateReply)
  const replyText = await generateReply(email, shipment);
  logger.info('processEmail: ✓ reply generated');

  // Step 5 — Save as a Gmail draft (does NOT send automatically)
  const { draftId } = await createDraft(email.id, replyText);
  logger.info(`processEmail: ✓ draft saved — draftId=${draftId}`);

  return { draftId };
}
