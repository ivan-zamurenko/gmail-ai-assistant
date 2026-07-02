/**
 * background.js — Service Worker
 * ================================
 * Entry point for the background context.
 * Responsibility: wire up Chrome events only.
 * No business logic lives here — everything is delegated to modules.
 */

import { watchEmails }  from '../gmail/watchEmails.js';
import { initConfig }   from '../config/config.js';
import { logger }       from '../utils/logger.js';
import { CONSTANTS }    from '../utils/constants.js';

// ── On install / update ──────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  logger.info('background: extension installed / updated');

  // Initialize config cache from storage
  await initConfig();

  // Schedule a recurring alarm to poll for new emails
  chrome.alarms.create('checkEmails', {
    periodInMinutes: CONSTANTS.DEFAULT_POLL_INTERVAL_MIN,
  });
});

// ── Alarm handler ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'checkEmails') return;

  // Re-init config on every wake-up — service workers don't persist state
  await initConfig();
  await watchEmails();
});

// ── Popup messages ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'RUN_NOW') {
    initConfig()
      .then(() => watchEmails())
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        logger.error('background: RUN_NOW failed', err);
        sendResponse({ ok: false, error: err.message });
      });

    // Return true to keep the message channel open for the async response
    return true;
  }
});
