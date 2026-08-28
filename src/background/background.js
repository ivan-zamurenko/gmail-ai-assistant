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
import { CONSTANTS }   from '../utils/constants.js';
import { safeErrorMessage } from '../utils/errors.js';

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

// A depot tab hidden ~5 min gets frozen by Chrome; the next inject then pays a
// long unfreeze (seen as 15–45s on /find). A periodic no-op keeps the tab warm
// so the real task always injects into a live renderer.
async function warmDepotTabs() {
  const tabs = await chrome.tabs.query({ url: CONSTANTS.DEPOT_URL_PATTERN });
  await Promise.all(tabs.map((t) =>
    chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => true })
      .catch(() => {})));
}

function start() {
  ensureOffscreen();
  warmDepotTabs();
  // The 1-min alarm wakes the worker even after it sleeps, re-arming the listener
  // and warming the depot tab — both well under Chrome's ~5-min freeze floor.
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });
  // While the worker is awake (kept so by the offscreen heartbeat below), revive
  // the listener far faster than that 1-min floor.
  setInterval(ensureOffscreen, 20_000);
}

chrome.runtime.onInstalled.addListener(() => {
  logger.info('background: extension installed / updated');
  start();
});

chrome.runtime.onStartup.addListener(start);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;
  ensureOffscreen();
  warmDepotTabs();
});

// The offscreen listener asks us to run a task in the depot tab; we own
// chrome.scripting, it does not.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // The offscreen heartbeat: receiving it keeps the worker awake between tasks.
  if (msg?.type === 'keepalive') { sendResponse({ ok: true }); return; }
  if (msg?.type !== 'execute') return;
  executeTask(msg.task)
    .then(sendResponse)
    .catch((err) => sendResponse({ status: STATUS.ERROR, summary: safeErrorMessage(err) }));
  return true; // keep the channel open for the async response
});
