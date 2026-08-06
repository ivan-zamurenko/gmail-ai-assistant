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
    setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, 'running', 'Checking...');
    checkLabelBtn.disabled = true;
    try {
      const labelId = await findLabelId(CONSTANTS.LABEL_QUEUE);
      if (!labelId) throw new Error(`No "${CONSTANTS.LABEL_QUEUE}" label in this mailbox`);

      const ids = await listByLabel(labelId);
      setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage,
        'done', `${ids.length} email(s) waiting`);
    } catch (err) {
      setStatus(gmailStatusDot, gmailStatusLabel, gmailMessage, 'error', err.message);
    } finally {
      checkLabelBtn.disabled = false;
    }
  });
}
