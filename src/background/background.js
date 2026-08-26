/**
 * background.js — Service Worker
 * ==============================
 * Wires Chrome events only. Two jobs:
 *   1. Keep the offscreen document alive — it holds the realtime queue listener.
 *   2. Run depot injections for it, because chrome.scripting lives only here.
 */

import { logger }      from '../utils/logger.js';
import { executeTask } from '../queue/executor.js';
import { STATUS }      from '../queue/contract.js';

const OFFSCREEN_URL   = 'src/offscreen/offscreen.html';
const KEEPALIVE_ALARM = 'offscreen-keepalive';

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url:     OFFSCREEN_URL,
    reasons: ['WORKERS'],
    justification: 'Maintain a realtime Firestore listener for the Discord task queue.',
  });
  logger.info('background: offscreen listener started');
}

function start() {
  ensureOffscreen();
  // Chrome may reclaim the offscreen document under memory pressure; re-arm it.
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => {
  logger.info('background: extension installed / updated');
  start();
});

chrome.runtime.onStartup.addListener(start);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) ensureOffscreen();
});

// The offscreen listener asks us to run a task in the depot tab; we own
// chrome.scripting, it does not.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'execute') return;
  executeTask(msg.task)
    .then(sendResponse)
    .catch((err) => sendResponse({ status: STATUS.ERROR, summary: err.message }));
  return true; // keep the channel open for the async response
});
