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

test('PDF417 reads a confirmed anonymized DPD record', () => {
  // An actual locally decoded record had 31 fields. Only the anonymized prefix
  // needed by parseBarcode is retained here: routing is % + prefix + number + parcel.
  const barcode = [
    '%00001234567891',
    '0000A0',
    'AAAAAAAAAAA',
    '000000',
    '123456789',
    '00/00/00',
  ].join(';');

  const parsed = parseBarcode(barcode);

  assert.deepEqual(parsed, {
    number: '123456789',
    parcel: 1,
  });
});
