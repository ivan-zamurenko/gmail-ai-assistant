/**
 * src/depot/driveScanner.js
 * =========================
 * Reads the barcode on a label photo and files it under YYYY/MM named after
 * the parcel it belongs to.
 *
 * One photo is carried all the way through before the next one starts, so
 * closing the popup costs at most the photo in flight. A filed photo leaves
 * the inbox folder, which is what makes a rerun pick up where this left off.
 *
 * Runs in the popup: decoding needs a canvas and a service worker has no DOM.
 * Requires the Drive folder to be shared with the signed-in account as Editor.
 */

import { loadImage, readBarcodes } from './barcode.js';
import { acceptUncontestedConsignment, pickConsignment } from './labelBarcode.js';
import { buildLabelName, dateOf, makeUnique } from './labelName.js';

const DRIVE_API   = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// A file we named before. Matches 2026-08-07_132999608-p08-2.jpg and friends.
const ALREADY_NAMED = /^\d{4}-\d{2}-\d{2}_(\d{9}(-p\d{2})?|unknown-\d+)(-\d+)?\.[a-z0-9]+$/i;
const UNKNOWN_INDEX = /_unknown-(\d+)/;

// ── Drive ─────────────────────────────────────────────────────────────────────

// Accepts a full Drive URL or a plain folder ID.
function parseFolderId(input) {
  const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

async function driveGet(path, token) {
  const res = await fetch(`${DRIVE_API}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API ${res.status}: GET ${path}`);
  return res.json();
}

async function listFiles(query, fields, token) {
  const files = [];
  let pageToken = '';

  do {
    const url = `files?q=${encodeURIComponent(query)}`
      + `&fields=nextPageToken,files(${fields})&pageSize=200`
      + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const data = await driveGet(url, token);
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);

  return files;
}

async function downloadAsDataUrl(fileId, token) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to download file ${fileId}: HTTP ${res.status}`);

  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader   = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function getOrCreateFolder(name, parentId, token) {
  const found = await listFiles(
    `name='${name}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
    'id',
    token
  );
  if (found.length) return found[0].id;

  const res = await fetch(`${DRIVE_API}/files?fields=id`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  if (!res.ok) throw new Error(`Failed to create folder "${name}": HTTP ${res.status}`);
  return (await res.json()).id;
}

// Drive moves and renames in the same request, so filing a photo costs one call.
async function moveAndRename(fileId, fromId, toId, name, token) {
  const res = await fetch(
    `${DRIVE_API}/files/${fileId}?addParents=${toId}&removeParents=${fromId}&fields=id`,
    {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    }
  );
  if (!res.ok) throw new Error(`Failed to file ${fileId}: HTTP ${res.status}`);
}

/**
 * Resolves root/YYYY/MM, creating what is missing. Reads the names already in
 * the month so a rerun continues the unknown numbering instead of restarting
 * it, and so two photos of one parcel never collide.
 */
function monthFolders(rootId, token) {
  const cache = new Map();

  return async function forDate(date) {
    const year  = date.slice(0, 4);
    const month = date.slice(5, 7);
    const key   = `${year}/${month}`;
    if (cache.has(key)) return cache.get(key);

    const yearId   = await getOrCreateFolder(year, rootId, token);
    const monthId  = await getOrCreateFolder(month, yearId, token);
    const names    = (await listFiles(`'${monthId}' in parents and trashed=false`, 'name', token))
      .map((file) => file.name);
    const unknowns = names.map((name) => name.match(UNKNOWN_INDEX)?.[1]).filter(Boolean).map(Number);

    const entry = {
      id:      monthId,
      path:    key,
      taken:   new Set(names),
      unknown: unknowns.length ? Math.max(...unknowns) : 0,
    };
    cache.set(key, entry);
    return entry;
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Reads, checks and files every photo sitting directly in the folder.
 *
 * @param {object} options
 * @param {string}   options.folderInput - Drive folder ID or full Drive URL
 * @param {string}   options.token       - Google OAuth access token
 * @param {(number: string) => Promise<boolean>} options.verify
 *        decides whether a number is a real parcel; a number it rejects is
 *        treated as unread, because a wrongly named file is invisible
 *        afterwards and an "unknown" one is not
 * @param {boolean}  [options.dryRun]    - work out every name but move nothing
 * @param {(current: number, total: number, state: string, entry?: object) => void} [options.onProgress]
 *        states: listing, downloading, reading, checking, filing, done
 * @returns {Promise<Array<{ from, to: string|null, number: string|null,
 *                           contested: boolean, error: string|null }>>}
 */
export async function processLabels({ folderInput, token, verify, dryRun, onProgress }) {
  const rootId = parseFolderId(folderInput);

  onProgress?.(0, 1, 'listing');
  const photos   = await listFiles(
    `'${rootId}' in parents and mimeType contains 'image/' and trashed=false`,
    'id,name,createdTime',
    token
  );
  const folderOf = monthFolders(rootId, token);
  const results  = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const step  = (state, entry) => onProgress?.(i + 1, photos.length, state, entry);
    const done  = (entry) => { results.push(entry); step('done', entry); };

    try {
      step('downloading');
      const image = await loadImage(await downloadAsDataUrl(photo.id, token));

      step('reading');
      const candidate = pickConsignment(readBarcodes(image));
      const pick = acceptUncontestedConsignment(candidate);

      step('checking');
      const known = pick ? await verify(pick.number) : false;

      const date   = dateOf(photo.createdTime);
      const folder = await folderOf(date);
      let   name   = photo.name;

      if (!ALREADY_NAMED.test(name)) {
        if (!known) folder.unknown += 1;
        name = buildLabelName({
          date,
          number:       known ? pick.number : undefined,
          parcel:       pick?.parcel ?? 1,
          unknownIndex: folder.unknown,
          originalName: photo.name,
        });
      }
      name = makeUnique(name, folder.taken);

      if (!dryRun) {
        step('filing');
        await moveAndRename(photo.id, rootId, folder.id, name, token);
      }
      folder.taken.add(name);

      done({
        from:      photo.name,
        to:        `${folder.path}/${name}`,
        number:    known ? pick.number : null,
        contested: candidate?.contested ?? false,
        error:     null,
      });
    } catch (err) {
      // A depot that stopped answering would rename every remaining photo to
      // unknown, so stop and keep what is already filed.
      if (err.fatal) throw err;
      done({ from: photo.name, to: null, number: null, contested: false, error: err.message });
    }
  }

  return results;
}
