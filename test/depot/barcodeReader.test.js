import test from 'node:test';
import assert from 'node:assert/strict';

import { DPD_BARCODE_FORMAT_NAMES } from '../../src/depot/barcodeFormats.js';
import { decodeWithConfiguredReader } from '../../src/depot/barcodeReader.js';

test('DPD barcode reader enables only formats confirmed by the label audit', () => {
  assert.deepEqual(DPD_BARCODE_FORMAT_NAMES, [
    'PDF_417',
    'CODE_128',
  ]);
});

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

test('expected ZXing misses do not flood the operator console', () => {
  const originalWarn = globalThis.console.warn;
  const warnings = [];
  globalThis.console.warn = (...args) => warnings.push(args);

  try {
    const reader = {
      decodeWithState() {
        globalThis.console.warn('MultiFormatReader: non-ReaderException from reader:', new Error('expected miss'));
        globalThis.console.warn('unrelated warning');
        throw new Error('no barcode in this window');
      },
      reset() {},
    };

    assert.equal(decodeWithConfiguredReader({}, reader), null);
    assert.deepEqual(warnings, [['unrelated warning']]);
  } finally {
    globalThis.console.warn = originalWarn;
  }
});
