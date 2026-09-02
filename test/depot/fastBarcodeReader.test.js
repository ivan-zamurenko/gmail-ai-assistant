import test from 'node:test';
import assert from 'node:assert/strict';

import { readBarcodesFastFirst } from '../../src/depot/fastBarcodeReader.js';

const VALID = [{
  text: '%000000000001234567892000000',
  format: 'CODE_128',
  reads: 2,
}];

test('a valid fast DPD result skips the expensive legacy reader', async () => {
  let fallbackCalls = 0;
  const result = await readBarcodesFastFirst({}, {
    fast: async () => VALID,
    fallback: () => { fallbackCalls += 1; return []; },
  });

  assert.equal(result, VALID);
  assert.equal(fallbackCalls, 0);
});

test('an invalid or failed fast result retains the proven legacy fallback', async () => {
  for (const fast of [
    async () => [{ text: 'not a DPD barcode', format: 'CODE_128', reads: 1 }],
    async () => { throw new Error('WASM unavailable'); },
  ]) {
    const fallback = [{ text: 'fallback-result' }];
    assert.equal(await readBarcodesFastFirst({}, { fast, fallback: () => fallback }), fallback);
  }
});
