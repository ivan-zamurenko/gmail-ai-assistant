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
  gmailStatusDot, gmailStatusLabel, gmailMessage, checkLabelBtn,
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
}
