import test from 'node:test';
import assert from 'node:assert/strict';

import { createMonthFolderResolver } from '../../src/depot/monthFolders.js';

test('dry-run folder planning never creates missing Drive folders', async () => {
  const calls = [];
  const folderFor = createMonthFolderResolver({
    rootId: 'synthetic-root',
    dryRun: true,
    findFolder: async (name, parentId) => {
      calls.push(['find', name, parentId]);
      return null;
    },
    createFolder: async (name, parentId) => {
      calls.push(['create', name, parentId]);
      return 'created-id';
    },
    listNames: async (parentId) => {
      calls.push(['list', parentId]);
      return [];
    },
  });

  const folder = await folderFor('2026-08-31');

  assert.deepEqual(calls, [
    ['find', '2026', 'synthetic-root'],
  ]);
  assert.deepEqual(folder, {
    id: null,
    path: '2026/08',
    taken: new Set(),
    unknown: 0,
  });
});

test('live folder planning creates the hierarchy and resumes unknown numbering', async () => {
  const calls = [];
  const folderFor = createMonthFolderResolver({
    rootId: 'synthetic-root',
    dryRun: false,
    findFolder: async (name, parentId) => {
      calls.push(['find', name, parentId]);
      return null;
    },
    createFolder: async (name, parentId) => {
      calls.push(['create', name, parentId]);
      return name === '2026' ? 'year-id' : 'month-id';
    },
    listNames: async (parentId) => {
      calls.push(['list', parentId]);
      return [
        '2026-08-30_unknown-002.jpg',
        '2026-08-31_unknown-007.jpg',
        '2026-08-31_123456789.jpg',
      ];
    },
  });

  const folder = await folderFor('2026-08-31');

  assert.deepEqual(calls, [
    ['find', '2026', 'synthetic-root'],
    ['create', '2026', 'synthetic-root'],
    ['find', '08', 'year-id'],
    ['create', '08', 'year-id'],
    ['list', 'month-id'],
  ]);
  assert.equal(folder.id, 'month-id');
  assert.equal(folder.path, '2026/08');
  assert.equal(folder.unknown, 7);
  assert.deepEqual(folder.taken, new Set([
    '2026-08-30_unknown-002.jpg',
    '2026-08-31_unknown-007.jpg',
    '2026-08-31_123456789.jpg',
  ]));
});
