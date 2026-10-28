/** Only exact internal reasons and bounded protocol metadata cross diagnostic boundaries.
 * fallback must be a static, caller-owned operation label, never provider text.
 */
export function safeErrorMessage(error, fallback = 'Unexpected error') {
  const known = new Set([
    "Manual date must use YYYY-MM-DD",
    "Manual date is not a valid calendar date",
    "Manual date must be a future working day",
    "Refusing a cross-origin depot request",
    "Pending trigger link not found — are you on the correct depot page?",
    "Unexpected trigger href",
    "Reschedule form not found",
    "Reschedule rejected by server",
    "Reschedule: server did not confirm. See console for details.",
    "Status not found — depot page structure may have changed",
    "Not the correct depot page (unexpected origin)",
    "Unsupported depot mode",
    "Quick search form not found — is this a depot page?",
    "Depot script returned no result — check you are on the depot page",
    "Drive Folder ID is missing from local configuration",
    "Depot lookup returned nothing — open the depot page in the active tab",
    "Задачу скасовано",
    "Задача прострочена до початку виконання",
    "Розширення почало виконання, але результат не підтверджено. Не повторюй live-команду автоматично.",
    "Розширення не відповіло вчасно — перевір його стан і depot session."
  ]);
  const raw = typeof error?.message === 'string' ? error.message : '';
  if (known.has(raw)) return raw;
  const status = raw.match(/(?:HTTP|Drive API|Drive) ([1-5]\d{2})\b/)?.[1];
  const codes = new Set(['permission-denied', 'unauthenticated', 'unavailable', 'deadline-exceeded', 'resource-exhausted', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']);
  const candidate = error?.code ?? raw.match(/\[([a-zA-Z-]+)\]$/)?.[1];
  const code = codes.has(candidate) ? ` [${candidate}]` : '';
  return `${fallback}${status ? ` (HTTP ${status})` : ''}${code}`;
}
