/**
 * ai/generateReply.js
 * ====================
 * Generates an AI reply for an email using available shipment context.
 *
 * Responsibility: orchestrate buildPrompt → openai.complete → validateReply.
 * This is the only ai/ file that imports from other ai/ files.
 */

import { buildPrompt }   from './buildPrompt.js';
import { openai }        from './openai.js';
import { validateReply } from './validateReply.js';
import { logger }        from '../utils/logger.js';

/**
 * @param {{ subject: string, from: string, body: string }} email
 * @param {import('../shipment/normalizeShipment.js').Shipment|null} shipment
 * @returns {Promise<string>} The generated reply text
 */
export async function generateReply(email, shipment) {
  const prompt = buildPrompt(email, shipment);
  logger.info('generateReply: sending prompt to AI model...');

  const reply = await openai.complete(prompt);

  validateReply(reply);
  return reply;
}
