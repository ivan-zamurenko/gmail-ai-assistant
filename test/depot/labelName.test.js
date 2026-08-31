import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLabelName, makeUnique } from '../../src/depot/labelName.js';

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
