/**
 * Converts an internal error into text that is safe to persist or show outside
 * the extension. Depot sessions live in URLs, so raw errors must never cross
 * into Firestore or Discord.
 */
export function safeErrorMessage(error, fallback = 'Unexpected error') {
  const raw = error?.message ?? String(error ?? fallback);
  return raw
    .replace(/([?&](?:session|uid)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/https?:\/\/[^\s)]+/gi, '[redacted URL]')
    .slice(0, 500) || fallback;
}
