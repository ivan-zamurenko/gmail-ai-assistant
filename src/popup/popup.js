/**
 * popup/popup.js
 * ==============
 * UI controller for the extension popup.
 *
 * Responsibility: bind DOM events, read/write settings, trigger the
 * background service worker via chrome.runtime.sendMessage.
 * No business logic here.
 */

import { getSettings, saveSettings } from '../storage/settings.js';
import { logger }                    from '../utils/logger.js';

// ── DOM refs ─────────────────────────────────────────────────────────────────

const statusDot    = document.getElementById('statusDot');
const statusLabel  = document.getElementById('statusLabel');
const autoProcess  = document.getElementById('autoProcess');
const draftMode    = document.getElementById('draftMode');
const runNowBtn    = document.getElementById('runNow');
const errorMessage = document.getElementById('errorMessage');

// ── Status helpers ────────────────────────────────────────────────────────────

/**
 * Updates the status indicator.
 * @param {'idle'|'running'|'error'} state
 * @param {string} [label]
 */
function setStatus(state, label) {
  statusDot.className = 'status__dot';
  errorMessage.hidden = true;

  switch (state) {
    case 'running':
      statusDot.classList.add('status__dot--running');
      statusLabel.textContent = label ?? 'Running...';
      break;
    case 'error':
      statusDot.classList.add('status__dot--error');
      statusLabel.textContent = 'Error';
      errorMessage.textContent = label ?? 'Something went wrong.';
      errorMessage.hidden = false;
      break;
    default:
      statusLabel.textContent = label ?? 'Idle';
  }
}

// ── Initialise ────────────────────────────────────────────────────────────────

async function init() {
  const settings = await getSettings();
  autoProcess.checked = settings.autoProcess;
  draftMode.checked   = settings.draftMode;
}

// ── Settings persistence ──────────────────────────────────────────────────────

autoProcess.addEventListener('change', () =>
  saveSettings({ autoProcess: autoProcess.checked })
);

draftMode.addEventListener('change', () =>
  saveSettings({ draftMode: draftMode.checked })
);

// ── Manual trigger ────────────────────────────────────────────────────────────

runNowBtn.addEventListener('click', async () => {
  setStatus('running');
  runNowBtn.disabled = true;

  try {
    // Delegate to the background service worker
    const response = await chrome.runtime.sendMessage({ type: 'RUN_NOW' });

    if (response?.ok) {
      setStatus('idle', 'Done ✓');
    } else {
      setStatus('error', response?.error ?? 'Unknown error');
    }
  } catch (err) {
    logger.error('popup: run failed', err);
    setStatus('error', err.message);
  } finally {
    runNowBtn.disabled = false;
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

init();
