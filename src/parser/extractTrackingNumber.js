/**
 * parser/extractTrackingNumber.js
 * ================================
 * Extracts a DPD Ireland consignment number from free-form email text.
 *
 * DPD Ireland consignment numbers are exactly 9 digits.
 * Examples seen in real emails: 132109920, 705853280, 995625979, 132019138
 *
 * Responsibility: regex matching only — pure function, no side effects.
 */

/**
 * Tries to extract a DPD Ireland consignment number from the given text.
 *
 * Priority order:
 *  1. Explicitly labelled   — "Consignment: 123456789", "Con No: 123456789"
 *  2. In subject line       — 9-digit number at the start or standalone
 *  3. Anywhere in the text  — standalone 9-digit number
 *
 * @param {string} text
 * @returns {string|null}
 */
export function extractTrackingNumber(text) {
  // Pattern 1: Labelled — "Consignment: 123456789", "Con No: 123456789",
  //            "Consignment Number: 123456789", "Consignment #123456789"
  const labelled = text.match(
    /con(?:signment)?\s*(?:number|no\.?|#)?\s*[:\-]?\s*(\d{9})\b/i,
  );
  if (labelled) return labelled[1];

  // Pattern 2: 9-digit number at the very start of the subject (common DPD format)
  //            e.g. "132109920 - 2052L8 - NDL"  or  "705853280 [ ref:... ]"
  const subjectLine = text.match(/^(\d{9})\b/m);
  if (subjectLine) return subjectLine[1];

  // Pattern 3: Standalone 9-digit number anywhere in the text
  //            Must not be part of a longer number (word-boundary on both sides)
  const standalone = text.match(/\b(\d{9})\b/);
  if (standalone) return standalone[1];

  return null;
}
