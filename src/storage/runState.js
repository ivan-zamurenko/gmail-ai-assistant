/**
 * storage/runState.js
 * ===================
 * Result of the last Gmail run, shared between the worker and the popup.
 *
 * The popup cannot own a long job — Chrome destroys it on any outside click.
 * The worker writes here instead, so the popup can show the outcome whenever
 * it happens to be open.
 *
 * Shape: { state: 'running' | 'done' | 'error', result?, error? }
 */

import { storage }   from './storage.js';
import { CONSTANTS } from '../utils/constants.js';

const KEY = CONSTANTS.STORAGE_LAST_RUN_KEY;

export function getLastRun() {
  return storage.get(KEY);
}

export function setLastRun(run) {
  return storage.set(KEY, run);
}

export function onLastRunChange(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]?.newValue) callback(changes[KEY].newValue);
  });
}
