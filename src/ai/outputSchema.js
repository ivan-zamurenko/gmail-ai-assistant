/** Provider-independent proposal checks. No provider, policy or effect capability. */
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
const blocked = reason => ({ status: 'blocked', reason });
export const REASON_CODES = Object.freeze(['manual_review', 'missing_information', 'ambiguous_case', 'unsupported_request']);

function validDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match || +match[3] < 1900) return false;
  const date = new Date(Date.UTC(+match[3], +match[2] - 1, +match[1]));
  return date.getUTCFullYear() === +match[3] && date.getUTCMonth() === +match[2] - 1 && date.getUTCDate() === +match[1];
}

/** Validate and project the exact S05-03 context; never serialize unknown fields. */
export function projectTrustedContext(context, { now = Date.now() } = {}) {
  if (!record(context) || context.status !== 'facts_ready' || context.reason !== null || context.authorLinkConfirmed !== true
      || !Number.isSafeInteger(now) || !Number.isSafeInteger(context.readAt) || context.readAt < 0
      || now < context.readAt || now - context.readAt > 300000 || !record(context.source)) return null;
  const source = context.source;
  if (!identifier(source.messageId) || !identifier(source.threadId) || typeof source.consNumber !== 'string'
      || !/^(?:\d{9}|\d{14})$/.test(source.consNumber) || typeof source.consId !== 'string' || !/^\d{1,32}$/.test(source.consId)
      || !Array.isArray(context.facts) || !context.facts.length || context.facts.length > 1000) return null;
  const facts = [];
  for (let index = 0; index < context.facts.length; index++) {
    const fact = context.facts[index];
    if (!record(fact) || fact.id !== `scan-${index + 1}` || fact.source !== 'scanning_history'
        || typeof fact.parcel !== 'string' || !/^\d{1,6}$/.test(fact.parcel)
        || typeof fact.type !== 'string' || !fact.type.trim() || fact.type.length > 120
        || Array.from(fact.type).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
        || !validDate(fact.date) || typeof fact.time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(fact.time)) return null;
    facts.push({ id: fact.id, source: 'scanning_history', parcel: fact.parcel, type: fact.type, date: fact.date, time: fact.time });
  }
  return { source: { messageId: source.messageId, threadId: source.threadId, consNumber: source.consNumber, consId: source.consId },
    readAt: context.readAt, facts };
}

/** Numeric date/shipment checks are conservative guardrails, not prose truth verification. */
export function validateProposal(output, context, options) {
  const trusted = projectTrustedContext(context, options);
  if (!trusted) return blocked('untrusted_context');
  const keys = ['reply_text', 'needs_human', 'reason_codes', 'fact_refs'];
  if (!record(output) || Object.keys(output).length !== keys.length || Object.keys(output).some(key => !keys.includes(key))
      || typeof output.reply_text !== 'string' || !output.reply_text.trim() || output.reply_text.length > 4000
      || typeof output.needs_human !== 'boolean' || !Array.isArray(output.reason_codes) || output.reason_codes.length > 10
      || output.reason_codes.some(code => !REASON_CODES.includes(code))
      || !Array.isArray(output.fact_refs) || output.fact_refs.length > 20
      || output.fact_refs.some(ref => typeof ref !== 'string' || !/^scan-[1-9]\d{0,3}$/.test(ref))
      || new Set(output.fact_refs).size !== output.fact_refs.length) return blocked('invalid_output');
  const facts = new Map(trusted.facts.map(fact => [fact.id, fact]));
  if (output.fact_refs.some(ref => !facts.has(ref))) return blocked('unknown_fact');
  const citedDates = new Set(output.fact_refs.map(ref => facts.get(ref).date));
  for (const match of output.reply_text.matchAll(/\b(?:\d{9}|\d{14})\b/g)) {
    if (match[0] !== trusted.source.consNumber) return blocked('unsupported_claim');
  }
  for (const match of output.reply_text.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})\b/g)) {
    const date = /^\d{4}-/.test(match[0]) ? match[0].split('-').reverse().join('/') : match[0].replace(/-/g, '/');
    if (!citedDates.has(date)) return blocked('unsupported_claim');
  }
  return { status: 'needs_review', reason: 'human_review_required', requiresHumanReview: true, proseVerified: false,
    proposal: { reply_text: output.reply_text, needs_human: output.needs_human,
      reason_codes: [...output.reason_codes], fact_refs: [...output.fact_refs] } };
}
