/**
 * src/depot/labelName.js
 * ======================
 * Builds the file name a label photo gets after its barcode is read.
 *
 *   2026-08-07_132999608.jpg        one parcel
 *   2026-08-07_132999608-p08.jpg    parcel 8 of a multi-parcel consignment
 *   2026-08-07_132999608-p08-2.jpg  a second photo of that same parcel
 *   2026-08-07_unknown-01.jpg       barcode unreadable
 *
 * The date is ISO so the folder sorts chronologically — the old DD-MM-YY put
 * 01-09-26 before 31-08-26.
 */

function extensionOf(fileName) {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot).toLowerCase() : '.jpg';
}

function pad(value, width) {
  return String(value).padStart(width, '0');
}

/**
 * @param {{ date: string, number?: string, parcel?: number, unknownIndex?: number, originalName: string }} label
 */
export function buildLabelName(label) {
  const stem = label.number
    ? label.number + (label.parcel > 1 ? `-p${pad(label.parcel, 2)}` : '')
    : `unknown-${pad(label.unknownIndex, 2)}`;

  return `${label.date}_${stem}${extensionOf(label.originalName)}`;
}

/** Two photos of one parcel would otherwise overwrite each other. */
export function makeUnique(name, taken) {
  if (!taken.has(name)) return name;

  const dot = name.lastIndexOf('.');
  const stem = name.slice(0, dot);
  const ext  = name.slice(dot);

  let copy = 2;
  while (taken.has(`${stem}-${copy}${ext}`)) copy += 1;
  return `${stem}-${copy}${ext}`;
}

/** Drive gives an ISO timestamp; only the day matters for the file name. */
export function dateOf(createdTime) {
  return createdTime.slice(0, 10);
}
