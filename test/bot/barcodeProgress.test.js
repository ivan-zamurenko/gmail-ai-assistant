import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderBarcodeProgress, shouldPublishBarcodeProgress,
} from '../../bot/src/barcodeProgress.js';

test('Discord barcode progress renders one bounded progress bar without parcel data', () => {
  const message = renderBarcodeProgress({
    stage: 'done', current: 3, total: 8, elapsedMs: 12_400,
  }, true);

  assert.match(message, /DRY RUN/);
  assert.match(message, /3\/8 · 38%/);
  assert.match(message, /Обробляю фотографії · 12 с/);
  assert.doesNotMatch(message, /consignment|ConsId|filename|token/i);
});

test('Discord progress throttles intermediate edits but keeps milestones', () => {
  const previous = { stage: 'done', current: 2, total: 8, publishedAt: 10_000 };

  assert.equal(shouldPublishBarcodeProgress(previous, {
    stage: 'done', current: 3, total: 8,
  }, 10_500), false);
  assert.equal(shouldPublishBarcodeProgress(previous, {
    stage: 'done', current: 8, total: 8,
  }, 10_500), true);
  assert.equal(shouldPublishBarcodeProgress(previous, {
    stage: 'reschedule', current: 0, total: 4,
  }, 10_500), true);
});
