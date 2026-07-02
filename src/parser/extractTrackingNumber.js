/**
 * parser/extractTrackingNumber.js
 * ================================
 * Extracts a parcel tracking number from free-form email text.
 *
 * Responsibility: regex matching only — pure function, no side effects.
 * TODO: add patterns for all carriers used (DPD, An Post, DHL, FedEx, etc.)
 */

/**
 * Tries to extract a parcel tracking number from the given text.
 *
 * Priority order:
 *  1. Explicit "tracking:" label followed by an alphanumeric code
 *  2. Standalone codes that match known carrier formats
 *
 * @param {string} text
 * @returns {string|null}
 */
export function extractTrackingNumber(text) {
  // Pattern 1: Labelled — "Tracking: ABC123456789", "tracking #: XY1234"
  const labelled = text.match(/tracking\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9]{8,30})/i);
  if (labelled) return labelled[1].toUpperCase();

  // Pattern 2: Known carrier formats (expand per carrier)
  // DPD: 14 digits
  const dpd = text.match(/\b(\d{14})\b/);
  if (dpd) return dpd[1];

  // TODO: add patterns for An Post, DHL, FedEx, UPS, etc.

  return null;
}
