import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLabelName } from '../../src/depot/labelName.js';

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
