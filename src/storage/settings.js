/**
 * storage/settings.js
 * ====================
 * Typed get/save interface for user-configurable extension settings.
 *
 * Responsibility: define defaults, merge with stored values, validate.
 * All UI and background code reads settings via getSettings() — never raw storage.
 */

import { storage }   from './storage.js';
import { CONSTANTS } from '../utils/constants.js';

const KEY = CONSTANTS.STORAGE_SETTINGS_KEY;

/**
 * @typedef {Object} Settings
 * @property {boolean} autoProcess     - Auto-process emails without user confirmation
 * @property {boolean} draftMode       - true = create draft, false = send immediately
 * @property {number}  pollIntervalMin - How often to check for new emails (minutes)
 * @property {string}  language        - Preferred reply language (ISO 639-1)
 */

/** @type {Settings} */
const DEFAULTS = {
  autoProcess:     false,
  draftMode:       true,
  pollIntervalMin: CONSTANTS.DEFAULT_POLL_INTERVAL_MIN,
  language:        'en',
};

/**
 * Loads settings from storage and merges with defaults.
 * Missing keys fall back to DEFAULTS — safe after first install.
 *
 * @returns {Promise<Settings>}
 */
export async function getSettings() {
  const saved = await storage.get(KEY);
  return { ...DEFAULTS, ...(saved ?? {}) };
}

/**
 * Persists a partial settings update.
 * Merges with current settings — no need to pass the full object.
 *
 * @param {Partial<Settings>} updates
 * @returns {Promise<void>}
 */
export async function saveSettings(updates) {
  const current = await getSettings();
  await storage.set(KEY, { ...current, ...updates });
}
