/**
 * background.js — Service Worker
 * ================================
 * Entry point for the background context.
 * Responsibility: wire up Chrome events only.
 * No business logic lives here — everything is delegated to modules.
 */

import { logger } from '../utils/logger.js';
import { tick }   from '../queue/listener.js';

// The queue poll interval. 30s is the shortest period Chrome honours for a
// released extension, and it keeps us inside the bot's 60s reply window.
const QUEUE_ALARM = 'queue-poll';

function ensureQueueAlarm() {
  chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 0.5 });
}

chrome.runtime.onInstalled.addListener(() => {
  logger.info('background: extension installed / updated');
  ensureQueueAlarm();
});

// onInstalled does not fire on browser restart, so re-arm the alarm here too.
chrome.runtime.onStartup.addListener(ensureQueueAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === QUEUE_ALARM) tick();
});
