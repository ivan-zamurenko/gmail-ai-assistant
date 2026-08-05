/**
 * popup/gmailFlow.js
 * ==================
 * Handles the Gmail Auto-Reply flow.
 */

import { saveSettings } from '../storage/settings.js';
import { getLastRun, onLastRunChange } from '../storage/runState.js';
import { logger }       from '../utils/logger.js';
import { setStatus }    from './statusHelper.js';

export function initGmailFlow({
  gmailStatusDot, gmailStatusLabel, gmailMessage,
  runNowBtn, autoProcessToggle, gmailQueryInput,
}) {
  function setGmailStatus(state, text, detail) {
    setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, state, text, detail);
  }

  function render(run) {
    if (!run) return;

    runNowBtn.disabled = run.state === 'running';

    switch (run.state) {
      case 'running': setGmailStatus('running', 'Working...');                 break;
      case 'error':   setGmailStatus('error', run.error);                      break;
      case 'done':    setGmailStatus('done', 'Done ✓', summarise(run.result)); break;
    }
  }

  // The worker keeps running while the popup is shut, so pick up both the
  // state it left behind and any change that lands while the popup is open.
  getLastRun().then(render);
  onLastRunChange(render);

  autoProcessToggle.addEventListener('change', () =>
    saveSettings({ autoProcess: autoProcessToggle.checked })
  );

  gmailQueryInput.addEventListener('input', () =>
    saveSettings({ gmailQuery: gmailQueryInput.value.trim() })
  );

  runNowBtn.addEventListener('click', async () => {
    setGmailStatus('running', 'Starting...');
    runNowBtn.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: 'RUN_NOW' });
    } catch (err) {
      logger.error('popup: could not reach the service worker', err);
      setGmailStatus('error', err.message);
      runNowBtn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────────

// "Done" alone cannot be trusted: a query that matches nothing looks exactly
// like a successful run. Spell out what actually happened.
function summarise({ matched = 0, processed = 0, failed = 0, skipped = 0 } = {}) {
  if (matched === 0) return 'No emails matched the search.';
  if (processed + failed + skipped === 0) return `${matched} matched — all answered earlier.`;

  const parts = [`${matched} matched`];
  if (processed) parts.push(`${processed} replied`);
  if (failed)    parts.push(`${failed} failed`);
  if (skipped)   parts.push(`${skipped} queued`);
  return parts.join(' · ');
}
