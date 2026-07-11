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
  runNowBtn, autoProcessToggle, draftModeToggle,
}) {
  function setGmailStatus(state, text) {
    setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, state, text);
  }

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
}
