/**
 * parser/extractPhoneNumber.js
 * ============================
 * Extracts an Irish mobile phone number from free-form email text.
 *
 * Used as a fallback lookup key when no consignment number is found.
 *
 * Irish mobile prefixes: 083, 085, 086, 087, 089
 * Formats handled:
 *   0871234567          local (10 digits)
 *   087 123 4567        with spaces
 *   +353 87 123 4567    international with +
 *   00353871234567      international with 00
 *
 * Responsibility: regex matching only — pure function, no side effects.
 */

/**
 * Extracts the first Irish mobile number found in the text.
 * Returns a normalised 10-digit string (e.g. "0877629373") or null.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function extractPhoneNumber(text) {
  // Pattern A: international +353 or 00353
  //   +353 87 7629373  |  00353871234567  |  +353871234567
  const reIntl = /(?:\+353|00353)\s*8[35679][\s\-]?\d{3}[\s\-]?\d{4}/;
  const international = text.match(reIntl);
  if (international) return normalise(international[0]);

  // Pattern B: local 08X format
  //   0871234567  |  087 123 4567  |  087-123-4567
  const reLocal = /\b0(?:8[35679])[\s\-]?\d{3}[\s\-]?\d{4}\b/;
  const local = text.match(reLocal);
  if (local) return normalise(local[0]);

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips spaces, dashes, and converts international prefix to local 0.
 * Always returns a 10-digit string starting with 08.
 *
 * @param {string} raw
 * @returns {string}
 */
function normalise(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00353')) return '0' + digits.slice(5);
  if (digits.startsWith('353'))   return '0' + digits.slice(3);
  return digits;
}
