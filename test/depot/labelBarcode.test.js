import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acceptExactConsignment,
  parseBarcode,
  pickConsignment,
} from '../../src/depot/labelBarcode.js';

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
  for (const invalid of [null, undefined, 42, {}, '', ' '+barcode, barcode+' ',
    barcode.slice(0, -6)+'BAD!!!', barcode.replace('%', '!')]) {
    assert.equal(parseBarcode(invalid), null);
  }
});

test('legacy Code128 card adds the explicit eight-digit lookup marker', () => {
  const parsed = parseBarcode('12345678/2');

  assert.deepEqual(parsed, {
    number: '012345678',
    parcel: 2,
  });
  assert.equal(parseBarcode('12345678'), null);
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

test('PDF417 without routing cannot overwrite an exact Code128 parcel', () => {
  // This PDF417 has a valid canonical consignment but no recognized routing,
  // so its parcel is unknown. Code128 remains the exact parcel source.
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

test('PDF417 without a physical parcel number can select its consignment target', () => {
  const parsed = parseBarcode(
    'UNROUTED;0000A0;AAAAAAAAAAA;000000;123456789;00/00/00',
  );
  const candidate = pickConsignment([
    {
      text: 'UNROUTED;0000A0;AAAAAAAAAAA;000000;123456789;00/00/00',
      format: 'PDF_417',
      reads: 2,
    },
  ]);

  assert.deepEqual(parsed, {
    number: '123456789',
    parcel: null,
  });
  assert.equal(candidate.parcel, null);
  assert.equal(acceptExactConsignment(candidate), candidate);
});

test('contested barcode numbers cannot select a depot lookup target', () => {
  const candidate = pickConsignment([
    {
      text: '%000000000001234567891000000',
      format: 'CODE_128',
      reads: 4,
    },
    {
      text: '%000000000009876543212000000',
      format: 'CODE_128',
      reads: 1,
    },
  ]);

  assert.equal(candidate.contested, true);
  assert.equal(acceptExactConsignment(candidate), null);
});

test('barcode conflicts preserve candidates without choosing by reads or PDF priority', () => {
  const strip = (number, parcel, reads = 1) => ({
    text: `%00000000000${number}${parcel}000000`, format: 'CODE_128', reads,
  });
  const pdf = (number, parcel) => ({
    text: `%0000${number}${parcel};0000A0;PRIVATE_PAYLOAD;000000;${number};00/00/00`, format: 'PDF_417', reads: 100,
  });
  for (const [codes, reason] of [
    [[strip('123456789', 1, 100), pdf('987654321', 2)], 'multiple-consignments'],
    [[strip('123456789', 1), strip('123456789', 2, 100)], 'conflicting-parcels'],
    [[pdf('123456789', 10), pdf('123456789', 20)], 'conflicting-parcels'],
    [[strip('123456789', 1), pdf('123456789', 10)], 'conflicting-parcels'],
    [[{ text: '12345678/1', format: 'CODE_128', reads: 5 }, { text: '12345678/11', format: 'CODE_128', reads: 1 }], 'conflicting-parcels'],
  ]) {
    for (const input of [codes, [...codes].reverse(), [...codes, codes[0]]]) {
      const candidate = pickConsignment(input);
      assert.equal(candidate.contested, true);
      assert.equal(candidate.number, null, 'ambiguous result cannot present a winning number');
      assert.equal(candidate.parcel, null);
      assert.equal(candidate.reason, reason);
      assert.equal(candidate.candidates.length, 2, 'repeat reads do not add a candidate');
      assert.equal(acceptExactConsignment(candidate), null);
      assert.doesNotMatch(JSON.stringify(candidate), /PRIVATE_PAYLOAD|;|"text"/);
      assert.ok(candidate.candidates.every(item => /^\d{9}$/.test(item.number) && Number.isInteger(item.parcel)));
    }
  }
  for (const invalid of [null, {}, [null], [{ ...strip('123456789', 1), format: 'PRIVATE_PAYLOAD' }]]) {
    assert.equal(pickConsignment(invalid), null);
  }
  const invalidReads = pickConsignment([
    { ...strip('123456789', 1), reads: 'PRIVATE_PAYLOAD' },
    { ...strip('123456789', 2), reads: Infinity },
  ]);
  assert.equal(invalidReads.contested, true, 'invalid diagnostic counts cannot erase an identity conflict');
  assert.ok(invalidReads.candidates.every(item => item.reads === 0));
  assert.doesNotMatch(JSON.stringify(invalidReads), /PRIVATE_PAYLOAD/);
  const repeated = pickConsignment([strip('123456789', 2), strip('123456789', 2)]);
  assert.equal(repeated.contested, false);
  assert.equal(repeated.parcel, 2);
  for (const codes of [
    [strip('123456789', 0), pdf('123456789', 10)],
    [strip('123456789', 1), pdf('123456789', 11)],
  ]) {
    for (const input of [codes, [...codes].reverse()]) {
      assert.equal(pickConsignment(input).contested, false);
      assert.equal(pickConsignment(input).parcel, Number(codes[1].text.split(';')[0].slice(14)));
    }
  }
});
