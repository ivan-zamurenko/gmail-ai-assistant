/**
 * parser/consignment.js
 * =====================
 * Pulls consignment numbers out of an email.
 */

// DPD uses 9-digit consignment numbers and 14-digit tracking numbers.
// \b matters more than it looks: it stops a 10-digit phone number like
// 0873589983 from yielding a 9-digit "match" inside itself.
const NUMBER = /\b(?:\d{9}|\d{14})\b/g;

/** Numbers in the subject come first — that is where the customer puts the one they mean. */
export function extractConsignments(subject = '', body = '') {
  const found = new Set();
  for (const text of [subject, body]) {
    for (const m of String(text).matchAll(NUMBER)) found.add(m[0]);
  }
  return [...found];
}
