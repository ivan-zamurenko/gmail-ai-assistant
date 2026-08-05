/**
 * depot/depotTab.js
 * =================
 * Finds the open depot tab and runs code inside it.
 *
 * Exists because the depot session token lives in the tab's URL, so neither
 * the service worker nor the popup can call the depot on its own. Everything
 * depot-related has to be executed in that tab's context.
 *
 * Keeping the tab lookup here means callers never deal with chrome.tabs.
 */

import { CONSTANTS } from '../utils/constants.js';

/**
 * Thrown when no depot tab is open, so callers can tell this apart from a
 * genuine lookup failure and retry later instead of giving up on the message.
 */
export class DepotTabMissingError extends Error {
  constructor() {
    super('No depot tab is open — open the depot page and stay logged in.');
    this.name = 'DepotTabMissingError';
  }
}

/**
 * Executes a self-contained function inside the depot tab.
 *
 * @template T
 * @param {Function} func   Serialised by Chrome — must not use imports or closures
 * @param {any[]} [args]    Structured-cloneable arguments
 * @returns {Promise<T>}    Whatever func returned
 * @throws {DepotTabMissingError} when the depot page is not open
 */
export async function runInDepotTab(func, args = []) {
  const [tab] = await chrome.tabs.query({ url: CONSTANTS.DEPOT_URL_PATTERN });
  if (!tab) throw new DepotTabMissingError();

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func,
    args,
    // MAIN world is blocked by Chrome for this page; ISOLATED still shares
    // cookies and the page URL, which is all the depot calls need.
    world: 'ISOLATED',
  });

  const result = injection?.result;
  if (!result) throw new Error('Depot script returned no result');
  if (result.__error) throw new Error(result.__error);

  return result;
}
