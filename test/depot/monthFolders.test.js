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
