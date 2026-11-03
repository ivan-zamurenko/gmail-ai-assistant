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
 * Runs in a DOM extension context: popup for local use, offscreen document for
 * Discord jobs. A service worker cannot decode because it has no Image/canvas.
 * Requires the Drive folder to be shared with the signed-in account as Editor.
 */

import { loadImage } from './barcode.js';
import { readBarcodesFastFirst } from './fastBarcodeReader.js';
import { processDriveLabels } from './driveLabels.js';

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader   = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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
export function processLabels({ folderInput, token, verify, dryRun, onProgress, signal }) {
  return processDriveLabels({
    folderInput,
    token,
    verify,
    dryRun,
    onProgress,
    signal,
    decodePhoto: async (blob) => loadImage(await blobToDataUrl(blob)),
    readCodes: readBarcodesFastFirst,
  });
}
