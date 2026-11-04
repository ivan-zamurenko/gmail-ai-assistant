import { fetchApi } from '../shared/apiErrors.js';
/**
 * src/depot/driveLabels.js
 * ========================
 * Drive side of label filing: lists the inbox folder, downloads photos, plans
 * root/YYYY/MM and files each photo. Image decoding is a port supplied by
 * driveScanner.js, so this module has no DOM or ZXing dependency.
 *
 * Dry-run contract: only GET requests reach Drive. Folder creation and the
 * move/rename PATCH happen only when dryRun is false.
 */

import { processLabelBatch } from './labelBatch.js';
import { createMonthFolderResolver } from './monthFolders.js';
import { parseFolderId } from '../config/folderId.js';

const DRIVE_API   = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Bump when naming/filing rules change, so a plan shows which rules produced it.
export const DRIVE_POLICY_VERSION = 'drive-labels-2026-11-04.2';
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);

async function driveGet(path, token, signal) {
  return fetchApi(`${DRIVE_API}/${path}`, { readOnly: true, signal, headers: { Authorization: `Bearer ${token}` } });
}

function listingLimits(input = {}) {
  if (!record(input)) throw new Error('Drive listing limits invalid');
  const { maxPages = 50, maxFiles = 5000 } = input;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100
      || !Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 10000) {
    throw new Error('Drive listing limits invalid');
  }
  return { maxPages, maxFiles };
}

async function listFiles(query, fields, token, signal, limits) {
  const files = new Map();
  const tokens = new Set();
  let pageToken = '';
  const incomplete = reason => { throw new Error(`Drive listing incomplete [${reason}]`); };

  for (let page = 0; page < limits.maxPages; page++) {
    const url = `files?q=${encodeURIComponent(query)}`
      + `&fields=nextPageToken,incompleteSearch,files(${fields})&pageSize=200`
      + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const data = await driveGet(url, token, signal);
    if (!record(data) || (data.files !== undefined && !Array.isArray(data.files))
        || (data.files?.length ?? 0) > 200
        || data.files?.some(file => !record(file) || !identifier(file.id))
        || (data.nextPageToken !== undefined && (typeof data.nextPageToken !== 'string' || data.nextPageToken.length > 2048))
        || (data.incompleteSearch !== undefined && typeof data.incompleteSearch !== 'boolean')) {
      throw new Error('Drive listing invalid');
    }
    if (data.incompleteSearch) incomplete('incomplete_search');
    for (const file of data.files ?? []) {
      if (!files.has(file.id)) files.set(file.id, file);
      if (files.size > limits.maxFiles) incomplete('file_limit');
    }
    pageToken = data.nextPageToken ?? '';
    if (!pageToken) return [...files.values()];
    if (tokens.has(pageToken)) incomplete('repeated_page_token');
    tokens.add(pageToken);
  }
  incomplete('page_limit');
}

async function downloadBlob(fileId, token, signal) {
  return fetchApi(`${DRIVE_API}/files/${fileId}?alt=media`, {
    readOnly: true, parse: 'blob', signal,
    headers: { Authorization: `Bearer ${token}` },
  });

}

async function findFolder(name, parentId, token, signal, limits) {
  const found = await listFiles(
    `name='${name}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
    'id',
    token, signal, limits
  );
  return found[0]?.id ?? null;
}

async function createFolder(name, parentId, token, signal) {
  const res = await fetchApi(`${DRIVE_API}/files?fields=id`, {
    method:  'POST', signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return res.id;
}

// Drive moves and renames in the same request, so filing a photo costs one call.
async function moveAndRename(fileId, fromId, toId, name, token, signal) {
  await fetchApi(
    `${DRIVE_API}/files/${fileId}?addParents=${toId}&removeParents=${fromId}&fields=id`,
    {
      method:  'PATCH', parse: 'none', signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    }
  );

}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {string}   options.folderInput - Drive folder ID or full Drive URL
 * @param {string}   options.token       - Google OAuth access token
 * @param {(number: string) => Promise<boolean>} options.verify
 * @param {boolean}  [options.dryRun]    - work out every name but change nothing in Drive
 * @param {Function} [options.onProgress]
 * @param {(blob: Blob) => Promise<unknown>} options.decodePhoto - blob → image for readCodes
 * @param {(image: unknown) => Promise<unknown[]>} options.readCodes
 */
export async function processDriveLabels({
  folderInput, token, verify, dryRun, onProgress, decodePhoto, readCodes, signal, listLimits, journal,
}) {
  const rootId = parseFolderId(folderInput);
  const limits = listingLimits(listLimits);

  onProgress?.(0, 1, 'listing');
  const folder = await driveGet(`files/${rootId}?fields=id,mimeType,trashed`, token, signal);
  if (!record(folder) || folder.id !== rootId || folder.mimeType !== FOLDER_MIME || folder.trashed !== false) {
    throw new Error('Drive folder invalid or unavailable');
  }
  const listed = await listFiles(
    `'${rootId}' in parents and mimeType contains 'image/' and trashed=false`,
    'id,name,createdTime,mimeType,trashed,parents,version',
    token, signal, limits
  );
  const photos = [];
  const skipped = [];
  for (const file of listed) {
    const validName = typeof file.name === 'string' && file.name.length > 0 && file.name.length <= 1000;
    const validDate = typeof file.createdTime === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(file.createdTime)
      && Number.isFinite(Date.parse(file.createdTime));
    if (validName && validDate && IMAGE_MIMES.has(file.mimeType) && file.trashed === false
        && Array.isArray(file.parents) && file.parents.length === 1 && file.parents[0] === rootId) {
      photos.push(file);
    } else {
      skipped.push({
        from: validName ? file.name : 'Unnamed file', to: null, number: null, contested: false,
        status: 'skipped', errorCode: 'unsupported-drive-item',
        error: 'Skipped: unsupported image or invalid folder metadata',
      });
    }
  }
  const folderFor = createMonthFolderResolver({
    rootId,
    dryRun,
    findFolder: (name, parentId) => findFolder(name, parentId, token, signal, limits),
    createFolder: (name, parentId) => createFolder(name, parentId, token, signal),
    listNames: async (parentId) => (
      await listFiles(`'${parentId}' in parents and trashed=false`, 'id,name', token, signal, limits)
    ).map((file) => {
      if (typeof file.name !== 'string' || !file.name || file.name.length > 1000) throw new Error('Drive listing invalid');
      return file.name;
    }),
  });

  const results = await processLabelBatch({
    photos,
    verify,
    dryRun,
    onProgress,
    loadPhoto: async (photo) => decodePhoto(await downloadBlob(photo.id, token, signal)),
    readCodes,
    folderFor,
    movePhoto: async (photo, folder, name) => {
      // Apply only the plan that was listed: same file, name, parent and version.
      const fresh = await driveGet(`files/${photo.id}?fields=id,name,parents,version,trashed`, token, signal);
      if (!record(fresh) || fresh.id !== photo.id || fresh.name !== photo.name || fresh.trashed !== false
          || !Array.isArray(fresh.parents) || fresh.parents.length !== 1 || fresh.parents[0] !== rootId
          || String(fresh.version) !== String(photo.version)) {
        throw Object.assign(new Error('Drive file changed since listing; left untouched'), { code: 'stale-drive-item' });
      }
      // Drive allows duplicate names; never add a second file with the same name.
      const quoted = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const clash = await listFiles(`name='${quoted}' and '${folder.id}' in parents and trashed=false`, 'id,name', token, signal, limits);
      if (clash.length) {
        throw Object.assign(new Error('Target name already exists in the month folder; left untouched'), { code: 'name-collision' });
      }
      const note = state => { try { journal?.({ fileId: photo.id, to: `${folder.path}/${name}`, state }); } catch { /* journal must not stop work */ } };
      note('applying');
      try {
        await moveAndRename(photo.id, rootId, folder.id, name, token, signal);
      } catch (err) {
        if (err?.code === 'uncertain-write') {
          // The PATCH may have landed: trust Drive, not the lost response.
          const after = await driveGet(`files/${photo.id}?fields=id,name,parents,trashed`, token, signal).catch(() => null);
          if (record(after) && after.name === name && after.trashed === false && Array.isArray(after.parents)
              && after.parents.length === 1 && after.parents[0] === folder.id) {
            note('applied');
            return;
          }
          note('uncertain');
        } else {
          note('failed');
        }
        throw err;
      }
      note('applied');
    },
  });
  // processLabelBatch returns exactly one entry per photo, in order.
  const planned = results.map((entry, index) => {
    const photo = photos[index];
    return photo ? {
      ...entry,
      fileId: photo.id,
      source: { name: photo.name, parents: [...photo.parents], version: photo.version === undefined ? null : String(photo.version) },
      policyVersion: DRIVE_POLICY_VERSION,
    } : entry;
  });
  return [...planned, ...skipped];
}
