/** Prepared read-only case builder. No UI wiring, AI transport or mutation ports. */
import { extractConsignments } from '../parser/consignment.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
const review = reason => ({ status: 'needs_review', reason });
const timestamp = value => Number.isSafeInteger(value) && value >= 0;

function candidatesFor(message) {
  if (!record(message) || message.status !== 'ready' || message.reason !== null
      || !identifier(message.messageId) || !identifier(message.threadId)
      || !record(message.headers) || !Array.isArray(message.headers.subject)
      || message.headers.subject.length > 1 || typeof message.text !== 'string'
      || message.headers.subject.some(subject => typeof subject !== 'string' || subject.length > 4096)) return null;
  return extractConsignments(message.headers.subject[0] ?? '', message.text);
}

function validScan(scan) {
  if (!record(scan) || typeof scan.parcel !== 'string' || !/^\d{1,6}$/.test(scan.parcel)
      || typeof scan.type !== 'string' || !scan.type.trim() || scan.type.length > 120
      || Array.from(scan.type).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || typeof scan.date !== 'string' || typeof scan.time !== 'string') return false;
  const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(scan.date);
  const time = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(scan.time);
  if (!date || !time || +date[3] < 1900 || +time[1] > 23 || +time[2] > 59 || +(time[3] ?? 0) > 59) return false;
  const parsed = new Date(Date.UTC(+date[3], +date[2] - 1, +date[1]));
  return parsed.getUTCFullYear() === +date[3] && parsed.getUTCMonth() === +date[2] - 1 && parsed.getUTCDate() === +date[1];
}

function scanFacts(scans) {
  if (!Array.isArray(scans) || !scans.length || scans.length > 1000 || scans.some(scan => !validScan(scan))) return null;
  const projected = scans.map(({ parcel, type, date, time }) => ({ parcel, type, date, time }));
  // Stable source references despite provider row order; no inferred latest status.
  projected.sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  return projected.map((scan, index) => ({ id: `scan-${index + 1}`, source: 'scanning_history', ...scan }));
}

function projectLookup(results, consNumber) {
  if (!Array.isArray(results) || results.length !== 1) return null;
  const result = results[0];
  if (!record(result) || result.ok !== true || result.query !== consNumber || result.consNumber !== consNumber
      || typeof result.consId !== 'string' || !/^\d{1,32}$/.test(result.consId)) return null;
  const facts = scanFacts(result.scans);
  return facts ? { consNumber, consId: result.consId, facts } : null;
}

/** authorLinkConfirmed is supplied by a trusted caller after human verification,
 * never extracted from message text. lookup has depotLookup's array-in/array-out shape.
 */
export async function buildCaseContext(message, { lookup, authorLinkConfirmed = false, now = Date.now } = {}) {
  const candidates = candidatesFor(message);
  if (!candidates || ['invalid_input', 'input_too_large'].includes(candidates.status)) return review('message_not_ready');
  if (candidates.status !== 'single') return review(candidates.status === 'multiple' ? 'multiple_candidates' : 'no_candidate');
  if (authorLinkConfirmed !== true) return review('author_link_unconfirmed');
  if (typeof lookup !== 'function' || typeof now !== 'function') return review('context_unavailable');
  const consNumber = candidates.candidates[0].value;
  const source = { messageId: message.messageId, threadId: message.threadId, consNumber };
  let data;
  let readAt;
  try {
    data = projectLookup(await lookup([consNumber]), consNumber);
    readAt = now();
  } catch { return review('lookup_failed'); }
  if (!data) return review('lookup_not_exact');
  if (!timestamp(readAt)) return review('invalid_read_time');
  return {
    status: 'facts_ready', reason: null, authorLinkConfirmed: true, readAt,
    source: { ...source, consId: data.consId },
    facts: data.facts,
  };
}

/** Recheck immediately before a later approved operation. Fresh means only that
 * these projected facts still match; it grants no permission to send or mutate.
 * maxAgeMs is an engineering freshness bound, not a delivery/calendar policy.
 */
export function checkCaseFreshness(context, message, results, { now = Date.now(), maxAgeMs = 300000 } = {}) {
  if (!record(context) || context.status !== 'facts_ready' || context.reason !== null
      || context.authorLinkConfirmed !== true || !record(context.source)
      || !timestamp(context.readAt) || !timestamp(now)
      || !Number.isInteger(maxAgeMs) || maxAgeMs < 1 || maxAgeMs > 3600000) return review('invalid_context');
  if (now < context.readAt || now - context.readAt > maxAgeMs) return review('stale_context');
  const candidates = candidatesFor(message);
  if (!candidates || candidates.status !== 'single'
      || message.messageId !== context.source.messageId || message.threadId !== context.source.threadId
      || candidates.candidates[0].value !== context.source.consNumber) return review('source_changed');
  const current = projectLookup(results, context.source.consNumber);
  if (!current) return review('lookup_not_exact');
  if (current.consId !== context.source.consId) return review('source_changed');
  const previousFacts = scanFacts(context.facts);
  if (!previousFacts || context.facts.some((fact, index) => fact.source !== 'scanning_history' || fact.id !== `scan-${index + 1}`)
      || JSON.stringify(previousFacts) !== JSON.stringify(current.facts)) return review('facts_changed');
  return { status: 'fresh', reason: null };
}
