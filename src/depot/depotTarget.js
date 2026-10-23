/**
 * src/depot/depotTarget.js
 * ========================
 * Decides whether a tab is the depot before any script is injected into it.
 *
 * The rule comes from CONSTANTS.DEPOT_URL_PATTERN (http://*.interlink.local/*):
 * plain http, a host strictly under interlink.local, no embedded credentials.
 * Injected depot functions repeat the same check in the page, because the tab
 * may navigate between this check and the injection.
 */

import { CONSTANTS } from '../utils/constants.js';

const PATTERN = /^(https?):\/\/\*(\.[a-z0-9.-]+)\/\*$/i.exec(CONSTANTS.DEPOT_URL_PATTERN);
if (!PATTERN) throw new Error('DEPOT_URL_PATTERN must look like scheme://*.host/*');
const DEPOT_PROTOCOL = `${PATTERN[1].toLowerCase()}:`;
const DEPOT_HOST_SUFFIX = PATTERN[2].toLowerCase();

/** @param {unknown} raw */
export function isDepotUrl(raw) {
  let url;
  try {
    url = new URL(String(raw ?? ''));
  } catch {
    return false;
  }
  return url.protocol === DEPOT_PROTOCOL
    && url.hostname.endsWith(DEPOT_HOST_SUFFIX)
    && url.hostname.length > DEPOT_HOST_SUFFIX.length
    && !url.username
    && !url.password;
}

/**
 * Throws an operator-readable error unless the tab is a depot page.
 * @template {{ url?: string }} T
 * @param {T | undefined} tab
 * @returns {T}
 */
export function assertDepotTab(tab) {
  if (!tab) throw new Error('No active tab found');
  try {
    new URL(tab.url);
  } catch {
    throw new Error('Open the depot page in the active tab first');
  }
  if (!isDepotUrl(tab.url)) {
    throw new Error(`Active tab is not a depot page (${CONSTANTS.DEPOT_URL_PATTERN})`);
  }
  return tab;
}
