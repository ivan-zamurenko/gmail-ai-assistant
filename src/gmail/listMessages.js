/**
 * gmail/listMessages.js
 * =====================
 * Lists Gmail message IDs matching a search query.
 *
 * Responsibility: search only. Returns IDs, never content —
 * fetching content is readEmail()'s job.
 */

import { getAuthToken } from '../auth/getAuthToken.js';
import { request }      from '../utils/request.js';
import { CONSTANTS }    from '../utils/constants.js';

/**
 * Searches the mailbox and returns matching message IDs, newest first.
 *
 * @param {string} [query]       Gmail search syntax (same as the Gmail search box)
 * @param {number} [maxResults]  Upper bound on IDs returned
 * @returns {Promise<string[]>}  Message IDs — empty array when nothing matches
 */
export async function listMessages(
  query      = CONSTANTS.GMAIL_SEARCH_QUERY,
  maxResults = CONSTANTS.GMAIL_MAX_RESULTS,
) {
  const token = await getAuthToken();
  const url   = `${CONSTANTS.GMAIL_API_BASE}/messages`
              + `?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;

  const res = await request.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Gmail omits `messages` entirely when there are no matches.
  return (res.messages ?? []).map((m) => m.id);
}
