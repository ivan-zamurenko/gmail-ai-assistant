/**
 * config/config.js
 * ================
 * Loads runtime configuration from chrome.storage.
 * API keys and external URLs are stored here — never hardcoded.
 *
 * Usage pattern:
 *
 *   // In any module that needs config:
 *   const { geminiApiKey } = await loadConfig();
 *
 * Note: Service workers do not persist module-level state between invocations,
 * so each wakeup must call loadConfig() before using any key.
 */

/**
 * @typedef {Object} Config
 * @property {string} geminiApiKey   - Google Gemini API key (from aistudio.google.com)
 * @property {string} carrierApiUrl  - Base URL for the carrier tracking API
 * @property {string} carrierApiKey  - Auth key for the carrier API
 * @property {string} driveFolderId  - Google Drive folder ID containing label photos
 */

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
