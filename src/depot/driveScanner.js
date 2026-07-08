/**
 * src/depot/driveScanner.js
 * =========================
 * Reads label photos from a Google Drive folder, extracts consignment numbers
 * via OpenAI Vision, and moves processed files into a "Done" subfolder.
 *
 * Requires the Drive folder to be shared with the signed-in account as Editor.
 */

import { extractConsignmentNumber } from './labelParser.js';

// Accepts either a plain folder ID or a full Google Drive URL.
// e.g. "https://drive.google.com/drive/folders/1ABC123" → "1ABC123"
function parseFolderId(input) {
  const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

const DRIVE_API   = 'https://www.googleapis.com/drive/v3';
const GEMINI_API  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ── Drive helpers ──────────────────────────────────────────────────────────────

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
    const reader = new FileReader();
    reader.onload  = () => resolve({ base64: reader.result.split(',')[1], mimeType: blob.type || mimeType });
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function getOrCreateDoneFolder(parentId, token) {
  const q = `name='Done' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const data = await driveGet(`files?q=${encodeURIComponent(q)}&fields=files(id)`, token);
  if (data.files?.length > 0) return data.files[0].id;

  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Done',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  if (!res.ok) throw new Error('Failed to create Done folder in Drive');
  return (await res.json()).id;
}

async function moveFile(fileId, fromId, toId, token) {
  const res = await fetch(
    `${DRIVE_API}/files/${fileId}?addParents=${toId}&removeParents=${fromId}&fields=id`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Failed to move file ${fileId}: HTTP ${res.status}`);
}

// ── Gemini Vision ──────────────────────────────────────────────────────────────

async function readLabelNumber(base64, mimeType, geminiKey) {
  const res = await fetch(`${GEMINI_API}?key=${geminiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            inline_data: { mime_type: mimeType, data: base64 },
          },
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

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Scans all label photos in the Drive folder, extracts consignment numbers,
 * and moves each processed photo into a "Done" subfolder.
 *
 * @param {string} folderId  - Google Drive folder ID
 * @param {string} geminiKey - Google Gemini API key (from aistudio.google.com)
 * @param {string} token     - Google OAuth access token
 * @returns {Promise<string[]>} Extracted consignment numbers
 */
export async function scanDriveLabels(folderInput, geminiKey, token) {
  const folderId = parseFolderId(folderInput);
  const photos = await listPhotos(folderId, token);
  if (photos.length === 0) return [];

  const doneFolderId = await getOrCreateDoneFolder(folderId, token);
  const consNumbers  = [];

  for (const photo of photos) {
    try {
      const { base64, mimeType } = await downloadAsBase64(photo.id, photo.mimeType, token);
      const raw        = await readLabelNumber(base64, mimeType, geminiKey);
      const consNumber = extractConsignmentNumber(raw);
      console.log(`[${photo.name}] raw="${raw}" → "${consNumber}"`);
      consNumbers.push(consNumber);
      await moveFile(photo.id, folderId, doneFolderId, token);
    } catch (err) {
      console.error(`[${photo.name}] ${err.message}`);
    }
  }

  return consNumbers;
}
