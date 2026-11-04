/**
 * src/workflow/replyPolicy.js
 * ===========================
 * Owner reply policy (G_GMAIL_POLICY, 2026-11-04) for a message already
 * normalised by gmail/mime.js. Decides only whether a draft may be prepared and
 * for whom; it never sends, never changes a delivery date and never moves labels.
 *
 *   draft   — prepare an English draft for human review
 *   review  — no draft; label the message for a person to look at
 *   blocked — the message could not be read safely
 */
import { extractConsignments } from '../parser/consignment.js';

export const REPLY_POLICY_VERSION = 'gmail-reply-2026-11-04';

const NO_REPLY = /^(?:no-?reply|do-?not-?reply|mailer-daemon|postmaster)(?:[+._-].*)?@/i;
const ADDRESS = /^[^\s@<>()",;:]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

/** "Name <a@b.c>" or "a@b.c" → lower-case address, or null when unclear. */
function addressOf(header) {
  if (typeof header !== 'string') return null;
  const angle = header.match(/<([^<>]+)>\s*$/);
  const value = (angle ? angle[1] : header).trim();
  return ADDRESS.test(value) ? value.toLowerCase() : null;
}

const CONSTRAINTS = Object.freeze({
  autoSend: false,
  // Only depot facts (status, date already in the depot); no promises.
  mayPromiseDateCompensationOrAction: false,
  mayChangeDeliveryOrLabels: false,
});

function outcome(decision, reason, extra = {}) {
  return { decision, reason, language: 'en', policyVersion: REPLY_POLICY_VERSION, constraints: CONSTRAINTS, ...extra };
}

export function decideReply(message) {
  if (message?.status !== 'ready' || message.reason !== null || !message.headers) return outcome('blocked', 'message_not_ready');
  const { from = [], replyTo = [], subject = [], autoSubmitted = [], listId = [], precedence = [] } = message.headers;

  if (from.length !== 1 || !addressOf(from[0])) return outcome('review', 'sender_unclear');
  const sender = addressOf(from[0]);
  if (NO_REPLY.test(sender)) return outcome('review', 'no_reply_sender');
  const automated = autoSubmitted.some(value => String(value).trim().toLowerCase() !== 'no')
    || listId.length > 0 || precedence.some(value => /^(bulk|list|junk)$/i.test(String(value).trim()));
  if (automated) return outcome('review', 'automated_message');

  // Reply-To wins only when it is one clear address; otherwise answer the sender.
  if (replyTo.length > 1 || (replyTo.length === 1 && !addressOf(replyTo[0]))) return outcome('review', 'reply_to_unclear');
  const to = replyTo.length === 1 ? addressOf(replyTo[0]) : sender;
  if (NO_REPLY.test(to)) return outcome('review', 'no_reply_sender');

  const found = extractConsignments(subject[0] ?? '', message.text ?? '');
  if (found.status === 'none') return outcome('review', 'no_consignment');
  if (!['single', 'multiple'].includes(found.status)) return outcome('blocked', found.status);
  const consignments = found.candidates.map(candidate => candidate.value);
  return outcome('draft', found.status === 'multiple' ? 'multiple_consignments_review' : 'single_consignment', {
    to, cc: [], consignments,
  });
}
