/**
 * shipment/normalizeShipment.js
 * ==============================
 * Maps a raw carrier API response to a stable internal schema.
 *
 * Responsibility: data transformation only — pure function.
 * Decouples the rest of the app from carrier-specific field names.
 * If the carrier changes their API, only this file needs updating.
 */

/**
 * @typedef {Object} Shipment
 * @property {string}      trackingNumber
 * @property {string}      status             - e.g. 'in_transit', 'delivered', 'unknown'
 * @property {string|null} lastEvent          - Human-readable description of the latest event
 * @property {string|null} estimatedDelivery  - ISO date string or null
 */

/**
 * Converts a raw carrier API response into the internal Shipment shape.
 *
 * TODO: map carrier-specific field names here as real API integration is added.
 *       e.g. DPD uses "Scan" events, DHL uses "events[].description", etc.
 *
 * @param {object} raw - Raw API response from shipmentApi.track()
 * @returns {Shipment}
 */
export function normalizeShipment(raw) {
  return {
    trackingNumber:    raw.trackingNumber                  ?? null,
    status:            raw.status                          ?? 'unknown',
    lastEvent:         raw.events?.[0]?.description        ?? null,
    estimatedDelivery: raw.estimatedDelivery               ?? null,
  };
}
