/**
 * src/depot/labelBarcode.js
 * =========================
 * Turns decoded DPD barcodes into a consignment number.
 *
 * Both formats were verified against 76 real label photos.
 *
 *   PDF417 — the big block, a semicolon record:
 *     %14131330823531;39L5;TOOLING & ENGINEERING DIST;1447952/01RK;133082353;…
 *                                                                  ^ field 4
 *
 *   Code128 — the routing strip, always 28 characters:
 *     % 0077160 1530 132811559 2 101372
 *       └─dest─┘└rte┘└──cons──┘│ └tail┘
 *                              └ parcel number
 *
 * The two agree: one parcel gave PDF417 field 4 "132811559" and Code128 offset
 * 12..21 "132811559". Parcels of one consignment differ only in the parcel
 * digit, so it must be dropped — otherwise every parcel of a ten-box shipment
 * looks like a different consignment.
 */

const CODE128 = /^%[A-Z\d]{7}\d{4}(\d{9})(\d)/;
const PDF417_ROUTING = /^%\d{4}(\d{9})(\d{1,2})$/;
const PDF417_CONSIGNMENT = 4;

/** @returns {{ number: string, parcel: number } | null} */
export function parseBarcode(text) {
  if (text.includes(';')) {
    const fields = text.split(';');
    const number = fields[PDF417_CONSIGNMENT];
    if (!/^\d{9}$/.test(number)) return null;

    const routing = PDF417_ROUTING.exec(fields[0]);
    return { number, parcel: routing && routing[1] === number ? Number(routing[2]) : 1 };
  }

  const match = CODE128.exec(text);
  return match ? { number: match[1], parcel: Number(match[2]) } : null;
}

/**
 * Picks one number out of everything a photo produced.
 *
 * A steeply tilted strip can still satisfy the Code128 checksum while a digit
 * pair is wrong — one photo read "132665732" four times and "138765732" once.
 * So the winner is the reading that repeated most, and PDF417 outranks Code128
 * because its record carries the number in plain text alongside the address.
 *
 * @param {{ text: string, format: string, reads: number }[]} codes
 * @returns {{ number: string, parcel: number, format: string, reads: number, contested: boolean } | null}
 */
export function pickConsignment(codes) {
  const byNumber = new Map();

  for (const code of codes) {
    const parsed = parseBarcode(code.text);
    if (!parsed) continue;

    const entry = byNumber.get(parsed.number) || { ...parsed, format: code.format, reads: 0 };
    entry.reads += code.reads;
    if (code.format === 'PDF_417') entry.format = 'PDF_417';
    byNumber.set(parsed.number, entry);
  }

  const ranked = Array.from(byNumber.values()).sort((a, b) => {
    if ((a.format === 'PDF_417') !== (b.format === 'PDF_417')) return a.format === 'PDF_417' ? -1 : 1;
    return b.reads - a.reads;
  });

  if (!ranked.length) return null;
  return { ...ranked[0], contested: ranked.length > 1 };
}
