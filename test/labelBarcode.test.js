import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBarcode } from '../src/depot/labelBarcode.js';

test('Code128 keeps the parcel digit separate from the consignment number', () => {
  const decoded = parseBarcode('%007716015301328115592101372');

  assert.deepEqual(decoded, {
    number: '132811559',
    parcel: 2,
  });
});
