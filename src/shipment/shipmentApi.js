/**
 * shipment/shipmentApi.js
 * =======================
 * Fetches raw parcel data for a tracking number.
 *
 * There is no carrier API available, so the depot system is the source of
 * truth: it already knows every parcel's status, and we query it the same way
 * a human would — through the depot page's quick-search.
 *
 * Responsibility: fetching only. Interpreting the response is
 * normalizeShipment's job.
 */

import { runInDepotTab }        from '../depot/depotTab.js';
import { lookupConsignmentMain } from '../depot/lookupConsignment.js';

export const shipmentApi = {
  /**
   * Looks a consignment up in the depot system.
   *
   * @param {string} trackingNumber
   * @returns {Promise<import('../depot/lookupConsignment.js').DepotConsignment>}
   * @throws {import('../depot/depotTab.js').DepotTabMissingError} when the depot page is closed
   */
  async track(trackingNumber) {
    return runInDepotTab(lookupConsignmentMain, [trackingNumber]);
  },
};
