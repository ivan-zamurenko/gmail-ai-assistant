import test from 'node:test';
import assert from 'node:assert/strict';
import { logRescheduleResult } from '../../src/depot/rescheduleDiagnostics.js';

test('extension console includes every outcome and safe reasons with owner-approved con_id but without internal identifiers or raw text', () => {
  const lines = [];
  const logger = { log: text => lines.push(text), error: text => lines.push(text) };
  logRescheduleResult({ dryRun: true, results: [
    { consNumber: '123456789', consId: 'PRIVATE', action: 'CHANGE_DATE', reason: 'CAD today; parcel remains in depot' },
    { action: 'ERROR', reason: 'Consignment identity mismatch; manual review required' },
    { consNumber: 'SECRET session=private', action: 'PRIVATE', reason: 'SECRET session=private' },
  ] }, logger);
  assert.match(lines.join('\n'), /123456789 → 🔎 Буде перенесено \(WOULD_CHANGE\).*CAD today/);
  assert.match(lines.join('\n'), /❌ Помилка \(ERROR\).*identity mismatch/);
  assert.match(lines.join('\n'), /⚠️ Потрібна перевірка \(REVIEW\)/);
  assert.doesNotMatch(lines.join('\n'), /PRIVATE|SECRET|session=/);
  logRescheduleResult({ results: [{ consNumber: '123456789', action: 'CHANGE_DATE', reason: 'CAD today; parcel remains in depot' }, { consNumber: '123456780', action: 'SKIP', reason: 'No eligible physical parcel in depot' }] }, logger);
  assert.match(lines.at(-2), /123456789 → ✅ Перенесено \(SAVED\)/);
  assert.match(lines.at(-1), /123456780 → ⏭️ Пропущено/);
  logRescheduleResult({ __error: 'Reschedule rejected by server' }, logger);
  assert.match(lines.at(-1), /FATAL.*rejected/);
});
