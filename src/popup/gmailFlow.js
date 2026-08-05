/**
 * popup/gmailFlow.js
 * ==================
 * Handles the Gmail Auto-Reply flow.
 */

import { saveSettings } from '../storage/settings.js';
import { logger }       from '../utils/logger.js';
import { setStatus }    from './statusHelper.js';

export function initGmailFlow({
  gmailStatusDot, gmailStatusLabel, gmailMessage,
  runNowBtn, autoProcessToggle, draftModeToggle, gmailQueryInput,
}) {
  function setGmailStatus(state, text, detail) {
    setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, state, text, detail);
  }

  autoProcessToggle.addEventListener('change', () =>
    saveSettings({ autoProcess: autoProcessToggle.checked })
  );

  draftModeToggle.addEventListener('change', () =>
    saveSettings({ draftMode: draftModeToggle.checked })
  );

  gmailQueryInput.addEventListener('input', () =>
    saveSettings({ gmailQuery: gmailQueryInput.value.trim() })
  );

  runNowBtn.addEventListener('click', async () => {
    setGmailStatus('running');
    runNowBtn.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'RUN_NOW' });
      if (response?.ok) {
        setGmailStatus('done', 'Done ✓', summarise(response.result));
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
