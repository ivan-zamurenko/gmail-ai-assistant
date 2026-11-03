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
  const now = new Date('2026-04-01T12:00:00Z');
  assert.match(validateFutureWorkday('2026-04-03', now), /свят/);
  assert.equal(validateFutureWorkday('2026-04-07', now), null);
  assert.match(validateFutureWorkday('2028-01-04', now), /календар/);
});
