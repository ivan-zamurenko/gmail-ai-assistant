/**
 * src/depot/labelParser.js
 * ========================
 * Transforms the raw number found on a DPD parcel label into a clean consignment number.
 *
 * Three label formats:
 *
 *   Type 1 — plain number:
 *     "267308640" → "267308640"
 *
 *   Type 2 — slash format (remove leading zero + suffix):
 *     "040111977/0/1" → "40111977"
 *
 *   Type 3 — 15-char routing number (remove 4-char prefix + last check character):
 *     "051129987189428" → "2998718942"
 *     "05119743484615C" → "9743484615"
 *
 *   Type 3b — 14-digit routing number (no check digit, prefix only):
 *     "05112998718942" → "2998718942"
 */
export function extractConsignmentNumber(raw) {
  const value = raw.trim();

  // Type 2: slash format — e.g. "040111977/0/1"
  if (/^\d+\/\d+\/\d+$/.test(value)) {
    return value.replace(/\/.*$/, '').replace(/^0/, '');
  }

  // Type 3: 14 digits + 1 digit or letter (15 chars total)
  if (/^\d{14}[A-Z\d]$/.test(value)) {
    return value.slice(4, -1);
  }

  // Type 3b: exactly 14 digits (routing prefix present, no check digit)
  if (/^\d{14}$/.test(value)) {
    return value.slice(4);
  }

  // Type 1: plain number — must be at least 6 digits, nothing else
  if (/^\d{6,}$/.test(value)) {
    return value;
  }

  // Gemini returned something that isn't a number (e.g. "not found", "N/A")
  return null;
}
