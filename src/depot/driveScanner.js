/**
 * src/depot/driveScanner.js
 * =========================
 * Reads the barcode on every label photo in a Drive folder, then files each
 * photo under YYYY/MM with a name built from the parcel it belongs to.
 *
 *   scanDriveLabels() — download and decode. Touches nothing.
 *   fileLabels()      — move and rename, once the depot has confirmed the numbers.
 *
 * Runs in the popup: decoding needs a canvas and a service worker has no DOM.
 * Requires the Drive folder to be shared with the signed-in account as Editor.
 */

import { loadImage, readBarcodes } from './barcode.js';
import { pickConsignment }         from './labelBarcode.js';
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

function listPhotos(folderId, token) {
  return listFiles(
    `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
    'id,name,createdTime',
    token
  );
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
 * Reads the barcode on every photo sitting directly in the folder. Files nothing.
 *
 * @param {string} folderInput - Drive folder ID or full Drive URL
 * @param {string} token       - Google OAuth access token
 * @param {(current: number, total: number, state: string) => void} [onProgress]
 * @param {boolean} [testMode] - when true, reads only the first photo
 * @returns {Promise<Array<{ id, name, date, number: string|null, parcel: number,
 *                           contested: boolean, error: string|null }>>}
 */
export async function scanDriveLabels(folderInput, token, onProgress, testMode = false) {
  const all     = await listPhotos(parseFolderId(folderInput), token);
  const photos  = testMode ? all.slice(0, 1) : all;
  const results = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const base  = { id: photo.id, name: photo.name, date: dateOf(photo.createdTime) };

    try {
      onProgress?.(i + 1, photos.length, 'downloading');
      const image = await loadImage(await downloadAsDataUrl(photo.id, token));

      onProgress?.(i + 1, photos.length, 'reading');
      const pick = pickConsignment(readBarcodes(image));

      results.push({
        ...base,
        number:    pick?.number ?? null,
        parcel:    pick?.parcel ?? 1,
        contested: pick?.contested ?? false,
        error:     null,
      });
    } catch (err) {
      results.push({ ...base, number: null, parcel: 1, contested: false, error: err.message });
    }
  }

  return results;
}

/**
 * Moves each photo into YYYY/MM and names it after its parcel. A number the
 * depot did not confirm is treated as unread: a wrong name is invisible
 * afterwards, an "unknown" one is not.
 *
 * @param {Array} photos          - from scanDriveLabels
 * @param {Set<string>} confirmed - consignment numbers found in the depot
 * @param {string} folderInput    - Drive folder ID or full Drive URL
 * @param {string} token          - Google OAuth access token
 * @returns {Promise<Array<{ from: string, to: string|null, error: string|null }>>}
 */
export async function fileLabels(photos, confirmed, folderInput, token) {
  const rootId   = parseFolderId(folderInput);
  const folderOf = monthFolders(rootId, token);
  const filed    = [];

  for (const photo of photos) {
    try {
      const folder = await folderOf(photo.date);
      let   name   = photo.name;

      if (!ALREADY_NAMED.test(name)) {
        const known = photo.number && confirmed.has(photo.number);
        if (!known) folder.unknown += 1;
        name = buildLabelName({
          date:         photo.date,
          number:       known ? photo.number : undefined,
          parcel:       photo.parcel,
          unknownIndex: folder.unknown,
          originalName: photo.name,
        });
      }

      name = makeUnique(name, folder.taken);
      await moveAndRename(photo.id, rootId, folder.id, name, token);
      folder.taken.add(name);
      filed.push({ from: photo.name, to: `${folder.path}/${name}`, error: null });
    } catch (err) {
      filed.push({ from: photo.name, to: null, error: err.message });
    }
  }

  return filed;
}
