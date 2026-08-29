import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBarcode } from '../../src/depot/labelBarcode.js';

test('Code128 keeps the parcel digit separate from the consignment number', () => {
  // Layout: % + 7-character destination + 4-digit route +
  // 9-digit consignment + physical parcel number + trailing routing data.
  const parsed = parseBarcode('%000000000001234567892000000');

  assert.deepEqual(parsed, {
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

test('PDF417 rejects a damaged consignment field', () => {
  // Routing still looks valid, but canonical field 4 is only five digits.
  // Reject the whole record instead of trusting one contradictory section.
  const barcode = '%00001234567891;0000A0;AAAAAAAAAAA;000000;12345;00/00/00';

  assert.equal(parseBarcode(barcode), null);
});

test('PDF417 rejects contradictory consignment numbers', () => {
  // Both embedded numbers look valid alone, but they identify different
  // consignments. Ambiguity must stop processing instead of choosing either one.
  const barcode = '%00001234567891;0000A0;AAAAAAAAAAA;000000;987654321;00/00/00';

  assert.equal(parseBarcode(barcode), null);
});
