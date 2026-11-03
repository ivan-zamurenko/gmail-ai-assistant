/**
 * Fast local barcode adapter.
 *
 * ZXing-C++ runs once over the whole photo through WebAssembly. The older
 * JavaScript window/rotation reader remains a fallback for unusual photos.
 */
import { prepareZXingModule, readBarcodes as readWasmBarcodes } from 'zxing-wasm/reader';

import { acceptExactConsignment, pickConsignment } from './labelBarcode.js';

const WASM_FILE = 'zxing_reader.wasm';
const MAX_SIDE = 2400;

let prepared = false;

function prepare() {
  if (prepared) return;
  prepareZXingModule({
    overrides: {
      locateFile: (path) => (
        path.endsWith(WASM_FILE) ? chrome.runtime.getURL(`assets/${WASM_FILE}`) : path
      ),
    },
  });
  prepared = true;
}

function imageDataOf(img) {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(img, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function normalize(results) {
  return results.flatMap((result) => {
    const format = {
      Code128: 'CODE_128',
      PDF417: 'PDF_417',
    }[result.format];
    return format ? [{
      text: result.text,
      format,
      reads: Math.max(1, result.lineCount || 1),
    }] : [];
  });
}

export async function readFastBarcodes(img) {
  prepare();
  return normalize(await readWasmBarcodes(imageDataOf(img), {
    formats: ['Code128', 'PDF417'],
    tryHarder: true,
    tryRotate: true,
    tryInvert: false,
    maxNumberOfSymbols: 8,
    textMode: 'Plain',
  }));
}

async function readLegacyBarcodes(img) {
  const legacy = await import('./barcode.js');
  return legacy.readBarcodes(img);
}

export async function readBarcodesFastFirst(img, ports = {}) {
  const fast = ports.fast ?? readFastBarcodes;
  const fallback = ports.fallback ?? readLegacyBarcodes;

  try {
    const codes = await fast(img);
    if (acceptExactConsignment(pickConsignment(codes))) return codes;
  } catch {
    // Unsupported WASM/runtime or an unreadable photo: retain the proven path.
  }

  return fallback(img);
}
