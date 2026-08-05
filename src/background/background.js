/**
 * background.js — Service Worker
 * ================================
 * Entry point for the background context.
 * Responsibility: wire up Chrome events only.
 * No business logic lives here — everything is delegated to modules.
 */

import { watchEmails }  from '../gmail/watchEmails.js';
import { initConfig }   from '../config/config.js';
import { setLastRun }   from '../storage/runState.js';
import { logger }       from '../utils/logger.js';
import { CONSTANTS }    from '../utils/constants.js';

// Guards against a second run being started while one is still in flight.
let runInFlight = false;

/**
 * Runs the Gmail flow to completion, recording progress in storage.
 * Never rejects — callers are fire-and-forget.
 *
 * @param {{ force?: boolean }} [options]
 */
async function runGmailFlow({ force = false } = {}) {
  if (runInFlight) {
    logger.info('background: run already in progress — ignoring');
    return;
  }
  runInFlight = true;

  try {
    await setLastRun({ state: 'running' });
    await initConfig();
    const result = await watchEmails({ force });
    await setLastRun({ state: 'done', result });
  } catch (err) {
    logger.error('background: gmail run failed', err);
    await setLastRun({ state: 'error', error: err.message });
  } finally {
    runInFlight = false;
  }
}

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
  await runGmailFlow();
});

// ── Popup messages ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'RUN_NOW') return;

  // Acknowledge at once. The run outlives the popup — any click outside it
  // destroys the window, and a channel held open for the whole pipeline would
  // die with it. Progress reaches the popup through runState in storage.
  // force: the user pressed the button, so honour it even when auto-process
  // is switched off.
  runGmailFlow({ force: true });
  sendResponse({ ok: true });
});
