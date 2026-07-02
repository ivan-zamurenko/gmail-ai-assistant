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

  // Gmail
  GMAIL_LABEL_INBOX:  'INBOX',
  GMAIL_LABEL_UNREAD: 'UNREAD',
  GMAIL_MAX_RESULTS:  10,

  // AI
  OPENAI_DEFAULT_MODEL: 'gpt-4o-mini',
  OPENAI_MAX_TOKENS:    1000,

  // Polling
  DEFAULT_POLL_INTERVAL_MIN: 1,

  // Reply validation
  MAX_REPLY_LENGTH: 5000,
});
