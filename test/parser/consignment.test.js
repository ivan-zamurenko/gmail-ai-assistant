import test from 'node:test';
import assert from 'node:assert/strict';
import { extractConsignments } from '../../src/parser/consignment.js';

const candidate = value => ({ value, verified: false, reason: 'lookup-required' });

test('candidate sets distinguish none, single and multiple while preserving order and deduplicating', () => {
  assert.deepEqual(extractConsignments(), { status: 'none', candidates: [] });
  assert.deepEqual(extractConsignments('No parcel', 'Nothing here'), { status: 'none', candidates: [] });
  assert.deepEqual(extractConsignments('Ref 001234567', 'Signature 001234567'), {
    status: 'single', candidates: [candidate('001234567')],
  });
  assert.deepEqual(extractConsignments('001234567', '001234567 05112998718942 987654321'), {
    status: 'multiple', candidates: ['001234567', '05112998718942', '987654321'].map(candidate),
  });
});

test('numeric shape never verifies a phone, timestamp, quoted reference or arbitrary digits', () => {
  for (const text of ['Phone: 123456789', 'Timestamp: 20261028123059', '> Reference 987654321', 'Random 555555555']) {
    const result = extractConsignments('', text);
    assert.equal(result.status, 'single');
    assert.equal(result.candidates[0].verified, false);
    assert.equal(result.candidates[0].reason, 'lookup-required');
  }
  assert.deepEqual(extractConsignments('0871234567 123456789012345 ABC123456789XYZ'), { status: 'none', candidates: [] });
});

test('input types and combined size are checked before extraction without coercion or truncation', () => {
  for (const value of [null, 123456789, [], {}, { toString() { throw new Error('Must not coerce'); } }]) {
    assert.deepEqual(extractConsignments(value, ''), { status: 'invalid_input', candidates: [] });
    assert.deepEqual(extractConsignments('', value), { status: 'invalid_input', candidates: [] });
  }
  const subject = '001234567';
  assert.deepEqual(extractConsignments(subject, ' '.repeat(100000 - subject.length)), {
    status: 'single', candidates: [candidate(subject)],
  });
  assert.deepEqual(extractConsignments(subject, ' '.repeat(100001 - subject.length)), { status: 'input_too_large', candidates: [] });
});
