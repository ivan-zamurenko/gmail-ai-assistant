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
  STORAGE_SETTINGS_KEY:  'gmail_ai_settings',
  STORAGE_PROCESSED_KEY: 'gmail_ai_processed_ids',

  // Gmail
  GMAIL_API_BASE:     'https://gmail.googleapis.com/gmail/v1/users/me',
  GMAIL_LABEL_INBOX:  'INBOX',
  GMAIL_LABEL_UNREAD: 'UNREAD',
  GMAIL_MAX_RESULTS:  10,

  // Only look at recent mail — stops a first run from replying to years of backlog.
  GMAIL_SEARCH_QUERY: 'is:unread in:inbox newer_than:1d',

  // Service workers are killed after ~30s idle, so each alarm tick handles a
  // small batch instead of draining the whole inbox in one pass.
  MAX_EMAILS_PER_TICK: 5,

  // Roughly 10 days of history at 500 emails/day; oldest entries are pruned.
  PROCESSED_IDS_MAX: 5000,

  // AI (Gemini)
  GEMINI_BASE_URL:     'https://generativelanguage.googleapis.com/v1beta/models',
  GEMINI_TEXT_MODEL:   'gemini-2.0-flash',
  GEMINI_VISION_MODEL: 'gemini-3.1-flash-lite',

  // Polling
  DEFAULT_POLL_INTERVAL_MIN: 1,

  // Reply validation
  MAX_REPLY_LENGTH: 5000,
});
