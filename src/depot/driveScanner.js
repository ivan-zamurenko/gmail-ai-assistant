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
import { delay }                   from '../utils/delay.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const DRIVE_API  = 'https://www.googleapis.com/drive/v3';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';

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
  const q = `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`;
  const files = [];
  let pageToken = '';

  do {
    const url = `files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType)&pageSize=200` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const data = await driveGet(url, token);
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);

  return files;
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
// Parses the retryDelay field from a Gemini 429 response body.
// Returns milliseconds to wait, with a 1s buffer.
function parseRetryDelay(body) {
  const retryInfo = body?.error?.details?.find(d => d['@type']?.includes('RetryInfo'));
  const raw       = retryInfo?.retryDelay ?? '30s';
  const seconds   = parseFloat(raw);
  return (isNaN(seconds) ? 30 : Math.ceil(seconds)) * 1000 + 1000;
}

// Downscales an image to max 1024px wide before sending to Gemini.
// Reduces token count ~10x for high-res phone photos → lower cost.
function resizeImage(base64, mimeType) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1024;
      if (img.width <= MAX) { resolve({ base64, mimeType }); return; }
      const scale  = MAX / img.width;
      const canvas = document.createElement('canvas');
      canvas.width  = MAX;
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ base64: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' });
    };
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

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
              'Find the CONSIGNMENT number on this DPD parcel label.',
              'Look for the large tracking number printed on the label, typically in format: XXXX XXXX XXXX XX X (4-digit prefix, then digits, then a check letter or digit).',
              'Examples of this format: "1597 6797 5473 04 B" or "0511 2998 7189 42 8".',
              'ALSO look for a field labeled "Consignment" — the number next to it.',
              'IMPORTANT: If the consignment field shows "NUMBER PARCEL_COUNT" like "131129496 1", return ONLY the number before the space.',
              'Remove all spaces from the number before returning.',
              'If the format is XXXXX/X/X like "040111977/0/1", return it exactly with slashes.',
              'Return ONLY the number. No labels. No extra text.',
            ].join(' '),
          },
        ],
      }],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 429) {
      const err = new Error(`Gemini API 429: rate limited`);
      err.retryAfterMs = parseRetryDelay(body);
      throw err;
    }
    throw new Error(`Gemini API ${res.status}: ${JSON.stringify(body)}`);
  }
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

// Maps photo + depot result to the Drive subfolder name.
function folderForResult(photo, depotResult) {
  if (!photo.consNumber) return 'Unknown';   // OCR couldn't read the label
  return 'Complete';                          // number was identified
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
 * @param {(current: number, total: number, state: string) => void} [onProgress]
 * @param {boolean} [testMode] - when true, scans only the first photo (saves API quota during dev)
 * @returns {Promise<Array<{ id: string, name: string, consNumber: string|null, error: string|null }>>}
 */
export async function scanDriveLabels(folderInput, geminiKey, token, onProgress, testMode = false) {
  const folderId = parseFolderId(folderInput);
  let   photos   = await listPhotos(folderId, token);
  if (testMode && photos.length > 1) {
    console.info(`[scan] Test Mode ON — scanning 1 of ${photos.length} photo(s)`);
    photos = photos.slice(0, 1);
  }
  const result   = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    console.group(`[scan] ${i + 1}/${photos.length} ${photo.name}`);
    try {
      console.log('↓ downloading...');
      onProgress?.(i + 1, photos.length, 'downloading');
      const { base64, mimeType } = await downloadAsBase64(photo.id, photo.mimeType, token);
      console.log(`↓ downloaded (${mimeType}), resizing...`);
      const resized = await resizeImage(base64, mimeType);
      console.log(`↓ resized to max 1024px`);

      let raw;
      try {
        console.log('→ sending to Gemini...');
        onProgress?.(i + 1, photos.length, 'scanning');
        raw = await readLabelNumber(resized.base64, resized.mimeType, geminiKey);
      } catch (err) {
        if (!err.retryAfterMs) throw err;
        const waitSec = Math.ceil(err.retryAfterMs / 1000);
        console.warn(`rate limited — waiting ${waitSec}s...`);
        onProgress?.(i + 1, photos.length, `waiting ${waitSec}s`);
        await delay(err.retryAfterMs);
        console.log('→ retrying Gemini...');
        raw = await readLabelNumber(base64, mimeType, geminiKey);
      }

      console.log(`← Gemini raw: "${raw}"`);
      const consNumber = extractConsignmentNumber(raw);
      if (consNumber) {
        console.log(`✓ consignment: ${consNumber}`);
      } else {
        console.warn(`✗ not identified`);
      }
      onProgress?.(i + 1, photos.length, 'done');
      result.push({ id: photo.id, name: photo.name, consNumber: consNumber ?? null, error: null });
    } catch (err) {
      console.error(`✗ error: ${err.message}`);
      onProgress?.(i + 1, photos.length, 'error');
      result.push({ id: photo.id, name: photo.name, consNumber: null, error: err.message });
    } finally {
      console.groupEnd();
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
  const date      = todayStr();

  for (const photo of photos) {
    try {
      const folder  = folderForResult(photo);
      const ext     = photo.name.split('.').pop() || 'jpg';
      const fileId  = photo.consNumber ?? photo.id;
      const newName = `${date}_${fileId}.${ext}`;

      await organizer.placeFile(photo.id, folder, newName);
      console.log(`[organize] ${photo.name} → ${folder}/${newName}`);
    } catch (err) {
      console.error(`[organize] ${photo.name}: ${err.message}`);
    }
  }
}

/**
 * Saves all scanned label photos to a Samples/ subfolder for training data.
 * Identified photos are renamed to {consNumber}_{date}.{ext}.
 * Unidentified photos are renamed to unknown_{date}_{originalName}.
 *
 * @param {Array<{ id, name, consNumber }>} photos  - from scanDriveLabels
 * @param {string} folderInput - Drive folder ID or URL
 * @param {string} token       - Google OAuth access token
 */
export async function saveToSamples(photos, folderInput, token) {
  const folderId  = parseFolderId(folderInput);
  const organizer = new DriveOrganizer(folderId, token);
  const date      = todayStr();

  for (const photo of photos) {
    try {
      const ext     = photo.name.split('.').pop() || 'jpg';
      const newName = photo.consNumber
        ? `${photo.consNumber}_${date}.${ext}`
        : `unknown_${date}_${photo.name}`;
      await organizer.placeFile(photo.id, 'Samples', newName);
      console.log(`[samples] ${photo.name} → Samples/${newName}`);
    } catch (err) {
      console.error(`[samples] ${photo.name}: ${err.message}`);
    }
  }
}
