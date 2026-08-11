/**
 * popup/depotFlow.js
 * ==================
 * Handles all depot-related flows:
 *   - Scan CAD List (Future Dates)
 *   - Scan Drive Labels (barcode → depot → file under YYYY/MM)
 */

import { loadConfig }                         from '../config/config.js';
import { getAuthToken, removeCachedAuthToken } from '../auth/getAuthToken.js';
import { scanDriveLabels, fileLabels }         from '../depot/driveScanner.js';
import { depotLookup }                         from '../depot/lookup.js';
import { depotMain }                           from '../depot/depotScript.js';
import { setStatus }                           from './statusHelper.js';

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
    const stateLabel = state === 'downloading' ? 'Downloading' : 'Reading';
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
        // The depot rejects POSTs from an isolated world; MAIN makes them
        // ordinary page requests, exactly like running the snippet in the console.
        world:  'MAIN',
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

  // Asks the depot which of these numbers really exist. Reuses the same lookup
  // the email flow runs, so there is one definition of "this parcel is ours".
  async function confirmNumbers(numbers) {
    if (!numbers.length) return new Set();

    const tab = await getActiveTab();
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func:   depotLookup,
      args:   [numbers],
      world:  'MAIN',
    });
    if (!injection.result) throw new Error('Depot lookup returned nothing — check you are on the depot page');

    console.group(`🔍 Depot lookup — ${numbers.length} number(s)`);
    injection.result.forEach(r => console.log(`  ${r.query}: ${r.ok ? 'ok' : r.reason}`));
    console.groupEnd();

    return new Set(injection.result.map(r => r.consNumber).filter(Boolean));
  }

  scanDriveBtn.addEventListener('click', async () => {
    setDepotStatus('running', 'Keep this window open — reading labels...');
    setDepotButtons(true);
    try {
      const config = await loadConfig();
      if (!config.driveFolderId) throw new Error('Drive Folder ID not set in Settings');

      let token  = await getAuthToken();
      let photos;
      try {
        photos = await scanDriveLabels(config.driveFolderId, token, showProgress, testModeToggle.checked);
      } catch (err) {
        if (!err.message.includes('403')) throw err;
        // Cached token is stale (missing Drive scope) — remove and retry with fresh one
        await removeCachedAuthToken(token);
        token  = await getAuthToken({ interactive: true });
        photos = await scanDriveLabels(config.driveFolderId, token, showProgress, testModeToggle.checked);
      }

      if (photos.length === 0) {
        setDepotStatus('done', 'No label photos found in Drive folder');
        return;
      }

      const numbers = [...new Set(photos.map(p => p.number).filter(Boolean))];

      setDepotStatus('running', `Read ${numbers.length} number(s) — checking the depot...`);
      const confirmed = await confirmNumbers(numbers);

      console.group(`📦 Scan Drive Labels — ${photos.length} photo(s)`);
      photos.forEach(p => console.log(
        `  ${p.number && confirmed.has(p.number) ? p.number : '—'.padEnd(9)}  ←  ${p.name}`
        + (p.contested ? '  [contested]' : '')
        + (p.error ? `  [error: ${p.error}]` : '')
      ));
      console.groupEnd();

      if (dryRunToggle.checked) {
        setDepotStatus('done', `Dry run: ${confirmed.size}/${numbers.length} confirmed — see console`);
        return;
      }

      setDepotStatus('running', 'Filing photos...');
      const filed  = await fileLabels(photos, confirmed, config.driveFolderId, token);
      const failed = filed.filter(r => r.error);

      console.group(`🗂️ Filed ${filed.length - failed.length}/${photos.length}`);
      filed.forEach(r => console.log(`  ${r.from} → ${r.to ?? `FAILED: ${r.error}`}`));
      console.groupEnd();

      setDepotStatus('done',
        `Filed ${filed.length - failed.length}/${photos.length}`
        + (failed.length ? ` | Errors: ${failed.length}` : '')
      );
    } catch (err) {
      setDepotStatus('error', err.message);
    } finally {
      hideProgress();
      setDepotButtons(false);
    }
  });
}
