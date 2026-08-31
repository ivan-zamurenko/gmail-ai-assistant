import test from 'node:test';
import assert from 'node:assert/strict';

import { processLabelBatch } from '../../src/depot/labelBatch.js';

test('dry-run label batch plans a verified file without moving it', async () => {
  const moves = [];
  const folder = {
    id: null,
    path: '2026/08',
    taken: new Set(),
    unknown: 0,
  };

  const results = await processLabelBatch({
    photos: [{
      id: 'synthetic-photo',
      name: 'DRIVER-PHOTO.JPG',
      createdTime: '2026-08-31T12:00:00.000Z',
    }],
    dryRun: true,
    verify: async (number) => number === '123456789',
    loadPhoto: async () => ({ synthetic: true }),
    readCodes: () => [{
      text: '%000000000001234567892000000',
      format: 'CODE_128',
      reads: 3,
    }],
    folderFor: async () => folder,
    movePhoto: async (...args) => moves.push(args),
  });

  assert.deepEqual(moves, []);
  assert.deepEqual(results, [{
    from: 'DRIVER-PHOTO.JPG',
    to: '2026/08/2026-08-31_123456789-p02.jpg',
    number: '123456789',
    contested: false,
    error: null,
  }]);
  assert.equal(folder.taken.has('2026-08-31_123456789-p02.jpg'), true);
});
