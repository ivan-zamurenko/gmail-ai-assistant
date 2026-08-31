import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBarcode, pickConsignment } from '../../src/depot/labelBarcode.js';

test('Code128 keeps the parcel digit separate from the consignment number', () => {
  // Layout: % + 7-character destination + 4-digit route +
  // 9-digit consignment + physical parcel number + trailing routing data.
  const parsed = parseBarcode('%000000000001234567892000000');

  assert.deepEqual(parsed, {
    number: '123456789',
    parcel: 2,
  });
});

test('Code128 requires the confirmed 28-character DPD layout', () => {
  // All 64 DPD Code128 records in the private label audit were exactly 28
  // characters. Reject truncated or extended payloads instead of parsing a prefix.
  const barcode = '%000000000001234567892000000';

  assert.equal(parseBarcode(barcode.slice(0, -1)), null);
  assert.equal(parseBarcode(`${barcode}0`), null);
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

test('PDF417 restores the full parcel number when Code128 wraps parcel 10 to 0', () => {
  // Code128 carries one parcel digit, while PDF417 routing can carry two.
  // Both synthetic candidates identify the same consignment and physical parcel.
  const picked = pickConsignment([
    {
      text: '%000000000001234567890000000',
      format: 'CODE_128',
      reads: 5,
    },
    {
      text: '%000012345678910;0000A0;AAAAAAAAAAA;000000;123456789;00/00/00',
      format: 'PDF_417',
      reads: 10,
    },
  ]);

  assert.deepEqual(picked, {
    number: '123456789',
    parcel: 10,
    format: 'PDF_417',
    reads: 15,
    contested: false,
  });
});

test('PDF417 fallback cannot overwrite an exact Code128 parcel', () => {
  // This PDF417 has a valid canonical consignment but no recognized routing,
  // so parseBarcode falls back to parcel 1. Code128 remains the exact source.
  const code128 = {
    text: '%000000000001234567892000000',
    format: 'CODE_128',
    reads: 3,
  };
  const pdf417WithoutRouting = {
    text: 'UNROUTED;0000A0;AAAAAAAAAAA;000000;123456789;00/00/00',
    format: 'PDF_417',
    reads: 2,
  };

  for (const candidates of [
    [code128, pdf417WithoutRouting],
    [pdf417WithoutRouting, code128],
  ]) {
    assert.deepEqual(pickConsignment(candidates), {
      number: '123456789',
      parcel: 2,
      format: 'PDF_417',
      reads: 5,
      contested: false,
    });
  }
});
