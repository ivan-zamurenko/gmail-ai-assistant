/**
 * popup/popup.js
 * ==============
 * UI controller for the DPD Assistance extension popup.
 * Handles both Depot (Future Dates) and Gmail (Auto-Reply) features.
 */

import { getSettings, saveSettings } from '../storage/settings.js';
import { loadConfig }                 from '../config/config.js';
import { getAuthToken }               from '../auth/getAuthToken.js';
import { depotMain }                  from '../depot/depotScript.js';
import { scanDriveLabels }            from '../depot/driveScanner.js';
import { logger }                     from '../utils/logger.js';

// ── DOM refs ─────────────────────────────────────────────────────────────────

const depotStatusDot   = document.getElementById('depotStatusDot');
const depotStatusLabel = document.getElementById('depotStatusLabel');
const depotMessage     = document.getElementById('depotMessage');
const dryRunToggle     = document.getElementById('dryRun');
const scanCADBtn       = document.getElementById('scanCAD');
const scanDriveBtn     = document.getElementById('scanDrive');

const gmailStatusDot   = document.getElementById('gmailStatusDot');
const gmailStatusLabel = document.getElementById('gmailStatusLabel');
const gmailMessage     = document.getElementById('gmailMessage');
const autoProcessToggle = document.getElementById('autoProcess');
const draftModeToggle   = document.getElementById('draftMode');
const runNowBtn        = document.getElementById('runNow');

const openaiKeyInput   = document.getElementById('openaiApiKey');
const driveFolderInput = document.getElementById('driveFolderId');

// ── Status helpers ────────────────────────────────────────────────────────────

function setStatus(dot, label, msgEl, state, text) {
  dot.className  = 'status__dot';
  msgEl.hidden   = true;
  msgEl.className = 'message';

  switch (state) {
    case 'running':
      dot.classList.add('status__dot--running');
      label.textContent = text ?? 'Running...';
      break;
    case 'error':
      dot.classList.add('status__dot--error');
      label.textContent = 'Error';
      msgEl.textContent = text ?? 'Something went wrong.';
      msgEl.classList.add('message--error');
      msgEl.hidden = false;
      break;
    case 'done':
      label.textContent = text ?? 'Done';
      break;
    default:
      label.textContent = text ?? 'Idle';
  }
}

const setDepotStatus = (state, text) =>
  setStatus(depotStatusDot, depotStatusLabel, depotMessage, state, text);

const setGmailStatus = (state, text) =>
  setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, state, text);

// ── Depot helpers ─────────────────────────────────────────────────────────────

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found');
  return tab;
}

function setDepotButtons(disabled) {
  scanCADBtn.disabled   = disabled;
  scanDriveBtn.disabled = disabled;
}

function showDepotResult(result) {
  if (result.dryRun) {
    setDepotStatus('done', `Dry run: ${result.count} parcel(s) would be processed`);
  } else if (result.warning) {
    setDepotStatus('done', result.warning);
  } else {
    setDepotStatus('done',
      `Done — Changed: ${result.changed} | Skipped: ${result.skipped} | Errors: ${result.errors}`
    );
  }
}

// ── Depot: Scan CAD List ──────────────────────────────────────────────────────

scanCADBtn.addEventListener('click', async () => {
  setDepotStatus('running', 'Scanning CAD list...');
  setDepotButtons(true);
  try {
    const tab = await getActiveTab();
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func:   depotMain,
      args:   [{ dryRun: dryRunToggle.checked, mode: 'cad' }],
      world:  'ISOLATED',
    });
    showDepotResult(result);
  } catch (err) {
    setDepotStatus('error', err.message);
  } finally {
    setDepotButtons(false);
  }
});

// ── Depot: Scan Drive Labels ──────────────────────────────────────────────────

scanDriveBtn.addEventListener('click', async () => {
  setDepotStatus('running', 'Reading Drive labels...');
  setDepotButtons(true);
  try {
    const config = await loadConfig();
    if (!config.openaiApiKey)  throw new Error('OpenAI API Key not set in Settings');
    if (!config.driveFolderId) throw new Error('Drive Folder ID not set in Settings');

    const token       = await getAuthToken();
    const consNumbers = await scanDriveLabels(config.driveFolderId, config.openaiApiKey, token);

    if (consNumbers.length === 0) {
      setDepotStatus('done', 'No label photos found in Drive folder');
      return;
    }

    setDepotStatus('running', `${consNumbers.length} label(s) read — checking depot...`);
    const tab = await getActiveTab();
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func:   depotMain,
      args:   [{ dryRun: dryRunToggle.checked, mode: 'labels', consNumbers }],
      world:  'ISOLATED',
    });
    showDepotResult(result);
  } catch (err) {
    setDepotStatus('error', err.message);
  } finally {
    setDepotButtons(false);
  }
});

// ── Gmail ─────────────────────────────────────────────────────────────────────

autoProcessToggle.addEventListener('change', () =>
  saveSettings({ autoProcess: autoProcessToggle.checked })
);

draftModeToggle.addEventListener('change', () =>
  saveSettings({ draftMode: draftModeToggle.checked })
);

runNowBtn.addEventListener('click', async () => {
  setGmailStatus('running');
  runNowBtn.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'RUN_NOW' });
    if (response?.ok) {
      setGmailStatus('done', 'Done ✓');
    } else {
      setGmailStatus('error', response?.error ?? 'Unknown error');
    }
  } catch (err) {
    logger.error('popup: gmail run failed', err);
    setGmailStatus('error', err.message);
  } finally {
    runNowBtn.disabled = false;
  }
});

// ── Settings persistence ──────────────────────────────────────────────────────

openaiKeyInput.addEventListener('change', () =>
  chrome.storage.local.set({ openaiApiKey: openaiKeyInput.value })
);

driveFolderInput.addEventListener('change', () =>
  chrome.storage.local.set({ driveFolderId: driveFolderInput.value })
);

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const [settings, config] = await Promise.all([getSettings(), loadConfig()]);
  autoProcessToggle.checked = settings.autoProcess;
  draftModeToggle.checked   = settings.draftMode;
  if (config.openaiApiKey)  openaiKeyInput.value   = config.openaiApiKey;
  if (config.driveFolderId) driveFolderInput.value = config.driveFolderId;
}

// ── Accordion: one section open at a time ────────────────────────────────────

document.querySelectorAll('details.section').forEach(detail => {
  detail.querySelector('.section__header').addEventListener('click', (e) => {
    e.preventDefault();
    const isOpen = detail.open;
    document.querySelectorAll('details.section').forEach(d => { d.open = false; });
    if (!isOpen) detail.open = true;
  });
});

init();


