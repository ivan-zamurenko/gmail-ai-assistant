/**
 * src/depot/labelName.js
 * ======================
 * Builds the file name a label photo gets after its barcode is read.
 *
 *   132999608_p01_2026-08-07.jpg    parcel 1 (owner: number first, parcel always)
 *   132999608_p08_2026-08-07.jpg    parcel 8 of a multi-parcel consignment
 *   132999608_p08_2026-08-07-2.jpg  a second photo of that same parcel
 *   132999608_2026-08-07.jpg        the label carries no parcel number
 *   unknown-001_2026-08-07.jpg      barcode unreadable
 *
 * Sorting by name groups every photo of one consignment; the YYYY/MM folder
 * keeps the month. Files named by the earlier date-first format stay as they are
 * and are still recognised (see namedIdentity).
 */

import { irishDay } from '../../shared/depotCalendar.js';

const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

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
    ? label.number + (Number.isInteger(label.parcel) && label.parcel > 0 ? `_p${pad(label.parcel, 2)}` : '')
    : `unknown-${pad(label.unknownIndex, 3)}`;

  return `${stem}_${label.date}${extensionOf(label.originalName)}`;
}

// Names produced by this tool: current number-first and earlier date-first.
const NAMED_CURRENT = /^(\d{9}(?:_p\d{2,})?|unknown-\d+)_\d{4}-\d{2}-\d{2}(?:-\d+)?\.[a-z0-9]+$/i;
const NAMED_LEGACY = /^\d{4}-\d{2}-\d{2}_(\d{9}(?:-p\d{2})?|unknown-\d+)(?:-\d+)?\.[a-z0-9]+$/i;

/**
 * For a file this tool already named: `{ number }` (null for unknown-NNN).
 * For any other file name: null.
 */
export function namedIdentity(fileName) {
  const match = NAMED_CURRENT.exec(fileName) ?? NAMED_LEGACY.exec(fileName);
  if (!match) return null;
  return { number: /^unknown/i.test(match[1]) ? null : match[1].slice(0, 9) };
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

/**
 * Owner policy (G_DRIVE_POLICY): the filing day is the Irish calendar day of the
 * Drive upload, so a late-evening summer upload is not filed under yesterday.
 * A missing or impossible timestamp is an error, never today or a guess.
 */
export function dateOf(createdTime) {
  const match = typeof createdTime === 'string' ? ISO_TIMESTAMP.exec(createdTime) : null;
  const [, year, month, day] = match ?? [];
  const calendarDay = match && new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const time = match && new Date(createdTime);
  if (!match || !Number.isFinite(time.getTime())
      || calendarDay.getUTCFullYear() !== Number(year) || calendarDay.getUTCMonth() !== Number(month) - 1
      || calendarDay.getUTCDate() !== Number(day)) {
    throw new Error('Photo upload time missing or invalid; left untouched');
  }
  return irishDay(time);
}
