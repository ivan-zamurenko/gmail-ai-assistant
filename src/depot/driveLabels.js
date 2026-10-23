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

async function downloadBlob(fileId, token) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to download file ${fileId}: HTTP ${res.status}`);

  return res.blob();
}

async function findFolder(name, parentId, token) {
  const found = await listFiles(
    `name='${name}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
    'id',
    token
  );
  return found[0]?.id ?? null;
}

async function createFolder(name, parentId, token) {
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
  folderInput, token, verify, dryRun, onProgress, decodePhoto, readCodes,
}) {
  const rootId = parseFolderId(folderInput);

  onProgress?.(0, 1, 'listing');
  const photos   = await listFiles(
    `'${rootId}' in parents and mimeType contains 'image/' and trashed=false`,
    'id,name,createdTime',
    token
  );
  const folderFor = createMonthFolderResolver({
    rootId,
    dryRun,
    findFolder: (name, parentId) => findFolder(name, parentId, token),
    createFolder: (name, parentId) => createFolder(name, parentId, token),
    listNames: async (parentId) => (
      await listFiles(`'${parentId}' in parents and trashed=false`, 'name', token)
    ).map((file) => file.name),
  });

  return processLabelBatch({
    photos,
    verify,
    dryRun,
    onProgress,
    loadPhoto: async (photo) => decodePhoto(await downloadBlob(photo.id, token)),
    readCodes,
    folderFor,
    movePhoto: (photo, folder, name) => (
      moveAndRename(photo.id, rootId, folder.id, name, token)
    ),
  });
}
