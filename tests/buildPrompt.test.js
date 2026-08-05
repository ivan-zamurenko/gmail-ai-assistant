/**
 * tests/buildPrompt.test.js
 * =========================
 * buildPrompt decides what the AI is told about the shipment. Getting this
 * wrong makes the model invent a status, so each of the three branches is
 * pinned down here.
 *
 * Run: npm test
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { buildPrompt } from '../src/ai/buildPrompt.js';

const email = {
  subject: 'Where is my parcel?',
  from:    'Mary Ryan <mary.ryan@example.ie>',
  body:    'My parcel has not arrived yet.',
};

test('no consignment number found in the email', () => {
  const prompt = buildPrompt(email, null);
  assert.match(prompt, /No consignment number was found/);
});

test('consignment number found but unknown to the depot', () => {
  const prompt = buildPrompt(email, { trackingNumber: '132109920', found: false });
  assert.match(prompt, /132109920 is not in the depot system/);
});

test('consignment found — status and notes reach the prompt', () => {
  const prompt = buildPrompt(email, {
    trackingNumber: '132109920',
    found:          true,
    status:         'GOODS HELD',
    lastEvent:      'Del. date changed FROM 04/08/26 TO 05/08/26',
  });

  assert.match(prompt, /Status:\s+GOODS HELD/);
  assert.match(prompt, /Del\. date changed FROM 04\/08\/26 TO 05\/08\/26/);
});

test('missing depot notes degrade to "none" rather than "undefined"', () => {
  const prompt = buildPrompt(email, {
    trackingNumber: '132109920',
    found:          true,
    status:         'PENDING',
  });

  assert.match(prompt, /Depot notes: none/);
  assert.doesNotMatch(prompt, /undefined/);
});

test('the email itself is always carried into the prompt', () => {
  const prompt = buildPrompt(email, null);
  assert.match(prompt, /Mary Ryan/);
  assert.match(prompt, /My parcel has not arrived yet\./);
});
