import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBarcode } from '../../src/depot/labelBarcode.js';

test('Code128 keeps the parcel digit separate from the consignment number', () => {
  const decoded = parseBarcode('%000000000001234567892000000');

  assert.deepEqual(decoded, {
    number: '123456789',
    parcel: 2,
  });
});
