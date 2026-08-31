/**
 * depot/barcode.js
 * ================
 * Reads the barcode off a parcel label photo.
 *
 * A barcode carries its own checksum, so it either decodes correctly or fails
 * outright. OCR has no such guard: it can quietly invent a digit and rename a
 * photo after somebody else's parcel.
 */

import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  MultiFormatReader,
} from '@zxing/library';
import { DPD_BARCODE_FORMAT_NAMES } from './barcodeFormats.js';
import { decodeWithConfiguredReader } from './barcodeReader.js';

// PDF417 is the big block on Irish labels and carries the whole consignment
// record; Code128 is the routing strip and carries the number alone.
const FORMATS = DPD_BARCODE_FORMAT_NAMES.map((name) => BarcodeFormat[name]);

// Code128 needs clean white margins around the bars. A photo of a label lying
// on a cardboard box fails on the full frame, because the dark box edge merges
// with the first bar — cropping that border away is what makes it decode.
const INSETS = [0.08, 0, 0.04, 0.12, 0.16];

// TRY_HARDER already reads every row backwards, so an upside-down label is
// covered by 0°. The ±7° pair matters much more: a photo taken by hand is
// never square to the label, and a tilted strip loses whole bars on a scan row.
const ANGLES = [0, 7, -7, 90, 97, 83];

// A 4000px phone photo takes seconds to binarise and decodes no better.
const MAX_SIDE = 1600;

function createReader() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);

  const reader = new MultiFormatReader();
  reader.setHints(hints);
  return reader;
}

function drawWindow(img, inset, degrees) {
  const sx = Math.round(img.width * inset);
  const sy = Math.round(img.height * inset);
  const sw = img.width - sx * 2;
  const sh = img.height - sy * 2;

  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  const square = degrees % 90 !== 0;
  const sideways = Math.abs(degrees % 180) === 90;
  const diagonal = Math.ceil(Math.hypot(w, h));
  canvas.width  = square ? diagonal : (sideways ? h : w);
  canvas.height = square ? diagonal : (sideways ? w : h);

  const ctx = canvas.getContext('2d');
  // A tilted photo leaves bare corners; white keeps them out of the way of the
  // quiet zone the reader looks for.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
  return canvas;
}

function decodeCanvas(canvas, reader) {
  const bitmap = new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas)));
  return decodeWithConfiguredReader(bitmap, reader);
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be loaded'));
    img.src = src;
  });
}

/**
 * Reads every window, not just the first hit: a photo can catch a neighbouring
 * parcel's label or a product EAN, so the caller needs the full list to choose.
 *
 * @param {HTMLImageElement} img
 * @returns {{ text: string, format: string, reads: number }[]}
 */
export function readBarcodes(img) {
  const reader = createReader();
  const found  = new Map();

  for (const inset of INSETS) {
    for (const degrees of ANGLES) {
      const result = decodeCanvas(drawWindow(img, inset, degrees), reader);
      if (!result) continue;

      const text = result.getText();
      const entry = found.get(text);
      if (entry) entry.reads += 1;
      else found.set(text, { text, format: BarcodeFormat[result.getBarcodeFormat()], reads: 1 });
    }
  }

  return Array.from(found.values());
}
