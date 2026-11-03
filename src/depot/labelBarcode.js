/**
 * src/depot/labelBarcode.js
 * =========================
 * Turns decoded DPD barcodes into a consignment number.
 *
 * Both formats were verified against owner-provided real label photos.
 *
 *   PDF417 — the big block, a semicolon record (anonymized):
 *     %00001234567891;0000A0;AAAAAAAAAAA;000000;123456789;…
 *                                                  ^ field 4
 *
 *   Code128 — the routing strip, always 28 characters:
 *     % 0000000 0000 123456789 1 000000
 *       └─dest─┘└rte┘└──cons──┘│ └tail┘
 *                              └ parcel number
 *
 *   Legacy Code128 card — eight-digit consignment + physical parcel:
 *     12345678/2
 *     The leading zero is added as an explicit internal lookup marker.
 *
 * Verified matching labels carry the same nine-digit consignment in PDF417
 * field 4 and Code128 offset 12..21. Parcels of one consignment differ only in
 * the parcel digit, so it must be kept separate — otherwise every parcel of a
 * ten-box shipment looks like a different consignment.
 */

const CODE128 = /^%[A-Z\d]{7}\d{4}(\d{9})(\d)\d{6}$/;
const LEGACY_CODE128 = /^(\d{8})\/([1-9]\d?)$/;
const PDF417_ROUTING = /^%\d{4}(\d{9})(\d{1,2})$/;
const PDF417_CONSIGNMENT = 4;

/** @returns {{ number: string, parcel: number|null } | null} */
export function parseBarcode(text) {
  if (typeof text !== 'string') return null;
  const legacy = LEGACY_CODE128.exec(text);
  if (legacy) {
    return { number: `0${legacy[1]}`, parcel: Number(legacy[2]) };
  }

  if (text.includes(';')) {
    const fields = text.split(';');
    const number = fields[PDF417_CONSIGNMENT];
    if (!/^\d{9}$/.test(number)) return null;

    const routing = PDF417_ROUTING.exec(fields[0]);
    if (routing && routing[1] !== number) return null;
    return { number, parcel: routing ? Number(routing[2]) : null };
  }

  if (text.length !== 28) return null;
  const match = CODE128.exec(text);
  return match ? { number: match[1], parcel: Number(match[2]) } : null;
}

/**
 * Keep all distinct decoded identities. Reads are diagnostics, never votes.
 * A routing strip carries only the last parcel digit; an exact PDF/legacy parcel
 * may refine that digit, but cannot erase a contradictory reading.
 * Unknown parcel metadata does not invent a conflict or replace a known parcel.
 */
export function pickConsignment(codes) {
  if (!Array.isArray(codes)) return null;
  const distinct = new Map();
  for (const code of codes) {
    if (!code || !['CODE_128', 'PDF_417'].includes(code.format)) continue;
    const parsed = parseBarcode(code.text);
    if (!parsed) continue;
    const precision = CODE128.test(code.text) ? 'last-digit' : 'exact';
    const key = `${parsed.number}:${parsed.parcel}:${code.format}:${precision}`;
    const candidate = distinct.get(key) ?? { ...parsed, format: code.format, reads: 0, precision };
    const reads = Number.isSafeInteger(code.reads) && code.reads > 0 ? code.reads : 0;
    candidate.reads = Math.min(Number.MAX_SAFE_INTEGER, candidate.reads + reads);
    distinct.set(key, candidate);
  }
  const candidates = [...distinct.values()];
  if (!candidates.length) return null;

  const numbers = new Set(candidates.map(item => item.number));
  const exact = new Set(candidates.filter(item => item.precision === 'exact' && item.parcel !== null).map(item => item.parcel));
  const digits = new Set(candidates.filter(item => item.precision === 'last-digit').map(item => item.parcel));
  const fullParcel = [...exact][0];
  const lastDigit = [...digits][0];
  const conflict = exact.size > 1 || digits.size > 1
    || (exact.size === 1 && digits.size === 1 && fullParcel % 10 !== lastDigit);

  if (numbers.size > 1 || conflict) {
    return {
      number: null, parcel: null, contested: true,
      reason: numbers.size > 1 ? 'multiple-consignments' : 'conflicting-parcels',
      candidates,
    };
  }
  return {
    number: candidates[0].number,
    parcel: fullParcel ?? lastDigit ?? null,
    format: candidates.some(item => item.format === 'PDF_417') ? 'PDF_417' : candidates[0].format,
    reads: candidates.reduce((sum, item) => Math.min(Number.MAX_SAFE_INTEGER, sum + item.reads), 0),
    contested: false,
  };
}

/**
 * Converts a diagnostic barcode candidate into a value safe for depot lookup.
 * The consignment number selects the depot record; the physical parcel number
 * is optional metadata used only when naming the photo. A contested photo must
 * still fail closed because it does not identify one exact consignment.
 */
export function acceptExactConsignment(pick) {
  return pick && !pick.contested ? pick : null;
}
