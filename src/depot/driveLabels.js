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

const DRIVE_API   = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Accepts a full Drive URL or a plain folder ID.
function parseFolderId(input) {
  const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

async function driveGet(path, token, signal) {
  return fetchApi(`${DRIVE_API}/${path}`, { readOnly: true, signal, headers: { Authorization: `Bearer ${token}` } });
}

async function listFiles(query, fields, token, signal) {
  const files = [];
  let pageToken = '';

  do {
    const url = `files?q=${encodeURIComponent(query)}`
      + `&fields=nextPageToken,files(${fields})&pageSize=200`
      + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const data = await driveGet(url, token, signal);
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);

  return files;
}

async function downloadBlob(fileId, token, signal) {
  return fetchApi(`${DRIVE_API}/files/${fileId}?alt=media`, {
    readOnly: true, parse: 'blob', signal,
    headers: { Authorization: `Bearer ${token}` },
  });

}

async function findFolder(name, parentId, token, signal) {
  const found = await listFiles(
    `name='${name}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
    'id',
    token, signal
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
  folderInput, token, verify, dryRun, onProgress, decodePhoto, readCodes, signal,
}) {
  const rootId = parseFolderId(folderInput);

  onProgress?.(0, 1, 'listing');
  const photos   = await listFiles(
    `'${rootId}' in parents and mimeType contains 'image/' and trashed=false`,
    'id,name,createdTime',
    token, signal
  );
  const folderFor = createMonthFolderResolver({
    rootId,
    dryRun,
    findFolder: (name, parentId) => findFolder(name, parentId, token, signal),
    createFolder: (name, parentId) => createFolder(name, parentId, token, signal),
    listNames: async (parentId) => (
      await listFiles(`'${parentId}' in parents and trashed=false`, 'name', token, signal)
    ).map((file) => file.name),
  });

  return processLabelBatch({
    photos,
    verify,
    dryRun,
    onProgress,
    loadPhoto: async (photo) => decodePhoto(await downloadBlob(photo.id, token, signal)),
    readCodes,
    folderFor,
    movePhoto: (photo, folder, name) => (
      moveAndRename(photo.id, rootId, folder.id, name, token, signal)
    ),
  });
}
