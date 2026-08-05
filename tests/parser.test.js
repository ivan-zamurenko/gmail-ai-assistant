/**
 * tests/parser.test.js
 * ====================
 * The extractors are pure functions, so they can be exercised in Node without
 * Chrome, Gmail, or the depot. Samples below are shaped like the real emails
 * quoted in the extractor doc comments.
 *
 * Run: npm test
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { extractTrackingNumber } from '../src/parser/extractTrackingNumber.js';
import { extractOrderNumber }    from '../src/parser/extractOrderNumber.js';
import { extractCustomer }       from '../src/parser/extractCustomer.js';
import { extractPhoneNumber }    from '../src/parser/extractPhoneNumber.js';
import { extractEmailData }      from '../src/parser/extractEmailData.js';

// ── extractTrackingNumber ─────────────────────────────────────────────────────

test('tracking: labelled consignment number', () => {
  assert.equal(extractTrackingNumber('Consignment: 132109920'), '132109920');
  assert.equal(extractTrackingNumber('Con No. 705853280'),      '705853280');
  assert.equal(extractTrackingNumber('Consignment #995625979'), '995625979');
});

test('tracking: 9-digit number at start of subject', () => {
  assert.equal(extractTrackingNumber('132109920 - 2052L8 - NDL'), '132109920');
});

test('tracking: standalone number in body', () => {
  const body = 'Hi, my parcel 132019138 was never delivered. Please advise.';
  assert.equal(extractTrackingNumber(body), '132019138');
});

test('tracking: a phone number is not mistaken for a consignment', () => {
  assert.equal(extractTrackingNumber('Call me on 0877629373'), null);
});

test('tracking: longer digit runs are rejected', () => {
  assert.equal(extractTrackingNumber('Invoice 1234567890123'), null);
});

test('tracking: returns null when there is nothing to find', () => {
  assert.equal(extractTrackingNumber('Where is my parcel?'), null);
});

// ── extractOrderNumber ────────────────────────────────────────────────────────

test('order: labelled order number', () => {
  assert.equal(extractOrderNumber('Order: ORD-9876'), 'ORD-9876');
  assert.equal(extractOrderNumber('order no 12345'),  '12345');
});

test('order: the word "Reference" is not swallowed as a value', () => {
  // "Ref" matches the label alternation, so a greedy match can capture the
  // remainder of the word itself instead of the value after the colon.
  assert.equal(extractOrderNumber('Reference: ABC123'), 'ABC123');
});

test('order: label must be a whole word, not part of another one', () => {
  assert.equal(extractOrderNumber('Please reorder soon'), null);
});

test('order: returns null when absent', () => {
  assert.equal(extractOrderNumber('No identifiers in this text at all'), null);
});

// ── extractCustomer ───────────────────────────────────────────────────────────

test('customer: display name wins over the address', () => {
  assert.equal(extractCustomer('John Doe <john@example.com>'),   'John Doe');
  assert.equal(extractCustomer('"Acme Ltd" <orders@acme.com>'),  'Acme Ltd');
});

test('customer: bare address falls back to the address itself', () => {
  assert.equal(extractCustomer('noreply@example.com'), 'noreply@example.com');
});

test('customer: empty header yields null', () => {
  assert.equal(extractCustomer(''), null);
});

// ── extractPhoneNumber ────────────────────────────────────────────────────────

test('phone: local formats normalise to 10 digits', () => {
  assert.equal(extractPhoneNumber('0877629373'),   '0877629373');
  assert.equal(extractPhoneNumber('087 762 9373'), '0877629373');
  assert.equal(extractPhoneNumber('087-762-9373'), '0877629373');
});

test('phone: international formats normalise to the local form', () => {
  assert.equal(extractPhoneNumber('+353 87 762 9373'), '0877629373');
  assert.equal(extractPhoneNumber('00353877629373'),   '0877629373');
  assert.equal(extractPhoneNumber('+353877629373'),    '0877629373');
});

test('phone: non-mobile prefixes are ignored', () => {
  assert.equal(extractPhoneNumber('Landline 015551234'), null);
});

test('phone: returns null when absent', () => {
  assert.equal(extractPhoneNumber('No number here'), null);
});

// ── extractEmailData ──────────────────────────────────────────────────────────

test('emailData: pulls every field from a realistic enquiry', () => {
  const email = {
    subject: '132109920 - parcel not delivered',
    from:    'Mary Ryan <mary.ryan@example.ie>',
    body:    'Hello,\n\nMy consignment 132109920 never arrived.\nCall me on 087 762 9373.\n\nMary',
  };

  const data = extractEmailData(email);

  assert.equal(data.trackingNumber, '132109920');
  assert.equal(data.customer,       'Mary Ryan');
  assert.equal(data.phoneNumber,    '0877629373');
});

test('emailData: missing fields come back as null, not undefined', () => {
  const data = extractEmailData({
    subject: 'Question',
    from:    'someone@example.com',
    body:    'Do you deliver on Saturdays?',
  });

  assert.equal(data.trackingNumber, null);
  assert.equal(data.orderNumber,    null);
  assert.equal(data.phoneNumber,    null);
  assert.equal(data.customer,       'someone@example.com');
});
