/**
 * shipment/getShipment.js
 * =======================
 * Public interface for the shipment module.
 * Coordinates shipmentApi (raw HTTP) → normalizeShipment (data shaping).
 *
 * Responsibility: guard + orchestrate. Nothing else.
 */

import { shipmentApi }     from './shipmentApi.js';
import { normalizeShipment } from './normalizeShipment.js';
import { logger }          from '../utils/logger.js';

/**
 * Fetches and normalizes shipment data for a tracking number.
 * Returns null if no tracking number is provided.
 *
 * @param {string|null} trackingNumber
 * @returns {Promise<import('./normalizeShipment.js').Shipment|null>}
 */
export async function getShipment(trackingNumber) {
  if (!trackingNumber) {
    logger.warn('getShipment: no tracking number — skipping carrier lookup');
    return null;
  }

  const raw = await shipmentApi.track(trackingNumber);
  return normalizeShipment(raw);
}
