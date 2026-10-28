/** Pure candidate extraction, not consignment verification.
 * The existing 9/14-digit shape is a heuristic, not a national numbering rule.
 * A phone, timestamp or quoted reference can match; every value needs lookup.
 */
const NUMBER = /\b(?:\d{9}|\d{14})\b/g;
const MAX_INPUT_LENGTH = 100000; // Combined UTF-16 code units; engineering limit.

/**
 * Subject matches precede body matches; order does not imply relevance.
 * Returns {status, candidates:[{value, verified:false, reason:'lookup-required'}]}.
 * Status: none/single/multiple, invalid_input or input_too_large.
 * Reject oversized input completely: truncation could conceal a second number.
 */
export function extractConsignments(subject = '', body = '') {
  if (typeof subject !== 'string' || typeof body !== 'string') {
    return { status: 'invalid_input', candidates: [] };
  }
  if (subject.length + body.length > MAX_INPUT_LENGTH) {
    return { status: 'input_too_large', candidates: [] };
  }
  const found = new Set();
  for (const text of [subject, body]) {
    for (const match of text.matchAll(NUMBER)) found.add(match[0]);
  }
  const candidates = [...found].map(value => ({ value, verified: false, reason: 'lookup-required' }));
  return { status: candidates.length === 0 ? 'none' : candidates.length === 1 ? 'single' : 'multiple', candidates };
}
