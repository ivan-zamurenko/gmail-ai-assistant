import test from 'node:test';
import assert from 'node:assert/strict';
import { logRescheduleResult } from '../../src/depot/rescheduleDiagnostics.js';

test('extension console includes every outcome and safe reasons without identifiers or raw text', () => {
  const lines = [];
  const logger = { log: text => lines.push(text), error: text => lines.push(text) };
  logRescheduleResult({ dryRun: true, results: [
    { consNumber: '123456789', consId: 'PRIVATE', action: 'CHANGE_DATE', reason: 'CAD today; parcel remains in depot' },
    { action: 'ERROR', reason: 'Consignment identity mismatch; manual review required' },
    { action: 'PRIVATE', reason: 'SECRET session=private' },
  ] }, logger);
  assert.match(lines.join('\n'), /\[1\/3\] WOULD_CHANGE.*CAD today/);
  assert.match(lines.join('\n'), /\[2\/3\] ERROR.*identity mismatch/);
  assert.match(lines.join('\n'), /\[3\/3\] REVIEW/);
  assert.doesNotMatch(lines.join('\n'), /123456789|PRIVATE|SECRET|session=/);
  logRescheduleResult({ __error: 'Reschedule rejected by server' }, logger);
  assert.match(lines.at(-1), /FATAL.*rejected/);
});
