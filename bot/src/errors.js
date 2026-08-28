/** Error text that is safe to return to Discord or persist in Firestore. */
export function safeErrorMessage(error, fallback = 'Unexpected error') {
  const raw = error?.message ?? String(error ?? fallback);
  return raw
    .replace(/([?&](?:session|uid|key)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/https?:\/\/[^\s)]+/gi, '[redacted URL]')
    .slice(0, 500) || fallback;
}
