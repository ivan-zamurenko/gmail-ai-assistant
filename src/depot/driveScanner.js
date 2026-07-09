/**
 * src/depot/driveScanner.js
 * =========================
 * Two-step workflow for processing parcel label photos from Google Drive:
 *
 *   Step 1 — scanDriveLabels():  OCR every photo via Gemini Vision.
 *                                Returns [{ id, name, consNumber }].
 *                                Does NOT touch files yet.
 *
 *   Step 2 — organizeLabels():   After depot processing, move each photo
 *                                into a status-named subfolder and rename it
 *                                to DD-MM-YY_<consId>.<ext>.
 *
 * Folder structure inside the root Drive folder:
 *   Done/          — rescheduled successfully
 *   GOODS HELD/    — skipped (GH without qualifying note)
 *   RETURNED/      — skipped (returned parcel)
 *   Not Found/     — consignment not in depot pending list
 *   Error/         — processing error
 *
 * Requires the Drive folder to be shared with the signed-in account as Editor.
 */

import { extractConsignmentNumber } from './labelParser.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const DRIVE_API  = 'https://www.googleapis.com/drive/v3'\;
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'\;

// ── Drive helpers ──────────────────────────────────────────────────────────────

// Accepts full Drive URL or plain folder ID.
function parseFolderId(input) {
  const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

async function driveGet(path, token) {
  const res = await fetch(`${DRIVE_API}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive API ${res.status}: GET ${path}`);
  return res.json();
}

async function listPhotos(folderId, token) {
  const q = `'${folderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png') and trashed=false`;
  const data = await driveGet(
    `files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=100`,
    token
  );
  return data.files ?? [];
}

async function downloadAsBase64(fileId, mimeType, token) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to download file ${fileId}: HTTP ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader    = new FileReader();
    reader.onload  = () => resolve({ base64: reader.result.split(',')[1], mimeType: blob.type || mimeType });
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Folder management ──────────────────────────────────────────────────────────

// Gets or creates a named subfolder inside parentId. Returns the folder ID.
async function getOrCreateSubfolder(name, parentId, token) {
  const q = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const data = await driveGet(`files?q=${encodeURIComponent(q)}&fields=files(id)`, token);
  if (data.files?.length > 0) return data.files[0].id;

  const res = await fetch(`${DRIVE_API}/files`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  if (!res.ok) throw new Error(`Failed to create folder "${name}": HTTP ${res.status}`);
  return (await res.json()).id;
}

// Moves a file to a new parent and renames it — single PATCH request.
async function moveAndRename(fileId, fromId, toId, newName, token) {
  const res = await fetch(
    `${DRIVE_API}/files/${fileId}?addParents=${toId}&removeParents=${fromId}&fields=id`,
    {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: newName }),
    }
  );
  if (!res.ok) throw new Error(`Failed to move/rename file ${fileId}: HTTP ${res.status}`);
}

// ── DriveOrganizer ────────────────────────────────────────────────────────────

/**
 * Manages subfolder creation under a root folder.
 * Caches folder IDs in memory so each subfolder is only looked up once,
 * even when many photos share the same destination.
 */
class DriveOrganizer {
  /**
   * @param {string} rootFolderId - Parent folder where subfolders are created
   * @param {string} token        - Google OAuth access token
   */
  constructor(rootFolderId, token) {
    this.rootFolderId = rootFolderId;
    this.token        = token;
    this._cache       = new Map(); // folderName → folderId
  }

  // Returns the ID of a named subfolder, creating it if needed.
  async getFolder(name) {
    if (this._cache.has(name)) return this._cache.get(name);
    const id = await getOrCreateSubfolder(name, this.rootFolderId, this.token);
    this._cache.set(name, id);
    return id;
  }

  // Moves a file from the root folder into the named subfolder with a new name.
  async placeFile(fileId, folderName, newName) {
    const folderId = await this.getFolder(folderName);
    await moveAndRename(fileId, this.rootFolderId, folderId, newName, this.token);
  }
}

// ── Gemini Vision ──────────────────────────────────────────────────────────────

async function readLabelNumber(base64, mimeType, geminiKey) {
  const res = await fetch(`${GEMINI_API}?key=${geminiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          {
            text: [
              'Find the consignment/tracking number on this DPD parcel label.',
              'Look for: a number after the word "Consignment", OR a number in format XXXXX/X/X, OR a number of 14-15 characters.',
              'Return ONLY the raw number exactly as printed. No spaces. No other text.',
            ].join(' '),
          },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text.trim();
}

// ── Utils ──────────────────────────────────────────────────────────────────────

// Date string in DD-MM-YY format (matches depot system date format).
function todayStr() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${String(d.getFullYear()).slice(-2)}`;
}

// Maps a depot per-parcel result to the Drive subfolder name.
// Folder name = parcel status (e.g. PENDING, OFD, GOODS HELD).
// This way you can pre-create folders for each status and photos sort themselves.
function folderForResult(result) {
  if (!result)               return 'Not Found';
  if (result.action === 'ERROR') return 'Error';
  return result.status ?? 'Unknown';
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Step 1: OCR all label photos in the Drive folder.
 * Returns photo metadata + parsed consignment numbers.
 * Does NOT move any files — call organizeLabels() after depot processing.
 *
 * @param {string} folderInput - Drive folder ID or full Drive URL
 * @param {string} geminiKey   - Gemini API key
 * @param {string} token       - Google OAuth access token
 * @returns {Promise<Array<{ id: string, name: string, consNumber: string }>>}
 */
export async function scanDriveLabels(folderInput, geminiKey, token) {
  const folderId = parseFolderId(folderInput);
  const photos   = await listPhotos(folderId, token);
  const result   = [];

  for (const photo of photos) {
    try {
      const { base64, mimeType } = await downloadAsBase64(photo.id, photo.mimeType, token);
      const raw        = await readLabelNumber(base64, mimeType, geminiKey);
      const consNumber = extractConsignmentNumber(raw);
      console.log(`[scan] ${photo.name} → "${consNumber}"`);
      result.push({ id: photo.id, name: photo.name, consNumber });
    } catch (err) {
      console.error(`[scan] ${photo.name}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Step 2: Organise scanned label photos into status-based subfolders.
 * Called after depot processing with the per-parcel results.
 *
 * Each photo is moved out of the root folder and renamed to:
 *   DD-MM-YY_<consId>.<ext>
 *
 * @param {Array<{ id, name, consNumber }>} photos       - from scanDriveLabels
 * @param {Array<{ consNumber, consId, status, action }>} depotResults - from depotMain
 * @param {string} folderInput - Drive folder ID or URL
 * @param {string} token       - Google OAuth access token
 */
export async function organizeLabels(photos, depotResults, folderInput, token) {
  const folderId  = parseFolderId(folderInput);
  const organizer = new DriveOrganizer(folderId, token);
  const resultMap = new Map(depotResults.map(r => [r.consNumber, r]));
  const date      = todayStr();

  for (const photo of photos) {
    try {
      const result  = resultMap.get(photo.consNumber);
      const folder  = folderForResult(result);
      const ext     = photo.name.split('.').pop() || 'jpg';
      const fileId  = result?.consId ?? photo.consNumber;
      const newName = `${date}_${fileId}.${ext}`;

      await organizer.placeFile(photo.id, folder, newName);
      console.log(`[organize] ${photo.name} → ${folder}/${newName}`);
    } catch (err) {
      console.error(`[organize] ${photo.name}: ${err.message}`);
    }
  }
}
