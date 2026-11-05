import { safeErrorMessage } from '../utils/errors.js';
/**
 * popup/gmailFlow.js
 * ==================
 * Gmail section of the popup.
 */

import { findLabelId, listByLabel } from '../gmail/labels.js';
import { CONSTANTS }                from '../utils/constants.js';
import { setStatus }                from './statusHelper.js';

export function initGmailFlow({
  gmailStatusDot, gmailStatusLabel, gmailMessage, checkLabelBtn, mailSigninBtn,
}) {
  checkLabelBtn.addEventListener('click', async () => {
    if (checkLabelBtn.disabled) return;
    setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, 'running', 'Checking...');
    checkLabelBtn.disabled = true;
    try {
      const labelId = await findLabelId(CONSTANTS.LABEL_QUEUE);
      if (!labelId) {
        setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, 'done', 'Label not found',
          `No "${CONSTANTS.LABEL_QUEUE}" label in this mailbox.`);
        return;
      }

      const { ids, complete, reason } = await listByLabel(labelId);
      if (complete) {
        setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, 'done',
          ids.length ? `${ids.length} email(s) waiting` : 'Queue empty');
      } else {
        const detail = reason === 'repeated_page_token'
          ? 'Gmail returned a repeated page token.' : 'The local reading limit was reached.';
        setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, 'done',
          `At least ${ids.length} email(s) found`, `Partial list — ${detail} No messages were processed.`);
      }
    } catch (err) {
      setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, 'error', safeErrorMessage(err, 'Gmail check failed'));
    } finally {
      checkLabelBtn.disabled = false;
    }
  });

  // Work mailbox for the Discord mail channel; the background owns the auth window.
  mailSigninBtn?.addEventListener('click', async () => {
    setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, 'running', 'Вхід у робочу пошту…');
    const response = await chrome.runtime.sendMessage({ type: 'mail-signin' }).catch(() => null);
    if (response?.ok) setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, 'done', 'Робочу пошту підключено');
    else setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, 'error', response?.reason || 'Вхід не виконано');
  });
}
