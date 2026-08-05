/**
 * storage/runState.js
 * ===================
 * Last-run state for the Gmail flow, shared between the service worker and
 * the popup.
 *
 * The popup cannot own a long job: Chrome destroys it on any outside click,
 * which severs the message channel mid-run. The worker writes progress here
 * instead, so the popup can be closed and reopened without losing the result.
 */

import { storage }   from './storage.js';
import { CONSTANTS } from '../utils/constants.js';

const KEY = CONSTANTS.STORAGE_LAST_RUN_KEY;

/**
 * @typedef {Object} RunState
 * @property {'running'|'done'|'error'} state
 * @property {number}  at                 - Timestamp of the last transition
 * @property {Object} [result]            - watchEmails() counts, when state is 'done'
 * @property {string} [error]             - Failure message, when state is 'error'
 */

/** @returns {Promise<RunState|undefined>} */
export function getLastRun() {
  return storage.get(KEY);
}

/**
 * @param {Omit<RunState, 'at'>} state
 * @returns {Promise<void>}
 */
export function setLastRun(state) {
  return storage.set(KEY, { ...state, at: Date.now() });
}

/**
 * Calls back whenever the run state changes, including while the popup is open.
 *
 * @param {(state: RunState) => void} callback
 */
export function onLastRunChange(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]?.newValue) callback(changes[KEY].newValue);
  });
}
