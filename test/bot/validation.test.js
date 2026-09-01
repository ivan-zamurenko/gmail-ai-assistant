import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateConsignmentNumber,
  validateFutureWorkday,
} from '../../bot/src/validation.js';

test('manual reschedule input requires an explicit parcel number and real future date', () => {
  assert.match(validateConsignmentNumber('12345678'), /9 або 14/);
  assert.equal(validateConsignmentNumber('012345678'), null);
  assert.equal(validateConsignmentNumber('12345678901234'), null);

  assert.match(validateFutureWorkday('2026-02-30'), /календарна/);
  assert.match(validateFutureWorkday('2000-01-03'), /пізніше/);
});
