/**
 * popup/popup.js
 * ==============
 * Thin orchestrator: wires DOM elements to feature modules.
 */

import { loadConfig }       from '../config/config.js';
import { initDepotFlow }    from './depotFlow.js';
import { initGmailFlow }    from './gmailFlow.js';
import { initSettingsFlow } from './settingsFlow.js';
import { setStatus }        from './statusHelper.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const depotStatusDot    = document.getElementById('depotStatusDot');
const depotStatusLabel  = document.getElementById('depotStatusLabel');
const depotMessage      = document.getElementById('depotMessage');
const dryRunToggle      = document.getElementById('dryRun');
const verifyDepotToggle = document.getElementById('verifyDepot');
const scanCADBtn        = document.getElementById('scanCAD');
const scanDriveBtn      = document.getElementById('scanDrive');
const scanProgress      = document.getElementById('scanProgress');
const progressFill      = document.getElementById('progressFill');
const progressLabel     = document.getElementById('progressLabel');
const depotLogEl        = document.getElementById('depotLog');

const gmailStatusDot    = document.getElementById('gmailStatusDot');
const gmailStatusLabel  = document.getElementById('gmailStatusLabel');
const gmailMessage      = document.getElementById('gmailMessage');
const checkLabelBtn     = document.getElementById('checkLabel');

const geminiKeyInput    = document.getElementById('geminiApiKey');
const driveFolderInput  = document.getElementById('driveFolderId');
const browseDriveBtn    = document.getElementById('browseDrive');
const driveFolderPicker = document.getElementById('driveFolderPicker');
const saveSettingsBtn   = document.getElementById('saveSettings');

// ── Feature modules ───────────────────────────────────────────────────────────

function setDepotStatus(state, text) {
  setStatus(depotStatusDot, depotStatusLabel, depotMessage, state, text);
}

initDepotFlow({
  depotStatusDot, depotStatusLabel, depotMessage,
  dryRunToggle, verifyDepotToggle, scanCADBtn, scanDriveBtn,
  scanProgress, progressFill, progressLabel, depotLogEl,
});

initGmailFlow({
  gmailStatusDot, gmailStatusLabel, gmailMessage, checkLabelBtn,
});

initSettingsFlow({
  geminiKeyInput, driveFolderInput, browseDriveBtn,
  driveFolderPicker, saveSettingsBtn,
  onBrowseError: (msg) => setDepotStatus('error', msg),
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const config = await loadConfig();
  if (config.geminiApiKey)  geminiKeyInput.value   = config.geminiApiKey;
  if (config.driveFolderId) driveFolderInput.value = config.driveFolderId;
}

// ── Accordion: one section open at a time ─────────────────────────────────────

document.querySelectorAll('details.section').forEach(detail => {
  detail.querySelector('.section__header').addEventListener('click', (e) => {
    e.preventDefault();
    const isOpen = detail.open;
    document.querySelectorAll('details.section').forEach(d => { d.open = false; });
    if (!isOpen) detail.open = true;
  });
});

init();

