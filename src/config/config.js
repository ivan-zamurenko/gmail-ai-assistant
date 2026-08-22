/**
 * config/config.js
 * ================
 * Runtime config, sourced from the gitignored local.js (copy local.example.js).
 * Keeps the API key, Drive folder and author contacts out of the public repo.
 */

import { LOCAL } from './local.js';

/**
 * @typedef {Object} Config
 * @property {string} geminiApiKey   - Google Gemini API key
 * @property {string} driveFolderId  - Google Drive folder ID or link with label photos
 */

/** @returns {Config} */
export function loadConfig() {
  return { geminiApiKey: LOCAL.geminiApiKey, driveFolderId: LOCAL.driveFolderId };
}

/** Author details shown in the popup footer. */
export function getContact() {
  return LOCAL.contact;
}
