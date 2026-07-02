/**
 * utils/logger.js
 * ===============
 * Centralized logger with a consistent prefix and log levels.
 *
 * In production: swap the console calls for a remote logging service
 * or silence debug/info levels without touching call sites.
 */

const PREFIX = '[GmailAI]';

export const logger = {
  info(message, ...args) {
    console.log(`${PREFIX} ℹ️  ${message}`, ...args);
  },

  warn(message, ...args) {
    console.warn(`${PREFIX} ⚠️  ${message}`, ...args);
  },

  error(message, ...args) {
    console.error(`${PREFIX} ❌ ${message}`, ...args);
  },
};
