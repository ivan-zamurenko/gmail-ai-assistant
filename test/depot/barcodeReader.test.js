import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeWithConfiguredReader } from '../../src/depot/barcodeReader.js';

test('barcode windows preserve the configured ZXing reader state', () => {
  const bitmap = {};
  const decoded = {};
  const calls = [];
  const reader = {
    decodeWithState(value) {
      calls.push(['decodeWithState', value]);
      return decoded;
    },
    reset() {
      calls.push(['reset']);
    },
  };

  assert.equal(decodeWithConfiguredReader(bitmap, reader), decoded);
  assert.deepEqual(calls, [
    ['decodeWithState', bitmap],
    ['reset'],
  ]);
});
