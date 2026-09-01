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

test('legacy eight-digit card reaches verification with its zero marker', async () => {
  const verified = [];
  const moves = [];
  const folder = {
    id: 'synthetic-month',
    path: '2026/09',
    taken: new Set(),
    unknown: 0,
  };
  const photo = {
    id: 'synthetic-photo',
    name: 'DRIVER-PHOTO.JPG',
    createdTime: '2026-09-01T12:00:00.000Z',
  };

  const results = await processLabelBatch({
    photos: [photo],
    dryRun: false,
    verify: async (number) => {
      verified.push(number);
      return number === '012345678';
    },
    loadPhoto: async () => ({ synthetic: true }),
    readCodes: () => [{
      text: '12345678/2',
      format: 'CODE_128',
      reads: 3,
    }],
    folderFor: async () => folder,
    movePhoto: async (...args) => moves.push(args),
  });

  assert.deepEqual(verified, ['012345678']);
  assert.equal(moves.length, 1);
  assert.equal(moves[0][2], '2026-09-01_012345678-p02.jpg');
  assert.equal(results[0].number, '012345678');
});

test('consignment without a physical parcel number still reaches depot verification', async () => {
  const verified = [];
  const folder = {
    id: null,
    path: '2026/09',
    taken: new Set(),
    unknown: 0,
  };

  const results = await processLabelBatch({
    photos: [{
      id: 'synthetic-photo',
      name: 'DRIVER-PHOTO.JPG',
      createdTime: '2026-09-01T12:00:00.000Z',
    }],
    dryRun: true,
    verify: async (number) => {
      verified.push(number);
      return number === '123456789';
    },
    loadPhoto: async () => ({ synthetic: true }),
    readCodes: () => [{
      text: 'UNROUTED;0000A0;AAAAAAAAAAA;000000;123456789;00/00/00',
      format: 'PDF_417',
      reads: 2,
    }],
    folderFor: async () => folder,
    movePhoto: async () => {
      throw new Error('Dry-run must not move photos');
    },
  });

  assert.deepEqual(verified, ['123456789']);
  assert.deepEqual(results, [{
    from: 'DRIVER-PHOTO.JPG',
    to: '2026/09/2026-09-01_123456789.jpg',
    number: '123456789',
    contested: false,
    error: null,
  }]);
});

test('batch contains photo failures but stops immediately on a fatal depot failure', async () => {
  const photos = [
    {
      id: 'bad-photo',
      name: 'BAD-PHOTO.JPG',
      createdTime: '2026-08-31T12:00:00.000Z',
    },
    {
      id: 'good-photo',
      name: 'GOOD-PHOTO.JPG',
      createdTime: '2026-08-31T12:01:00.000Z',
    },
  ];
  const folder = {
    id: null,
    path: '2026/08',
    taken: new Set(),
    unknown: 0,
  };
  const code = {
    text: '%000000000001234567892000000',
    format: 'CODE_128',
    reads: 3,
  };

  const continued = await processLabelBatch({
    photos,
    dryRun: true,
    verify: async () => true,
    loadPhoto: async (photo) => {
      if (photo.id === 'bad-photo') throw new Error('Synthetic unreadable image');
      return { synthetic: true };
    },
    readCodes: () => [code],
    folderFor: async () => folder,
    movePhoto: async () => {
      throw new Error('Dry-run must not move photos');
    },
  });

  assert.deepEqual(continued, [
    {
      from: 'BAD-PHOTO.JPG',
      to: null,
      number: null,
      contested: false,
      error: 'Synthetic unreadable image',
    },
    {
      from: 'GOOD-PHOTO.JPG',
      to: '2026/08/2026-08-31_123456789-p02.jpg',
      number: '123456789',
      contested: false,
      error: null,
    },
  ]);

  const fatal = Object.assign(new Error('Synthetic depot unavailable'), { fatal: true });
  let loaded = 0;
  await assert.rejects(
    processLabelBatch({
      photos,
      dryRun: true,
      verify: async () => { throw fatal; },
      loadPhoto: async () => {
        loaded += 1;
        return { synthetic: true };
      },
      readCodes: () => [code],
      folderFor: async () => folder,
      movePhoto: async () => {},
    }),
    (error) => error === fatal,
  );
  assert.equal(loaded, 1);
});
