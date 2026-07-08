/**
 * config/config.js
 * ================
 * Loads runtime configuration from chrome.storage.
 * API keys and external URLs are stored here — never hardcoded.
 *
 * Usage pattern:
 *
 *   // In background.js (service worker startup):
 *   await initConfig();
 *
 *   // In any module that needs config:
 *   const { openaiApiKey } = await loadConfig();
 *
 * Note: Service workers do not persist module-level state between invocations,
 * so each wakeup must call initConfig() or loadConfig() before using any key.
 */

/**
 * @typedef {Object} Config
 * @property {string} geminiApiKey   - Google Gemini API key (from aistudio.google.com)
 * @property {string} carrierApiUrl  - Base URL for the carrier tracking API
 * @property {string} carrierApiKey  - Auth key for the carrier API
 * @property {string} driveFolderId  - Google Drive folder ID containing label photos
 */

/** @type {Config|null} */
let _cache = null;

/**
 * Reads all config keys from chrome.storage.local.
 * Falls back to safe defaults if a key is missing.
 *
 * @returns {Promise<Config>}
 */
export function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['geminiApiKey', 'carrierApiUrl', 'carrierApiKey', 'driveFolderId'],
      (result) => {
        resolve({
          geminiApiKey:  result.geminiApiKey  ?? '',
          carrierApiUrl: result.carrierApiUrl ?? '',
          carrierApiKey: result.carrierApiKey ?? '',
          driveFolderId: result.driveFolderId ?? '',
        });
      }
    );
  });
}

/**
 * Loads config and stores it in module cache.
 * Call once at the start of each service worker invocation.
 *
 * @returns {Promise<void>}
 */
export async function initConfig() {
  _cache = await loadConfig();
}

/**
 * Returns the cached config synchronously.
 * Throws if initConfig() was not called first.
 *
 * @returns {Config}
 */
export function getConfig() {
  if (!_cache) {
    throw new Error('getConfig(): initConfig() must be called before getConfig()');
  }
  return _cache;
}
