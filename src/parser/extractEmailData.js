/**
 * parser/extractEmailData.js
 * ==========================
 * Coordinates all individual extractors and returns a single flat object
 * with all structured data pulled from the email.
 *
 * Responsibility: orchestrate sub-extractors.
 * Does NOT contain any regex logic — delegate to sub-extractors.
 */

import { extractTrackingNumber } from './extractTrackingNumber.js';
import { extractOrderNumber }    from './extractOrderNumber.js';
import { extractCustomer }       from './extractCustomer.js';
import { extractPhoneNumber }    from './extractPhoneNumber.js';

/**
 * @typedef {Object} EmailData
 * @property {string|null} trackingNumber  - DPD Ireland consignment number (9 digits)
 * @property {string|null} orderNumber
 * @property {string|null} customer
 * @property {string|null} phoneNumber     - Irish mobile, normalised to 10-digit local format
 */

/**
 * Extracts all structured data from a raw email object.
 *
 * @param {{ subject: string, from: string, body: string }} email
 * @returns {EmailData}
 */
export function extractEmailData(email) {
  const text = `${email.subject}\n${email.body}`;

  return {
    trackingNumber: extractTrackingNumber(text),
    orderNumber:    extractOrderNumber(text),
    customer:       extractCustomer(email.from),
    phoneNumber:    extractPhoneNumber(text),
  };
}
