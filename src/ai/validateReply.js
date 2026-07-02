/**
 * ai/validateReply.js
 * ===================
 * Validates that an AI-generated reply is safe and sensible before
 * it is saved as a Gmail draft.
 *
 * Responsibility: throw on invalid replies — pure function, no side effects.
 * TODO: add content-safety checks (offensive language, hallucinated data, etc.)
 */

import { CONSTANTS } from '../utils/constants.js';

/**
 * Throws if the reply is empty, too long, or fails content checks.
 *
 * @param {string} reply
 * @throws {Error}
 */
export function validateReply(reply) {
  if (!reply || reply.trim().length === 0) {
    throw new Error('validateReply: AI returned an empty reply');
  }

  if (reply.length > CONSTANTS.MAX_REPLY_LENGTH) {
    throw new Error(
      `validateReply: reply exceeds maximum length (${reply.length} > ${CONSTANTS.MAX_REPLY_LENGTH})`
    );
  }

  // TODO: call a content-safety API or run a local filter
  // to detect hallucinated tracking numbers, rude language, PII leakage, etc.
}
