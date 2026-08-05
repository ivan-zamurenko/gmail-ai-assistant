/**
 * storage/processedStore.js
 * =========================
 * Remembers which Gmail messages have already been processed.
 *
 * Why this exists:
 *   Gmail search is not a queue. A message stays in the "is:unread" result set
 *   until someone opens it, so the same message would be answered on every
 *   alarm tick. At 300-500 emails/day that means duplicate drafts within
 *   minutes. This store makes processing idempotent.
 *
 * Why not mark the message as read instead:
 *   That would hide genuinely unread mail from the human operator.
 *   Processing state is our concern, not the user's inbox state.
 */

import { storage }   from './storage.js';
import { CONSTANTS } from '../utils/constants.js';

const KEY = CONSTANTS.STORAGE_PROCESSED_KEY;
const MAX = CONSTANTS.PROCESSED_IDS_MAX;

/**
 * Loads processed message IDs as a Set for O(1) lookups.
 *
 * @returns {Promise<Set<string>>}
 */
export async function getProcessedIds() {
  const saved = await storage.get(KEY);
  return new Set(Array.isArray(saved) ? saved : []);
}

/**
 * Marks message IDs as processed, pruning the oldest entries past the cap.
 *
 * Insertion order is preserved, so the array doubles as a FIFO queue —
 * slicing from the end keeps the most recent IDs.
 *
 * @param {string[]} messageIds
 * @returns {Promise<void>}
 */
export async function markProcessed(messageIds) {
  if (messageIds.length === 0) return;

  const existing = await getProcessedIds();
  for (const id of messageIds) existing.add(id);

  await storage.set(KEY, [...existing].slice(-MAX));
}
