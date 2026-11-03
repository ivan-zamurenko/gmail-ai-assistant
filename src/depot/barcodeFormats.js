/**
 * Barcode formats confirmed by the private DPD label audit.
 * Keep this contract independent from ZXing so it can be tested in Node.
 */
export const DPD_BARCODE_FORMAT_NAMES = Object.freeze([
  'PDF_417',
  'CODE_128',
]);
