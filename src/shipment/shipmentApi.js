/**
 * shipment/shipmentApi.js
 * =======================
 * Low-level HTTP wrapper for the carrier tracking API.
 * All carrier-specific network calls go through this file.
 *
 * Responsibility: one-to-one mapping to API endpoints.
 * Does NOT transform or interpret the response — that is normalizeShipment's job.
 */

import { request }    from '../utils/request.js';
import { loadConfig } from '../config/config.js';

export const shipmentApi = {
  /**
   * Fetches raw tracking data for a given tracking number.
   *
   * TODO: replace stub with real carrier API call.
   *       Different carriers have different auth/URL schemes —
   *       add a switch on config.carrierProvider if you support multiple.
   *
   * @param {string} trackingNumber
   * @returns {Promise<object>} Raw API response (carrier-specific shape)
   */
  async track(trackingNumber) {
    const { carrierApiUrl, carrierApiKey } = await loadConfig();

    // return request.get(`${carrierApiUrl}/track/${trackingNumber}`, {
    //   headers: { Authorization: `Bearer ${carrierApiKey}` },
    // });

    // Stub — returns a minimal shape that normalizeShipment can consume
    return {
      trackingNumber,
      status:            'unknown',
      events:            [],
      estimatedDelivery: null,
    };
  },
};
