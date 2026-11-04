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
    readCodes: async () => [{
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
    to: '2026/08/123456789_p02_2026-08-31.jpg',
    number: '123456789',
    contested: false,
    error: null,
  }]);
  assert.equal(folder.taken.has('123456789_p02_2026-08-31.jpg'), true);
});

test('depot-rejected barcode is filed under the next unknown name', async () => {
  const verified = [];
  const moves = [];
  const folder = {
    id: 'synthetic-month',
    path: '2026/08',
    taken: new Set(['unknown-007_2026-08-30.jpg']),
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
  assert.equal(moves[0][2], 'unknown-008_2026-08-31.jpg');
  assert.deepEqual(results, [{
    from: 'DRIVER-PHOTO.JPG',
    to: '2026/08/unknown-008_2026-08-31.jpg',
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
  assert.equal(moves[0][2], '123456789_p10_2026-08-31.jpg');
  assert.deepEqual(results, [{
    from: 'DRIVER-PHOTO.JPG',
    to: '2026/08/123456789_p10_2026-08-31.jpg',
    number: '123456789',
    contested: false,
    error: null,
  }]);
  assert.equal(folder.taken.has('123456789_p10_2026-08-31.jpg'), true);
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
  assert.equal(moves[0][2], '012345678_p02_2026-09-01.jpg');
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
    to: '2026/09/123456789_2026-09-01.jpg',
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
      error: 'Label processing failed',
    },
    {
      from: 'GOOD-PHOTO.JPG',
      to: '2026/08/123456789_p02_2026-08-31.jpg',
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

test('uncertain folder creation, cancellation and auth stop new effects while preserving partial results', async () => {
  for (const errorCode of ['uncertain-write', 'aborted', 'unauthenticated', 'permission-denied']) {
    let loaded = 0;
    let folders = 0;
    const results = await processLabelBatch({
      photos: [1, 2, 3].map(n => ({ id: n, name: `${n}.jpg`, createdTime: '2026-10-28T10:00:00Z' })),
      dryRun: false,
      loadPhoto: async () => { loaded++; return {}; },
      readCodes: async () => [], verify: async () => false,
      folderFor: async () => {
        if (++folders === 2) throw Object.assign(new Error('synthetic-secret'), { code: errorCode });
        return { id: 'folder', path: '2026/10', unknown: 0, taken: new Set() };
      },
      movePhoto: async () => {},
    });
    assert.equal(loaded, 2);
    assert.equal(folders, 2);
    assert.equal(results.length, 3);
    assert.equal(results[0].error, null);
    assert.equal(results[1].errorCode, errorCode);
    assert.match(results[2].error, /not processed/i);
    assert.doesNotMatch(JSON.stringify(results), /synthetic-secret/);
  }
});

test('ambiguous photo never reaches lookup; it is filed as unknown and flagged for review (G_DRIVE_POLICY)', async () => {
  const strip = (number, parcel) => ({ text: `%00000000000${number}${parcel}000000`, format: 'CODE_128', reads: 1 });
  for (const dryRun of [true, false]) {
    for (const codes of [
      [strip('123456789', 1), strip('987654321', 2)],
      [strip('123456789', 1), strip('123456789', 2)],
    ]) {
      const calls = [];
      const folder = { path: '2026/08', taken: new Set(), unknown: 4 };
      const results = await processLabelBatch({
        photos: [{ id: 'synthetic-photo', name: 'synthetic.jpg', createdTime: '2026-08-31T12:00:00Z' }],
        dryRun,
        loadPhoto: async () => ({}), readCodes: () => codes,
        verify: async () => { calls.push('verify'); return true; },
        folderFor: async () => { calls.push('folder'); return folder; },
        movePhoto: async (photo, target, name) => { calls.push(`move:${name}`); },
      });
      assert.deepEqual(calls, dryRun ? ['folder'] : ['folder', 'move:unknown-005_2026-08-31.jpg']);
      assert.equal(results[0].to, '2026/08/unknown-005_2026-08-31.jpg');
      assert.equal(results[0].status, 'ambiguous');
      assert.equal(results[0].errorCode, 'ambiguous-barcode');
      assert.equal(results[0].number, null, 'never a reschedule target');
      assert.equal(results[0].contested, true);
      assert.equal(results[0].candidates.length, 2);
      assert.equal(results[0].error, null);
      assert.match(results[0].review, /several consignment numbers.*review/i);
    }
  }
});

test('missing upload time leaves the photo untouched before download or depot access', async () => {
  const calls = [];
  const results = await processLabelBatch({
    photos: [{ id: 'p1', name: 'DRIVER.JPG' }],
    dryRun: false,
    verify: async () => { calls.push('verify'); return true; },
    loadPhoto: async () => { calls.push('load'); return {}; },
    readCodes: async () => [],
    folderFor: async () => { calls.push('folder'); return { id: 'f', path: '2026/08', taken: new Set(), unknown: 0 }; },
    movePhoto: async () => { calls.push('move'); },
  });
  assert.deepEqual(calls, []);
  assert.equal(results[0].to, null);
  assert.equal(results[0].number, null);
  assert.equal(results[0].error, 'Photo upload time missing or invalid; left untouched');
});

test('an already-named file keeps its name only when the fresh verified read matches', async () => {
  const BARCODE = [{ text: '%000000000001234567892000000', format: 'CODE_128', reads: 3 }];
  async function rerun(name, { codes = BARCODE, knownNumbers = ['123456789'] } = {}) {
    const moves = [];
    const folder = { id: 'month', path: '2026/08', taken: new Set(), unknown: 4 };
    const [result] = await processLabelBatch({
      photos: [{ id: 'p1', name, createdTime: '2026-08-31T12:00:00.000Z' }],
      dryRun: false,
      verify: async number => knownNumbers.includes(number),
      loadPhoto: async () => ({}),
      readCodes: async () => codes,
      folderFor: async () => folder,
      movePhoto: async (photo, target, newName) => moves.push(newName),
    });
    return { result, moves };
  }

  const same = await rerun('2026-08-31_123456789-p02.jpg');
  assert.deepEqual(same.moves, ['2026-08-31_123456789-p02.jpg']);
  assert.equal(same.result.number, '123456789');

  const unknownStill = await rerun('2026-08-31_unknown-003.jpg', { codes: [] });
  assert.deepEqual(unknownStill.moves, ['2026-08-31_unknown-003.jpg']);

  for (const [name, options] of [
    ['2026-08-31_987654321-p02.jpg', {}],
    ['2026-08-31_123456789-p02.jpg', { codes: [] }],
    ['2026-08-31_123456789-p02.jpg', { knownNumbers: [] }],
    ['2026-08-31_unknown-003.jpg', {}],
  ]) {
    const mismatch = await rerun(name, options);
    assert.deepEqual(mismatch.moves, [], `${name} must not be moved or renamed`);
    assert.equal(mismatch.result.to, null);
    assert.equal(mismatch.result.number, null, 'a stale name never becomes a reschedule target');
    assert.equal(mismatch.result.errorCode, 'name-mismatch');
    assert.equal(mismatch.result.error, 'Existing name does not match the fresh read; left for review');
  }
});

test('the same snapshot always produces the same names (known, parcel, unknown, collision)', async () => {
  const BARCODE = [{ text: '%000000000001234567892000000', format: 'CODE_128', reads: 3 }];
  const photos = [
    { id: 'a', name: 'A.JPG', createdTime: '2026-08-31T23:30:00Z' },
    { id: 'b', name: 'B.JPG', createdTime: '2026-08-31T23:31:00Z' },
    { id: 'c', name: 'C.png', createdTime: '2026-08-31T10:00:00Z' },
  ];
  const run = () => {
    // Like createMonthFolderResolver: one cached state per month within a run.
    const folders = new Map();
    return processLabelBatch({
      photos, dryRun: true,
      verify: async () => true,
      loadPhoto: async photo => photo.id,
      readCodes: async id => (id === 'c' ? [] : BARCODE),
      folderFor: async date => {
        const path = date.slice(0, 7).replace('-', '/');
        if (!folders.has(path)) folders.set(path, { id: null, path, taken: new Set(['123456789_p02_2026-09-01.jpg']), unknown: 2 });
        return folders.get(path);
      },
      movePhoto: async () => assert.fail('dry-run must not move'),
    });
  };
  const first = await run();
  assert.deepEqual(first.map(r => r.to), [
    '2026/09/123456789_p02_2026-09-01-2.jpg',
    '2026/09/123456789_p02_2026-09-01-3.jpg',
    '2026/08/unknown-003_2026-08-31.png',
  ]);
  assert.deepEqual(await run(), first);
});

test('re-run recognises current number-first names as well as earlier date-first ones', async () => {
  const BARCODE = [{ text: '%000000000001234567892000000', format: 'CODE_128', reads: 3 }];
  const rerun = async (name, codes = BARCODE) => {
    const moves = [];
    const [result] = await processLabelBatch({
      photos: [{ id: 'p1', name, createdTime: '2026-08-31T12:00:00.000Z' }], dryRun: false,
      verify: async number => number === '123456789', loadPhoto: async () => ({}), readCodes: async () => codes,
      folderFor: async () => ({ id: 'm', path: '2026/08', taken: new Set(), unknown: 0 }),
      movePhoto: async (photo, folder, newName) => moves.push(newName),
    });
    return { result, moves };
  };
  assert.deepEqual((await rerun('123456789_p02_2026-08-31.jpg')).moves, ['123456789_p02_2026-08-31.jpg']);
  assert.deepEqual((await rerun('123456789_p02_2026-08-31-2.jpg')).moves, ['123456789_p02_2026-08-31-2.jpg']);
  assert.deepEqual((await rerun('unknown-004_2026-08-31.jpg', [])).moves, ['unknown-004_2026-08-31.jpg']);
  const mismatch = await rerun('987654321_p01_2026-08-31.jpg');
  assert.deepEqual(mismatch.moves, []);
  assert.equal(mismatch.result.errorCode, 'name-mismatch');
});
