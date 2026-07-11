/**
 * popup/depotFlow.js
 * ==================
 * Handles all depot-related flows:
 *   - Scan CAD List (Future Dates)
 *   - Scan Drive Labels (OCR → depot → organise)
 */

import { loadConfig }                         from '../config/config.js';
import { getAuthToken, removeCachedAuthToken } from '../auth/getAuthToken.js';
import { scanDriveLabels, organizeLabels }    from '../depot/driveScanner.js';
import { setStatus }                          from './statusHelper.js';

export function initDepotFlow({
  depotStatusDot, depotStatusLabel, depotMessage,
  dryRunToggle, testModeToggle, scanCADBtn, scanDriveBtn,
  scanProgress, progressFill, progressLabel,
}) {
  // ── Internal helpers ────────────────────────────────────────────────────────

  function setDepotStatus(state, text) {
    setStatus(depotStatusDot, depotStatusLabel, depotMessage, state, text);
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

  function showProgress(current, total, state = '') {
    scanProgress.hidden = false;
    progressFill.style.width = `${Math.round((current / total) * 100)}%`;
    const stateLabel = state === 'downloading' ? 'Downloading'
                     : state === 'scanning'    ? 'Scanning'
                     : state.startsWith('waiting') ? state
                     : `Scanning`;
    progressLabel.textContent = `${stateLabel} ${current} of ${total}`;
  }

  function hideProgress() {
    scanProgress.hidden = true;
    progressFill.style.width = '0%';
    progressLabel.textContent = '';
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');
    return tab;
  }

  // ── Scan CAD List ───────────────────────────────────────────────────────────

  scanCADBtn.addEventListener('click', async () => {
    setDepotStatus('running', 'Scanning CAD list...');
    setDepotButtons(true);
    try {
      const tab = await getActiveTab();
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func:   depotMain,
        args:   [{ dryRun: dryRunToggle.checked, mode: 'cad' }],
        world:  'ISOLATED',
      });
      if (!injection.result) throw new Error('Depot script returned no result — check you are on the depot page');
      if (injection.result.__error) throw new Error(injection.result.__error);
      showDepotResult(injection.result);
    } catch (err) {
      setDepotStatus('error', err.message);
    } finally {
      setDepotButtons(false);
    }
  });

  // ── Scan Drive Labels ───────────────────────────────────────────────────────

  scanDriveBtn.addEventListener('click', async () => {
    setDepotStatus('running', 'Keep this window open — scanning labels...');
    setDepotButtons(true);
    try {
      const config = await loadConfig();
      if (!config.geminiApiKey)  throw new Error('Gemini API Key not set in Settings');
      if (!config.driveFolderId) throw new Error('Drive Folder ID not set in Settings');

      let token = await getAuthToken();
      let photos;
      try {
        photos = await scanDriveLabels(config.driveFolderId, config.geminiApiKey, token, showProgress, testModeToggle.checked);
      } catch (err) {
        if (!err.message.includes('403')) throw err;
        // Cached token is stale (missing Drive scope) — remove and retry with fresh one
        await removeCachedAuthToken(token);
        token = await getAuthToken({ interactive: true });
        photos = await scanDriveLabels(config.driveFolderId, config.geminiApiKey, token, showProgress, testModeToggle.checked);
      }

      if (photos.length === 0) {
        setDepotStatus('done', 'No label photos found in Drive folder');
        return;
      }

      const identified = photos.filter(p => p.consNumber);
      const unknown    = photos.filter(p => !p.consNumber);

      // ── Console output ──────────────────────────────────────────────────────
      console.group(`📦 Scan Drive Labels — ${photos.length} photo(s)`);
      if (identified.length) {
        console.group(`✅ Identified (${identified.length})`);
        identified.forEach(p => console.log(`  ${p.consNumber}  ←  ${p.name}`));
        console.groupEnd();
      }
      if (unknown.length) {
        console.group(`❓ Not identified (${unknown.length})`);
        unknown.forEach(p => console.log(`  ${p.name}${p.error ? `  [error: ${p.error}]` : ''}`));
        console.groupEnd();
      }
      console.groupEnd();
      // ───────────────────────────────────────────────────────────────────────

      if (identified.length === 0) {
        if (!dryRunToggle.checked) {
          setDepotStatus('running', 'No numbers identified — moving to Unknown...');
          await organizeLabels(photos, [], config.driveFolderId, token);
        }
        setDepotStatus('done', `Scanned ${photos.length} photo(s) — 0 numbers identified. Check labels or Gemini key.`);
        return;
      }

      if (!dryRunToggle.checked) {
        setDepotStatus('running', 'Organising label photos...');
        await organizeLabels(photos, [], config.driveFolderId, token);
      }

      setDepotStatus('done',
        `${identified.length}/${photos.length} identified: ${identified.map(p => p.consNumber).join(', ')}`
      );
    } catch (err) {
      setDepotStatus('error', err.message);
    } finally {
      hideProgress();
      setDepotButtons(false);
    }
  });
}
