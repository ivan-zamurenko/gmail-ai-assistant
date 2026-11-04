import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLabelName, dateOf, makeUnique } from '../../src/depot/labelName.js';

test('label filenames preserve the exact physical parcel number', () => {
  const label = {
    date: '2026-08-31',
    number: '123456789',
    originalName: 'DRIVER-PHOTO.JPG',
  };

  assert.equal(
    buildLabelName({ ...label, parcel: 1 }),
    '123456789_p01_2026-08-31.jpg',
  );
  assert.equal(
    buildLabelName({ ...label, parcel: 2 }),
    '123456789_p02_2026-08-31.jpg',
  );
  assert.equal(
    buildLabelName({ ...label, parcel: 10 }),
    '123456789_p10_2026-08-31.jpg',
  );
  // Owner 2026-11-04: number first, parcel always; no parcel on the label → no guessed pNN.
  assert.equal(buildLabelName({ ...label, parcel: null }), '123456789_2026-08-31.jpg');
  assert.equal(buildLabelName({ ...label, number: '012345678', parcel: 3 }), '012345678_p03_2026-08-31.jpg');
});

test('duplicate label photos receive the next free filename', () => {
  const base = '123456789_p02_2026-08-31.jpg';
  const taken = new Set([
    base,
    '123456789_p02_2026-08-31-2.jpg',
  ]);

  assert.equal(
    makeUnique(base, taken),
    '123456789_p02_2026-08-31-3.jpg',
  );
  assert.equal(
    makeUnique('987654321_p01_2026-08-31.jpg', taken),
    '987654321_p01_2026-08-31.jpg',
  );
});

test('unreadable labels get a zero-padded unknown index and lower-case extension', () => {
  assert.equal(
    buildLabelName({ date: '2026-08-31', unknownIndex: 7, originalName: 'IMG_0001.JPEG' }),
    'unknown-007_2026-08-31.jpeg',
  );
  assert.equal(
    buildLabelName({ date: '2026-08-31', unknownIndex: 12, originalName: 'no-extension' }),
    'unknown-012_2026-08-31.jpg',
  );
});

test('the file date is the Irish calendar day of the Drive upload (G_DRIVE_POLICY)', () => {
  // Summer (IST, UTC+1): late UTC evening is already the next Irish day.
  assert.equal(dateOf('2026-09-01T23:30:00.000Z'), '2026-09-02');
  assert.equal(dateOf('2026-09-01T22:59:59Z'), '2026-09-01');
  // Winter (GMT): Irish day equals the UTC day.
  assert.equal(dateOf('2026-11-04T23:30:00.000Z'), '2026-11-04');
  // DST start 29 Mar 2026: 00:30 UTC is 00:30 GMT, 01:30 UTC is 02:30 IST.
  assert.equal(dateOf('2026-03-29T00:30:00Z'), '2026-03-29');
  assert.equal(dateOf('2026-03-28T23:30:00Z'), '2026-03-28');
  assert.equal(
    buildLabelName({ date: dateOf('2026-09-01T00:00:00.000Z'), number: '123456789', parcel: 1, originalName: 'a.jpg' }),
    '123456789_p01_2026-09-01.jpg',
  );
});

test('a missing or invalid upload time is an explicit error, never today or a truncated guess', () => {
  for (const value of [undefined, null, '', 'not a date', '2026-02-31T10:00:00Z', '2026-09-01', 'x2026-09-01T10:00:00Z', 12345]) {
    assert.throws(() => dateOf(value), /Photo upload time missing or invalid/, String(value));
  }
});
