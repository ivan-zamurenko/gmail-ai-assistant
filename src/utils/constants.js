/**
 * utils/constants.js
 * ==================
 * Application-wide constants. Static values only — no logic.
 *
 * Add new constants here rather than scattering magic strings/numbers
 * throughout the codebase.
 */

export const CONSTANTS = Object.freeze({
  // chrome.storage keys
  STORAGE_SETTINGS_KEY: 'gmail_ai_settings',

  // Depot
  // Wildcard host: the depot runs on a named VM (e.g. 22-eolas-vm), and that
  // name changes more often than the domain does.
  DEPOT_URL_PATTERN: 'http://*.interlink.local/*',

  // AI (Gemini)
  GEMINI_BASE_URL:     'https://generativelanguage.googleapis.com/v1beta/models',
  GEMINI_VISION_MODEL: 'gemini-3.1-flash-lite',
});
