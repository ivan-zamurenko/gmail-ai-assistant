import test from 'node:test';
import assert from 'node:assert/strict';

import { processDriveLabels } from '../../src/depot/driveLabels.js';

// Synthetic Drive + depot boundary. Every request is recorded with its method
// and URL; anything the fixture does not know is rejected.
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const DEPOT_LOOKUP = 'https://depot.synthetic.invalid/lookup';
const ROOT = 'root-syn';
const BARCODE = [{ text: '%000000000001234567892000000', format: 'CODE_128', reads: 3 }];

function fakeServices(t, { folders = {}, names = {}, photos }) {
  const requests = [];
  const state = { folders: { ...folders }, created: 0 };
  const previous = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = new globalThis.URL(input);
    const method = (init.method ?? 'GET').toUpperCase();
    requests.push({ method, url: input, host: url.host });
    const json = (body) => ({ ok: true, status: 200, json: async () => body });

    if (input === DEPOT_LOOKUP && method === 'POST') return json({ found: true });
    if (url.origin + url.pathname === DRIVE && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      if (q.includes("mimeType contains 'image/'")) return json({ files: photos });
      const folder = q.match(/^name='([^']+)' and '([^']+)' in parents and mimeType='application\/vnd\.google-apps\.folder'/);
      if (folder) {
        const id = state.folders[`${folder[2]}/${folder[1]}`];
        return json({ files: id ? [{ id }] : [] });
      }
      const listing = q.match(/^'([^']+)' in parents and trashed=false$/);
      if (listing) return json({ files: (names[listing[1]] ?? []).map((name) => ({ name })) });
    }
    if (url.pathname.startsWith('/drive/v3/files/') && url.searchParams.get('alt') === 'media' && method === 'GET') {
      return { ok: true, status: 200, blob: async () => new globalThis.Blob(['synthetic-image']) };
    }
    if (url.origin + url.pathname === DRIVE && method === 'POST') {
      const body = JSON.parse(init.body);
      const id = `created-${++state.created}`;
      state.folders[`${body.parents[0]}/${body.name}`] = id;
      return json({ id });
    }
    if (url.pathname.startsWith('/drive/v3/files/') && method === 'PATCH') return json({ id: 'moved' });
    throw new Error(`unexpected synthetic request: ${method} ${input}`);
  };
  t.after(() => { globalThis.fetch = previous; });
  return { requests, state };
}

const isDriveMutation = (r) => r.host === 'www.googleapis.com' && r.method !== 'GET';

function run({ dryRun, readCodes = async () => BARCODE }) {
  return processDriveLabels({
    folderInput: `https://drive.google.com/drive/folders/${ROOT}`,
    token: 'synthetic-token',
    dryRun,
    // A real depot lookup is a POST; it is allowed in dry-run because it reads.
    verify: async (number) => {
      const res = await globalThis.fetch(DEPOT_LOOKUP, { method: 'POST', body: number });
      return (await res.json()).found && number === '123456789';
    },
    decodePhoto: async () => ({ synthetic: true }),
    readCodes,
  });
}

const PHOTO = { id: 'photo-syn-1', name: 'DRIVER-PHOTO.JPG', createdTime: '2026-10-09T12:00:00.000Z' };

test('dry-run with missing YYYY/MM folders sends only Drive GETs and plans the path', async (t) => {
  const net = fakeServices(t, { photos: [PHOTO] });

  const results = await run({ dryRun: true });

  assert.deepEqual(net.requests.filter(isDriveMutation), []);
  assert.equal(net.state.created, 0);
  for (const r of net.requests.filter((x) => x.host === 'www.googleapis.com')) {
    assert.equal(r.method, 'GET', r.url);
  }
  assert.deepEqual(results, [{
    from: 'DRIVER-PHOTO.JPG',
    to: '2026/10/2026-10-09_123456789-p02.jpg',
    number: '123456789',
    contested: false,
    error: null,
  }]);
  assert.doesNotMatch(results[0].to, /created-|root-syn/, 'preview must not invent a folder id');
});

test('dry-run with an existing month folder and a name collision still changes nothing', async (t) => {
  const net = fakeServices(t, {
    photos: [PHOTO, { ...PHOTO, id: 'photo-syn-2', name: 'SECOND.JPG' }],
    folders: { [`${ROOT}/2026`]: 'year-syn', 'year-syn/10': 'month-syn' },
    names: { 'month-syn': ['2026-10-09_123456789-p02.jpg', '2026-10-09_unknown-004.jpg'] },
  });
  let call = 0;

  const results = await run({ dryRun: true, readCodes: async () => (call++ === 0 ? BARCODE : []) });

  assert.deepEqual(net.requests.filter(isDriveMutation), []);
  assert.deepEqual(results.map((r) => r.to), [
    '2026/10/2026-10-09_123456789-p02-2.jpg',
    '2026/10/2026-10-09_unknown-005.jpg',
  ]);
  assert.deepEqual(results.map((r) => r.number), ['123456789', null]);
  assert.deepEqual(results.map((r) => r.error), [null, null]);
});

test('dry-run allows the depot lookup POST but no Drive mutation', async (t) => {
  const net = fakeServices(t, { photos: [PHOTO] });

  await run({ dryRun: true });

  const depot = net.requests.filter((r) => r.url === DEPOT_LOOKUP);
  assert.deepEqual(depot.map((r) => r.method), ['POST']);
  assert.deepEqual(net.requests.filter(isDriveMutation), []);
});

test('live run creates missing folders after verification, then moves once', async (t) => {
  const net = fakeServices(t, { photos: [PHOTO] });

  const results = await run({ dryRun: false });

  const steps = net.requests.map((r) => {
    if (r.url === DEPOT_LOOKUP) return 'verify';
    if (r.method === 'POST') return 'create-folder';
    if (r.method === 'PATCH') return 'move';
    if (r.url.includes('alt=media')) return 'download';
    return 'list';
  }).filter((step, i, all) => step !== 'list' || all[i - 1] !== 'list');
  assert.deepEqual(steps, ['list', 'download', 'verify', 'list', 'create-folder', 'list', 'create-folder', 'list', 'move']);

  const move = new globalThis.URL(net.requests.find((r) => r.method === 'PATCH').url);
  assert.equal(move.pathname, '/drive/v3/files/photo-syn-1');
  assert.equal(move.searchParams.get('addParents'), 'created-2');
  assert.equal(move.searchParams.get('removeParents'), ROOT);
  assert.equal(results[0].to, '2026/10/2026-10-09_123456789-p02.jpg');
});
