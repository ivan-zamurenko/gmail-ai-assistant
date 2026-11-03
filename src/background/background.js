/**
 * background.js — Service Worker
 * ==============================
 * Wires Chrome events only. Two jobs:
 *   1. Keep the offscreen document alive — it holds the realtime queue listener.
 *   2. Run depot injections for it, because chrome.scripting lives only here.
 */

import { logger }      from '../utils/logger.js';
import { getAuthToken, removeCachedAuthToken } from '../auth/getAuthToken.js';
import {
  executeTask,
  lookupLabelTarget,
  rescheduleLabelTargets,
} from '../queue/executor.js';
import { LABEL_RESCHEDULE_RECOVERY_KEY } from '../depot/rescheduleRecovery.js';
import { STATUS }      from '../queue/contract.js';
import { CONSTANTS }   from '../utils/constants.js';
import { safeErrorMessage } from '../utils/errors.js';

const OFFSCREEN_URL   = 'src/offscreen/offscreen.html';
const KEEPALIVE_ALARM = 'offscreen-keepalive';

let creatingOffscreen = null;
let healthTimer = null;
const reportedFailures = new Set();

function reportFailure(code, error) {
  if (reportedFailures.has(code)) return;
  reportedFailures.add(code);
  logger.warn(code, safeErrorMessage(error, 'Background operation failed'));
}

function ensureOffscreen() {
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = (async () => {
    try {
      if (!await chrome.offscreen.hasDocument()) {
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_URL,
          reasons: ['WORKERS'],
          justification: 'Maintain a realtime Firestore listener for the Discord task queue.',
        });
        logger.info('background: offscreen listener started');
      }
      reportedFailures.delete('OFFSCREEN_UNAVAILABLE');
    } catch (error) {
      reportFailure('OFFSCREEN_UNAVAILABLE', error);
    }
  })().finally(() => { creatingOffscreen = null; });
  return creatingOffscreen;
}

// A depot tab hidden ~5 min gets frozen by Chrome; the next inject then pays a
// long unfreeze (seen as 15–45s on /find). A periodic no-op keeps the tab warm
// so the real task always injects into a live renderer.
async function warmDepotTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: CONSTANTS.DEPOT_URL_PATTERN });
    await Promise.all(tabs.map(t =>
      chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => true })));
    reportedFailures.delete('DEPOT_WARMUP_UNAVAILABLE');
  } catch (error) {
    reportFailure('DEPOT_WARMUP_UNAVAILABLE', error);
  }
}

function start() {
  void ensureOffscreen();
  void warmDepotTabs();
  if (healthTimer !== null) return;
  // Periodic health checks recover after transient failures; they never replay depot tasks.
  healthTimer = setInterval(ensureOffscreen, 20_000);
  Promise.resolve().then(() => chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 }))
    .catch(error => reportFailure('KEEPALIVE_ALARM_UNAVAILABLE', error));
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
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const supported = ['keepalive', 'execute', 'label-lookup', 'label-reschedule',
    'drive-auth-token', 'drive-remove-token', 'label-recovery-get',
    'label-recovery-set', 'label-recovery-remove'];
  if (!supported.includes(msg?.type)) return;
  // Browser-provided sender metadata, never a claim supplied inside the payload.
  if (sender?.id !== chrome.runtime.id
      || sender?.url !== chrome.runtime.getURL(OFFSCREEN_URL)
      || sender?.tab !== undefined) {
    sendResponse({ status: STATUS.ERROR, reason: 'Untrusted runtime sender', summary: 'Untrusted runtime sender' });
    return;
  }
  // The offscreen heartbeat: receiving it keeps the worker awake between tasks.
  if (msg?.type === 'keepalive') { sendResponse({ ok: true }); return; }
  if (msg?.type === 'label-lookup') {
    lookupLabelTarget(msg.number).then(sendResponse).catch((err) => {
      sendResponse({ reason: safeErrorMessage(err) });
    });
    return true;
  }
  if (msg?.type === 'label-reschedule') {
    rescheduleLabelTargets(msg.options).then(sendResponse).catch((err) => {
      sendResponse({ reason: safeErrorMessage(err) });
    });
    return true;
  }
  if (msg?.type === 'drive-auth-token') {
    getAuthToken({ interactive: false })
      .then((token) => sendResponse({ token }))
      .catch((err) => sendResponse({ reason: safeErrorMessage(err) }));
    return true;
  }
  if (msg?.type === 'drive-remove-token') {
    if (typeof msg.token !== 'string' || !msg.token) {
      sendResponse({ reason: 'Invalid cached Drive token' });
      return;
    }
    removeCachedAuthToken(msg.token)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ reason: safeErrorMessage(err) }));
    return true;
  }
  if (msg?.type === 'label-recovery-get') {
    if (msg.key !== LABEL_RESCHEDULE_RECOVERY_KEY) {
      sendResponse({ reason: 'Invalid recovery storage key' });
      return;
    }
    chrome.storage.local.get(msg.key)
      .then((result) => sendResponse({ result }))
      .catch((err) => sendResponse({ reason: safeErrorMessage(err) }));
    return true;
  }
  if (msg?.type === 'label-recovery-set') {
    const entries = msg.entries;
    if (!entries || Object.keys(entries).length !== 1
        || !(LABEL_RESCHEDULE_RECOVERY_KEY in entries)) {
      sendResponse({ reason: 'Invalid recovery storage value' });
      return;
    }
    chrome.storage.local.set(entries)
      .then(() => sendResponse({ result: true }))
      .catch((err) => sendResponse({ reason: safeErrorMessage(err) }));
    return true;
  }
  if (msg?.type === 'label-recovery-remove') {
    if (msg.key !== LABEL_RESCHEDULE_RECOVERY_KEY) {
      sendResponse({ reason: 'Invalid recovery storage key' });
      return;
    }
    chrome.storage.local.remove(msg.key)
      .then(() => sendResponse({ result: true }))
      .catch((err) => sendResponse({ reason: safeErrorMessage(err) }));
    return true;
  }
  if (msg?.type !== 'execute') return;
  executeTask(msg.task)
    .then(sendResponse)
    .catch((err) => sendResponse({ status: STATUS.ERROR, summary: safeErrorMessage(err) }));
  return true; // keep the channel open for the async response
});
