/**
 * popup/depotFlow.js
 * ==================
 * Handles all depot-related flows:
 *   - Scan CAD List (Future Dates)
 *   - Scan Drive Labels (barcode → depot → file under YYYY/MM)
 */

import { loadConfig }                          from '../config/config.js';
import { getAuthToken, removeCachedAuthToken } from '../auth/getAuthToken.js';
import { processLabels }                       from '../depot/driveScanner.js';
import { depotLookup }                         from '../depot/lookup.js';
import { depotMain }                           from '../depot/depotScript.js';
import { createLabelVerifier, DEPOT_PROBE }     from '../depot/labelVerifier.js';
import {
  addRecoveryTargets,
  applyRecoveryResult,
  loadRecoveryTargets,
} from '../depot/rescheduleRecovery.js';
import { createLog }                           from './logView.js';
import { setStatus }                           from './statusHelper.js';
import { CONSTANTS }                           from '../utils/constants.js';

const STATE_LABELS = {
  listing:     'Listing',
  downloading: 'Downloading',
  reading:     'Reading',
  checking:    'Checking',
  filing:      'Filing',
};

function fatal(message) {
  const err = new Error(message);
  err.fatal = true;
  return err;
}

export function initDepotFlow({
  depotStatusDot, depotStatusLabel, depotMessage,
  dryRunToggle, scanCADBtn, scanDriveBtn, retryRescheduleBtn,
  scanProgress, progressFill, progressLabel, depotLogEl,
}) {
  const log = createLog(depotLogEl);

  // ── Internal helpers ────────────────────────────────────────────────────────

  function setDepotStatus(state, text) {
    setStatus(depotStatusDot, depotStatusLabel, depotMessage, state, text);
  }

  function setDepotButtons(disabled) {
    scanCADBtn.disabled   = disabled;
    scanDriveBtn.disabled = disabled;
    retryRescheduleBtn.disabled = disabled;
  }

  async function refreshRetryButton() {
    const targets = await loadRecoveryTargets(chrome.storage.local);
    retryRescheduleBtn.hidden = targets.length === 0;
    retryRescheduleBtn.textContent = `Retry Today's Errors (${targets.length})`;
    return targets;
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

  function hideProgress() {
    scanProgress.hidden = true;
    progressFill.style.width = '0%';
    progressLabel.textContent = '';
  }

  // Photos go past too fast to follow one by one, so the log keeps only the
  // outcome of each: where it ended up, or why it did not.
  function onScanProgress(current, total, state, entry) {
    scanProgress.hidden = false;
    const percent = Math.round((current / total) * 100);
    progressFill.style.width = `${percent}%`;
    progressLabel.textContent = state === 'listing'
      ? 'Listing photos...'
      : `${STATE_LABELS[state] ?? 'Working'} ${current} of ${total} · ${percent}%`;

    if (state !== 'done') return;

    const prefix = `${current}/${total}`;
    const name   = entry.to?.split('/').pop();
    if (entry.error)          log.fail(`${prefix} ✗ ${entry.from} — ${entry.error}`);
    else if (!entry.number)   log.warn(`${prefix} ? ${name}`);
    else if (entry.contested) log.warn(`${prefix} ✓ ${name} (contested)`);
    else                      log.ok(`${prefix} ✓ ${name}`);
  }

  async function getActiveDepotTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');
    let url;
    try {
      url = new URL(tab.url);
    } catch {
      throw new Error('Open the depot page in the active tab first');
    }
    const isDepot = url.protocol === 'http:'
      && url.hostname.toLowerCase().endsWith('.interlink.local');
    if (!isDepot) {
      throw new Error(`Active tab is not a depot page (${CONSTANTS.DEPOT_URL_PATTERN})`);
    }
    return tab;
  }

  // ── Scan CAD List ───────────────────────────────────────────────────────────

  scanCADBtn.addEventListener('click', async () => {
    if (!dryRunToggle.checked && !window.confirm(
      'LIVE MODE: dates will be changed in the depot. Continue?',
    )) return;
    setDepotStatus('running', 'Scanning CAD list...');
    setDepotButtons(true);
    try {
      const tab = await getActiveDepotTab();
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

  // Asks the depot whether a number is a real parcel. Reuses the same lookup
  // the email flow runs, so there is one definition of "this parcel is ours".
  // A consignment of ten parcels repeats one number ten times, hence the cache.
  function depotVerifier() {
    return createLabelVerifier({
      lookup: async (number) => {
        const tab = await getActiveDepotTab();
        let injection;
        try {
          [injection] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func:   depotLookup,
            args:   [[number]],
            world:  'MAIN',
          });
        } catch (err) {
          throw fatal(`Cannot reach the depot tab — ${err.message}`);
        }
        if (!injection?.result) {
          throw fatal('Depot lookup returned nothing — open the depot page in the active tab');
        }
        return injection.result[0];
      },
      onRejected: (number, reason) => log.warn(`  ${number} — ${reason}`),
    });
  }

  async function runExactReschedule(targets, dryRun) {
    log.info(`${dryRun ? 'Would reschedule' : 'Rescheduling'} ${targets.length} parcel(s) to tomorrow...`);

    // Persist before the live attempt. If the popup closes or every request
    // fails, the exact targets remain reusable without reading Drive again.
    if (!dryRun) {
      await addRecoveryTargets(chrome.storage.local, targets);
      await refreshRetryButton();
    }

    const tab = await getActiveDepotTab();
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func:   depotMain,
      args:   [{ dryRun, mode: 'labels', targets }],
      world:  'MAIN',
    });

    const res = injection?.result;
    if (!res || res.__error) {
      log.fail(`Reschedule: ${res?.__error ?? 'depot script returned nothing'}`);
      const remaining = await refreshRetryButton();
      return ` | Reschedule failed | Retry saved: ${remaining.length}`;
    }
    if (res.dryRun) {
      log.info(`Dry run — ${res.count} parcel(s) would be rescheduled`);
      return ` | Would reschedule ${res.count}`;
    }
    if (res.warning) {
      log.warn(res.warning);
      return ' | Reschedule: none matched';
    }

    const errors = (res.results ?? []).filter(entry => entry.action === 'ERROR');
    const skipped = (res.results ?? []).filter(entry => entry.action === 'SKIP');
    for (const entry of errors.slice(0, 20)) log.fail(`${entry.consNumber} — reschedule failed`);
    if (errors.length > 20) log.fail(`...and ${errors.length - 20} more failed parcel(s)`);
    for (const entry of skipped.slice(0, 20)) log.warn(`${entry.consNumber} — skipped (${entry.status})`);
    if (skipped.length > 20) log.warn(`...and ${skipped.length - 20} more skipped parcel(s)`);

    const remaining = await applyRecoveryResult(chrome.storage.local, res);
    await refreshRetryButton();
    log.info(`Reschedule — Changed: ${res.changed} | Skipped: ${res.skipped} | Errors: ${res.errors}`);
    if (remaining.length) log.warn(`${remaining.length} failed parcel(s) saved for retry`);
    return ` | Rescheduled ${res.changed}`
      + (remaining.length ? ` | Retry saved: ${remaining.length}` : '');
  }

  // Label verification already resolved exact depot targets. Reschedule those
  // directly; a driver-scanned parcel can be PENDING without being in Pending List.
  async function rescheduleFound(results, dryRun, targetsFor) {
    const numbers = [...new Set(results.filter(r => r.number).map(r => r.number))];
    if (numbers.length === 0) return '';

    const { targets, unresolved } = targetsFor(numbers);
    if (unresolved) log.warn(`${unresolved} verified parcel(s) had no exact depot target`);
    if (targets.length === 0) return ' | Reschedule: no exact targets';

    return runExactReschedule(targets, dryRun);
  }

  retryRescheduleBtn.addEventListener('click', async () => {
    const targets = await refreshRetryButton();
    if (targets.length === 0) {
      setDepotStatus('done', 'No failed reschedules are waiting');
      return;
    }

    const dryRun = dryRunToggle.checked;
    if (!dryRun && !window.confirm(
      `LIVE RETRY: attempt ${targets.length} saved parcel(s) again without scanning Drive?`,
    )) return;

    log.start(`${dryRun ? 'Dry run' : 'Live retry'} — using ${targets.length} saved parcel target(s)`);
    setDepotStatus('running', 'Retrying saved reschedules — Drive will not be scanned');
    setDepotButtons(true);
    try {
      const result = await runExactReschedule(targets, dryRun);
      const remaining = await refreshRetryButton();
      setDepotStatus('done',
        `${dryRun ? 'Retry preview complete' : 'Retry complete'}${result}`
        + (remaining.length ? ` | Still waiting: ${remaining.length}` : ''),
      );
    } catch (err) {
      log.fail(err.message);
      setDepotStatus('error', `${err.message} | Saved targets remain available`);
    } finally {
      setDepotButtons(false);
    }
  });

  refreshRetryButton().catch((err) => {
    log.fail(`Cannot load saved reschedules — ${err.message}`);
  });

  scanDriveBtn.addEventListener('click', async () => {
    const dryRun = dryRunToggle.checked;
    if (!dryRun && !window.confirm(
      'LIVE MODE: photos will be moved and parcel dates may change. Continue?',
    )) return;
    log.start(dryRun ? 'Dry run — nothing will be moved or rescheduled' : 'Listing photos in Drive...');
    setDepotStatus('running', 'Keep this window open — processing labels...');
    setDepotButtons(true);

    try {
      const config = await loadConfig();
      if (!config.driveFolderId) throw new Error('Drive Folder ID is missing from local configuration');

      // Fail before touching Drive rather than halfway through the folder.
      const depot = depotVerifier();
      log.info('Checking depot connection...');
      await depot.verify(DEPOT_PROBE);
      log.ok('Depot is responding');

      const run = (token) => processLabels({
        folderInput: config.driveFolderId,
        token,
        verify: depot.verify,
        dryRun,
        onProgress:  onScanProgress,
      });

      let token   = await getAuthToken();
      let results;
      try {
        results = await run(token);
      } catch (err) {
        if (!err.message.includes('403')) throw err;
        // Cached token is stale (missing Drive scope) — remove and retry with fresh one
        await removeCachedAuthToken(token);
        token   = await getAuthToken({ interactive: true });
        results = await run(token);
      }

      if (results.length === 0) {
        log.warn('No label photos found');
        setDepotStatus('done', 'No label photos found in Drive folder');
        return;
      }

      const failed = results.filter(r => r.error).length;
      const read   = results.filter(r => r.number).length;
      log.info(`${dryRun ? 'Would file' : 'Filed'} ${results.length - failed} of ${results.length} — read ${read}`);

      const reschedule = await rescheduleFound(results, dryRun, depot.targetsFor);

      setDepotStatus('done',
        `${dryRun ? 'Dry run' : 'Filed'} ${results.length - failed}/${results.length} — read ${read}`
        + (failed ? ` | Errors: ${failed}` : '')
        + reschedule
      );
    } catch (err) {
      const message = err.fatal ? `Stopped — ${err.message}` : err.message;
      log.fail(message);
      setDepotStatus('error', message);
    } finally {
      hideProgress();
      setDepotButtons(false);
    }
  });
}
