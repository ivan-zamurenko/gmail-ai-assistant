import test from 'node:test';
import assert from 'node:assert/strict';
import { decideReply } from '../../src/workflow/replyPolicy.js';

const message = (headers = {}, text = 'Where is parcel 123456789?') => ({
  status: 'ready', reason: null, messageId: 'm1', threadId: 't1', text,
  headers: { subject: ['Delivery'], from: ['Jane <jane@example.com>'], replyTo: [], to: [], autoSubmitted: [], listId: [], precedence: [], ...headers },
});

test('reply policy follows the owner decisions (G_GMAIL_POLICY)', () => {
  const cases = [
    [message(), 'draft', 'single_consignment', 'jane@example.com'],
    [message({ replyTo: ['Desk <desk@example.com>'] }), 'draft', 'single_consignment', 'desk@example.com'],
    [message({}, 'Parcels 123456789 and 987654321'), 'draft', 'multiple_consignments_review', 'jane@example.com'],
    [message({}, 'Where is my parcel?'), 'review', 'no_consignment'],
    [message({ from: ['no-reply@example.com'] }), 'review', 'no_reply_sender'],
    [message({ from: ['MAILER-DAEMON@example.com'] }), 'review', 'no_reply_sender'],
    [message({ autoSubmitted: ['auto-replied'] }), 'review', 'automated_message'],
    [message({ listId: ['<news.example.com>'] }), 'review', 'automated_message'],
    [message({ precedence: ['bulk'] }), 'review', 'automated_message'],
    [message({ from: ['a@example.com', 'b@example.com'] }), 'review', 'sender_unclear'],
    [message({ replyTo: ['x@example.com', 'y@example.com'] }), 'review', 'reply_to_unclear'],
    [{ status: 'failed', reason: 'invalid_mime' }, 'blocked', 'message_not_ready'],
  ];
  for (const [input, decision, reason, to] of cases) {
    const result = decideReply(input);
    assert.deepEqual([result.decision, result.reason], [decision, reason], JSON.stringify(input.headers ?? input));
    if (to) assert.deepEqual([result.to, result.cc, result.language], [to, [], 'en']);
    assert.equal(result.constraints.autoSend, false);
    assert.equal(result.constraints.mayChangeDeliveryOrLabels, false);
  }
  assert.equal(decideReply(message({ autoSubmitted: ['no'] })).decision, 'draft', 'Auto-Submitted: no is a person');
});
