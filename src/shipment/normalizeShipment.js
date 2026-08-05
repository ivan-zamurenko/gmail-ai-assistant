/**
 * shipment/normalizeShipment.js
 * ==============================
 * Maps a raw depot lookup result to a stable internal schema.
 *
 * Responsibility: data transformation only — pure function.
 * Decouples the rest of the app from the depot's field names and page layout.
 * If the depot changes, only this file and lookupConsignment.js need updating.
 */

/**
 * @typedef {Object} Shipment
 * @property {string}      trackingNumber
 * @property {boolean}     found              - false when the depot has no such parcel
 * @property {string}      status             - Depot status, e.g. 'PENDING', 'DELIVERED', or 'unknown'
 * @property {string|null} lastEvent          - Latest depot note, when available
 */

/**
 * Converts a raw depot lookup into the internal Shipment shape.
 *
 * @param {import('../depot/lookupConsignment.js').DepotConsignment} raw
 * @returns {Shipment}
 */
export function normalizeShipment(raw) {
  return {
    trackingNumber: raw.consNumber ?? null,
    found:          raw.found === true,
    status:         raw.status     ?? 'unknown',
    lastEvent:      raw.notes      ?? null,
  };
}
