/**
 * storage/storage.js
 * ==================
 * Thin Promise-based wrapper around chrome.storage.local.
 *
 * Responsibility: abstract away the callback-based Chrome API.
 * All other files that need storage import from here — never call
 * chrome.storage directly.
 *
 * Swap to chrome.storage.sync here if cross-device sync is ever needed.
 */

export const storage = {
  /**
   * @param {string} key
   * @returns {Promise<any>}
   */
  get(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => resolve(result[key]));
    });
  },

  /**
   * @param {string} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  },

  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  remove(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, resolve);
    });
  },

  /**
   * Clears all extension storage. Use with caution.
   * @returns {Promise<void>}
   */
  clear() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(resolve);
    });
  },
};
