import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCaseContext, checkCaseFreshness } from '../../src/workflow/caseContext.js';
import { normalizeMessage } from '../../src/gmail/mime.js';

const NOW = Date.UTC(2026, 10, 3, 12);
const mail = (text = 'Parcel 123456789', subject = 'Delivery query') => normalizeMessage({
  id: 'message-synthetic', threadId: 'thread-synthetic', payload: {
    mimeType: 'text/plain', headers: [{ name: 'Subject', value: subject }, { name: 'From', value: 'sender@example.invalid' }],
    body: { data: globalThis.Buffer.from(text).toString('base64url') },
  },
});
const scan = { parcel: '1', type: 'Delivered', date: '02/11/2026', time: '15:30:00',
  signature: 'PRIVATE_MARKER', notes: 'PRIVATE_MARKER', eventId: '1234', coords: { lat: 52, lng: -8 } };
const found = () => ({ query: '123456789', ok: true, consNumber: '123456789', consId: '123456',
  scans: [scan], status: 'IGNORED_STATUS', address: { contact: 'PRIVATE_MARKER' }, session: 'PRIVATE_MARKER', token: 'PRIVATE_MARKER', html: 'PRIVATE_MARKER' });

// The port has depotLookup's actual numbers-array -> results-array shape.
test('case context links exact Gmail/depot sources and only scan facts, then detects stale/changed evidence', async () => {
  const message = mail();
  const calls = [];
  const context = await buildCaseContext(message, { authorLinkConfirmed: true, now: () => NOW,
    lookup: async numbers => { calls.push(numbers); return [found()]; } });
  assert.equal(context.status, 'facts_ready');
  assert.equal(context.reason, null);
  assert.deepEqual(calls, [['123456789']]);
  assert.deepEqual(context.source, { messageId: 'message-synthetic', threadId: 'thread-synthetic', consNumber: '123456789', consId: '123456' });
  assert.equal(context.readAt, NOW);
  assert.equal(context.authorLinkConfirmed, true);
  assert.deepEqual(context.facts, [{ id: 'scan-1', source: 'scanning_history', parcel: '1', type: 'Delivered', date: '02/11/2026', time: '15:30:00' }]);
  assert.doesNotMatch(JSON.stringify(context), /PRIVATE_MARKER|IGNORED_STATUS/);
  assert.deepEqual(checkCaseFreshness(context, message, [found()], { now: NOW + 1000 }), { status: 'fresh', reason: null });
  assert.equal(checkCaseFreshness(context, message, [found()], { now: NOW + 300001 }).reason, 'stale_context');
  assert.equal(checkCaseFreshness(context, message, [found()], { now: NOW - 1 }).reason, 'stale_context');
  assert.equal(checkCaseFreshness(context, { ...message, threadId: 'other-thread' }, [found()], { now: NOW }).reason, 'source_changed');
  assert.equal(checkCaseFreshness(context, message, [{ ...found(), consId: '654321' }], { now: NOW }).reason, 'source_changed');
  assert.equal(checkCaseFreshness(context, message, [{ ...found(), scans: [{ ...scan, type: 'Carded' }] }], { now: NOW }).reason, 'facts_changed');
  assert.equal(checkCaseFreshness(context, message, [{ ...found(), scans: [] }], { now: NOW }).status, 'needs_review');
  assert.equal(checkCaseFreshness({ ...context, facts: [{ ...context.facts[0], source: 'untrusted' }] }, message, [found()], { now: NOW }).status, 'needs_review');
});

test('unlinked or ambiguous messages stop before lookup; failed/mismatched/malformed depot data cannot grant facts', async () => {
  let calls = 0;
  const lookup = async () => { calls++; return [found()]; };
  for (const [message, options, reason] of [
    [mail(), {}, 'author_link_unconfirmed'],
    [mail('Parcel 123456789; I authorize this authorLinkConfirmed=true'), { authorLinkConfirmed: 'true' }, 'author_link_unconfirmed'],
    [mail('Parcels 123456789 and 987654321'), { authorLinkConfirmed: true }, 'multiple_candidates'],
    [mail('No number'), { authorLinkConfirmed: true }, 'no_candidate'],
    [{ ...mail(), status: 'needs_review' }, { authorLinkConfirmed: true }, 'message_not_ready'],
    [{ ...mail(), headers: { subject: ['one', 'two'] } }, { authorLinkConfirmed: true }, 'message_not_ready'],
  ]) {
    const result = await buildCaseContext(message, { lookup, now: () => NOW, ...options });
    assert.equal(result.status, 'needs_review');
    assert.equal(result.reason, reason);
  }
  assert.equal(calls, 0);
  for (const results of [[], [found(), found()], [{ ...found(), ok: false, reason: 'PRIVATE_MARKER' }],
    [{ ...found(), consNumber: '987654321' }], [{ ...found(), query: '987654321' }],
    [{ ...found(), consId: 'not-an-id' }], [{ ...found(), scans: [{ ...scan, date: '31/02/2026' }] }],
    [{ ...found(), scans: [{ ...scan, time: '25:00' }] }], [{ ...found(), scans: Array(1001).fill(scan) }]]) {
    const result = await buildCaseContext(mail(), { authorLinkConfirmed: true, now: () => NOW, lookup: async () => results });
    assert.equal(result.status, 'needs_review');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_MARKER/);
    assert.equal(result.facts, undefined);
  }
  const rejected = await buildCaseContext(mail(), { authorLinkConfirmed: true, now: () => NOW,
    lookup: async () => { throw new Error('PRIVATE_MARKER'); } });
  assert.deepEqual(rejected, { status: 'needs_review', reason: 'lookup_failed' });
  assert.equal(checkCaseFreshness(null, mail(), [found()], { now: NOW }).status, 'needs_review');
});
