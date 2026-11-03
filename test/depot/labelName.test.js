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
    '2026-08-31_123456789.jpg',
  );
  assert.equal(
    buildLabelName({ ...label, parcel: 2 }),
    '2026-08-31_123456789-p02.jpg',
  );
  assert.equal(
    buildLabelName({ ...label, parcel: 10 }),
    '2026-08-31_123456789-p10.jpg',
  );
});

test('duplicate label photos receive the next free filename', () => {
  const base = '2026-08-31_123456789-p02.jpg';
  const taken = new Set([
    base,
    '2026-08-31_123456789-p02-2.jpg',
  ]);

  assert.equal(
    makeUnique(base, taken),
    '2026-08-31_123456789-p02-3.jpg',
  );
  assert.equal(
    makeUnique('2026-08-31_987654321.jpg', taken),
    '2026-08-31_987654321.jpg',
  );
});

test('unreadable labels get a zero-padded unknown index and lower-case extension', () => {
  assert.equal(
    buildLabelName({ date: '2026-08-31', unknownIndex: 7, originalName: 'IMG_0001.JPEG' }),
    '2026-08-31_unknown-007.jpeg',
  );
  assert.equal(
    buildLabelName({ date: '2026-08-31', unknownIndex: 12, originalName: 'no-extension' }),
    '2026-08-31_unknown-012.jpg',
  );
});

test('the file date is the Drive creation day, not a reformatted date', () => {
  assert.equal(dateOf('2026-09-01T23:59:59.000Z'), '2026-09-01');
  assert.equal(
    buildLabelName({ date: dateOf('2026-09-01T00:00:00.000Z'), number: '123456789', parcel: 1, originalName: 'a.jpg' }),
    '2026-09-01_123456789.jpg',
  );
});
