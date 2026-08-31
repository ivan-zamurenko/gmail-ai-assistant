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

test('depot-rejected barcode is filed under the next unknown name', async () => {
  const verified = [];
  const moves = [];
  const folder = {
    id: 'synthetic-month',
    path: '2026/08',
    taken: new Set(['2026-08-30_unknown-007.jpg']),
    unknown: 7,
  };
  const photo = {
    id: 'synthetic-photo',
    name: 'DRIVER-PHOTO.JPG',
    createdTime: '2026-08-31T12:00:00.000Z',
  };

  const results = await processLabelBatch({
    photos: [photo],
    dryRun: false,
    verify: async (number) => {
      verified.push(number);
      return false;
    },
    loadPhoto: async () => ({ synthetic: true }),
    readCodes: () => [{
      text: '%000000000001234567892000000',
      format: 'CODE_128',
      reads: 3,
    }],
    folderFor: async () => folder,
    movePhoto: async (...args) => moves.push(args),
  });

  assert.deepEqual(verified, ['123456789']);
  assert.equal(moves.length, 1);
  assert.equal(moves[0][0], photo);
  assert.equal(moves[0][1], folder);
  assert.equal(moves[0][2], '2026-08-31_unknown-008.jpg');
  assert.deepEqual(results, [{
    from: 'DRIVER-PHOTO.JPG',
    to: '2026/08/2026-08-31_unknown-008.jpg',
    number: null,
    contested: false,
    error: null,
  }]);
});

test('verified live label is moved once with its exact parcel filename', async () => {
  const moves = [];
  const folder = {
    id: 'synthetic-month',
    path: '2026/08',
    taken: new Set(),
    unknown: 0,
  };
  const photo = {
    id: 'synthetic-photo',
    name: 'DRIVER-PHOTO.JPG',
    createdTime: '2026-08-31T12:00:00.000Z',
  };

  const results = await processLabelBatch({
    photos: [photo],
    dryRun: false,
    verify: async (number) => number === '123456789',
    loadPhoto: async () => ({ synthetic: true }),
    readCodes: () => [
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
    ],
    folderFor: async () => folder,
    movePhoto: async (...args) => moves.push(args),
  });

  assert.equal(moves.length, 1);
  assert.equal(moves[0][0], photo);
  assert.equal(moves[0][1], folder);
  assert.equal(moves[0][2], '2026-08-31_123456789-p10.jpg');
  assert.deepEqual(results, [{
    from: 'DRIVER-PHOTO.JPG',
    to: '2026/08/2026-08-31_123456789-p10.jpg',
    number: '123456789',
    contested: false,
    error: null,
  }]);
  assert.equal(folder.taken.has('2026-08-31_123456789-p10.jpg'), true);
});
