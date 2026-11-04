import test from 'node:test';
import assert from 'node:assert/strict';

import { processDriveLabels } from '../../src/depot/driveLabels.js';

// Synthetic Drive + depot boundary. Every request is recorded with its method
// and URL; anything the fixture does not know is rejected.
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const DEPOT_LOOKUP = 'https://depot.synthetic.invalid/lookup';
const ROOT = 'root-syn';
const BARCODE = [{ text: '%000000000001234567892000000', format: 'CODE_128', reads: 3 }];

function fakeServices(t, { folders = {}, names = {}, photos, meta = {}, existing = {} }) {
  const requests = [];
  const state = { folders: { ...folders }, created: 0 };
  const previous = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = new globalThis.URL(input);
    const method = (init.method ?? 'GET').toUpperCase();
    requests.push({ method, url: input, host: url.host });
    const json = (body) => ({ ok: true, status: 200, json: async () => body });

    if (url.origin + url.pathname === `${DRIVE}/${ROOT}` && method === 'GET') {
      return json({ id: ROOT, mimeType: 'application/vnd.google-apps.folder', trashed: false });
    }
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
      if (listing) return json({ files: (names[listing[1]] ?? []).map((name, index) => ({ id: `existing-${index}`, name })) });
    }
    // Fresh metadata of one photo right before the move (S04-02 stale check).
    const fileId = url.pathname.slice('/drive/v3/files/'.length);
    if (fileId && method === 'GET' && !url.searchParams.get('alt') && fileId !== ROOT) {
      const photo = photos.find(p => p.id === fileId);
      return json({ ...photo, ...(meta[fileId] ?? {}) });
    }
    if (url.origin + url.pathname === DRIVE && method === 'GET') {
      const clash = (url.searchParams.get('q') ?? '').match(/^name='([^']+)' and '([^']+)' in parents and trashed=false$/);
      if (clash) return json({ files: (existing[clash[2]] ?? []).filter(n => n === clash[1]).map(name => ({ id: 'someone-else', name })) });
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

const PHOTO = { mimeType: 'image/jpeg', trashed: false, parents: [ROOT], id: 'photo-syn-1', name: 'DRIVER-PHOTO.JPG', createdTime: '2026-10-09T12:00:00.000Z', version: '7' };

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
    to: '2026/10/123456789_p02_2026-10-09.jpg',
    number: '123456789',
    contested: false,
    error: null,
    fileId: 'photo-syn-1',
    source: { name: 'DRIVER-PHOTO.JPG', parents: [ROOT], version: '7' },
    policyVersion: 'drive-labels-2026-11-04.2',
  }]);
  assert.doesNotMatch(results[0].to, /created-|root-syn/, 'preview must not invent a folder id');
});

test('dry-run with an existing month folder and a name collision still changes nothing', async (t) => {
  const net = fakeServices(t, {
    photos: [PHOTO, { ...PHOTO, id: 'photo-syn-2', name: 'SECOND.JPG' }],
    folders: { [`${ROOT}/2026`]: 'year-syn', 'year-syn/10': 'month-syn' },
    names: { 'month-syn': ['123456789_p02_2026-10-09.jpg', 'unknown-004_2026-10-09.jpg'] },
  });
  let call = 0;

  const results = await run({ dryRun: true, readCodes: async () => (call++ === 0 ? BARCODE : []) });

  assert.deepEqual(net.requests.filter(isDriveMutation), []);
  assert.deepEqual(results.map((r) => r.to), [
    '2026/10/123456789_p02_2026-10-09-2.jpg',
    '2026/10/unknown-005_2026-10-09.jpg',
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
  assert.equal(results[0].to, '2026/10/123456789_p02_2026-10-09.jpg');
});

test('Drive uncertain create stops next photo, and abort stops before network', async (t) => {
  const net = fakeServices(t, { photos: [PHOTO, { ...PHOTO, id: 'photo-syn-2' }] });
  const baseFetch = globalThis.fetch;
  let creates = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (url.startsWith(DRIVE) && init.method === 'POST') { creates++; throw new Error('synthetic-private-body'); }
    return baseFetch(url, init);
  };
  const results = await run({ dryRun: false });
  assert.equal(creates, 1);
  assert.equal(results[0].errorCode, 'uncertain-write');
  assert.match(results[1].error, /not processed/i);
  assert.equal(net.requests.filter(r => r.url.includes('alt=media')).length, 1);
  const controller = new globalThis.AbortController();
  controller.abort();
  const before = net.requests.length;
  await assert.rejects(processDriveLabels({ folderInput: ROOT, token: 'synthetic-token', signal: controller.signal }), { code: 'aborted' });
  assert.equal(net.requests.length, before);
});

// Real Drive adapter; only provider responses are synthetic.
function listingServices(t, { pages = [], folderStatus = 200, folder = {}, failPage = -1 } = {}) {
  const calls = [];
  let page = 0;
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new globalThis.URL(input);
    calls.push({ url, method: init.method ?? 'GET' });
    const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
    if (url.pathname === `/drive/v3/files/${ROOT}`) {
      return json({ id: ROOT, mimeType: 'application/vnd.google-apps.folder', trashed: false, ...folder }, folderStatus);
    }
    if (url.searchParams.get('alt') === 'media') {
      return { ok: true, status: 200, blob: async () => new globalThis.Blob(['synthetic']) };
    }
    const query = url.searchParams.get('q') ?? '';
    if (query.startsWith("name='")) return json({ files: [] });
    const index = page++;
    if (index === failPage) return json({}, 403);
    if (index >= pages.length) throw new Error('Unexpected extra page');
    return json(pages[index]);
  });
  return calls;
}
const scanOptions = overrides => ({
  folderInput: ROOT, token: 'synthetic-token', dryRun: true,
  verify: async () => true, decodePhoto: async () => ({}), readCodes: () => BARCODE,
  ...overrides,
});

test('Drive complete snapshot deduplicates pages and reports excluded images without downloading them', async t => {
  const calls = listingServices(t, { pages: [
    { files: [PHOTO, { ...PHOTO, id: 'svg', mimeType: 'image/svg+xml' }], nextPageToken: 'next/encoded?' },
    { files: [PHOTO, { ...PHOTO, id: 'photo-2' },
      { ...PHOTO, id: 'trashed', trashed: true }, { ...PHOTO, id: 'foreign', parents: ['other-folder'] },
      { ...PHOTO, id: 'shortcut', mimeType: 'application/vnd.google-apps.shortcut' },
      { ...PHOTO, id: 'missing-type', mimeType: undefined }] },
  ] });
  const results = await processDriveLabels(scanOptions());
  assert.equal(results.filter(item => !item.error).length, 2);
  assert.equal(results.filter(item => item.status === 'skipped').length, 5);
  assert.ok(results.filter(item => item.status === 'skipped').every(item => item.to === null && item.number === null && item.errorCode === 'unsupported-drive-item'));
  const downloads = calls.filter(call => call.url.searchParams.get('alt') === 'media');
  assert.deepEqual(downloads.map(call => call.url.pathname), ['/drive/v3/files/photo-syn-1', '/drive/v3/files/photo-2']);
  assert.equal(calls[0].url.pathname, `/drive/v3/files/${ROOT}`);
  assert.equal(calls[2].url.searchParams.get('pageToken'), 'next/encoded?');
  assert.ok(calls.every(call => call.method === 'GET'));
});

test('Drive rejects inaccessible folders and incomplete or malformed pagination before downloads', async t => {
  for (const scenario of [
    { folderStatus: 403, error: /HTTP 403/ }, { folderStatus: 404, error: /HTTP 404/ },
    { folder: { mimeType: 'image/jpeg' }, error: /Drive folder invalid/ },
    { pages: [{ files: [PHOTO], nextPageToken: 'loop' }, { files: [PHOTO], nextPageToken: 'loop' }], error: /repeated_page_token/ },
    { pages: [{ files: [PHOTO], nextPageToken: 'next' }], options: { listLimits: { maxPages: 1 } }, error: /page_limit/ },
    { pages: [{ files: [PHOTO, { ...PHOTO, id: 'photo-2' }] }], options: { listLimits: { maxFiles: 1 } }, error: /file_limit/ },
    { pages: [{ files: [PHOTO], nextPageToken: 'next' }], failPage: 1, error: /HTTP 403/ },
    { pages: [{ files: [PHOTO], incompleteSearch: true }], error: /incomplete_search/ },
    ...[null, { files: 'PRIVATE_MARKER' }, { files: [null] }, { files: [PHOTO], nextPageToken: {} }].map(page => ({ pages: [page], error: /Drive listing invalid/ })),
  ]) {
    const calls = listingServices(t, scenario);
    await assert.rejects(processDriveLabels(scanOptions(scenario.options)), scenario.error);
    assert.equal(calls.filter(call => call.url.searchParams.get('alt') === 'media').length, 0);
    assert.ok(calls.every(call => call.method === 'GET'));
    t.mock.restoreAll();
  }
  const calls = listingServices(t);
  for (const options of [
    { folderInput: 'https://drive.google.com/folders/root-syn?q=other' },
    { listLimits: { maxPages: Infinity } }, { listLimits: { maxFiles: 0 } },
  ]) await assert.rejects(processDriveLabels(scanOptions(options)), /invalid/);
  assert.equal(calls.length, 0);
});

test('preview plan records file identity, source metadata and naming policy version', async (t) => {
  fakeServices(t, { photos: [PHOTO] });
  const [entry] = await run({ dryRun: true });
  assert.equal(entry.fileId, 'photo-syn-1');
  assert.deepEqual(entry.source, { name: 'DRIVER-PHOTO.JPG', parents: [ROOT], version: '7' });
  assert.match(entry.policyVersion, /^drive-labels-\d{4}-\d{2}-\d{2}(?:\.\d+)?$/);
  assert.equal(entry.to, '2026/10/123456789_p02_2026-10-09.jpg');
});

test('live: a photo changed after listing is left untouched (stale), never patched', async (t) => {
  for (const change of [{ version: '8' }, { name: 'RENAMED.JPG' }, { parents: ['elsewhere'] }, { trashed: true }]) {
    const net = fakeServices(t, {
      photos: [PHOTO], meta: { [PHOTO.id]: change },
      folders: { [`${ROOT}/2026`]: 'year-syn', 'year-syn/10': 'month-syn' },
    });
    const [entry] = await run({ dryRun: false });
    assert.deepEqual(net.requests.filter(r => r.method === 'PATCH'), [], JSON.stringify(change));
    assert.equal(entry.errorCode, 'stale-drive-item');
    assert.equal(entry.error, 'Drive file changed since listing; left untouched');
    assert.equal(entry.number, null, 'a stale photo never becomes a reschedule target');
  }
});

test('live: a same-named file that appeared in the month folder blocks the move', async (t) => {
  const net = fakeServices(t, {
    photos: [PHOTO],
    folders: { [`${ROOT}/2026`]: 'year-syn', 'year-syn/10': 'month-syn' },
    existing: { 'month-syn': ['123456789_p02_2026-10-09.jpg'] },
  });
  const [entry] = await run({ dryRun: false });
  assert.deepEqual(net.requests.filter(r => r.method === 'PATCH'), []);
  assert.equal(entry.errorCode, 'name-collision');
  assert.equal(entry.error, 'Target name already exists in the month folder; left untouched');
  assert.equal(entry.number, null);
});
