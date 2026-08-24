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
import { createLog }                           from './logView.js';
import { setStatus }                           from './statusHelper.js';

const STATE_LABELS = {
  listing:     'Listing',
  downloading: 'Downloading',
  reading:     'Reading',
  checking:    'Checking',
  filing:      'Filing',
};

// "0 matches" is the depot answering; any other failure means it is not.
const ANSWERED = /^\d+ matches$/;

// A number that cannot exist — any answer to it proves the depot is alive.
const DEPOT_PROBE = '000000000';

function fatal(message) {
  const err = new Error(message);
  err.fatal = true;
  return err;
}

export function initDepotFlow({
  depotStatusDot, depotStatusLabel, depotMessage,
  dryRunToggle, scanCADBtn, scanDriveBtn,
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

  // Asks the depot whether a number is a real parcel. Reuses the same lookup
  // the email flow runs, so there is one definition of "this parcel is ours".
  // A consignment of ten parcels repeats one number ten times, hence the cache.
  function depotVerifier() {
    const seen = new Map();

    return async function verify(number) {
      if (seen.has(number)) return seen.get(number);

      const tab = await getActiveTab();
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
      if (!injection?.result) throw fatal('Depot lookup returned nothing — open the depot page in the active tab');

      const [result] = injection.result;
      if (!result.consNumber && !ANSWERED.test(result.reason ?? '')) {
        throw fatal(`Depot is not responding — ${result.reason}`);
      }

      const found = Boolean(result.consNumber);
      if (!found && number !== DEPOT_PROBE) log.warn(`  ${number} — ${result.reason}`);
      seen.set(number, found);
      return found;
    };
  }

  // The labels find the parcels; this hands their consignment numbers to the
  // same depot reschedule the CAD list runs. dryRun only logs what would move.
  async function rescheduleFound(results, dryRun) {
    const numbers = [...new Set(results.filter(r => r.number).map(r => r.number))];
    if (numbers.length === 0) return '';

    log.info(`${dryRun ? 'Would reschedule' : 'Rescheduling'} ${numbers.length} parcel(s) to tomorrow...`);

    const tab = await getActiveTab();
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func:   depotMain,
      args:   [{ dryRun, mode: 'labels', consNumbers: numbers }],
      world:  'MAIN',
    });

    const res = injection?.result;
    if (!res || res.__error) {
      log.fail(`Reschedule: ${res?.__error ?? 'depot script returned nothing'}`);
      return ' | Reschedule failed';
    }
    if (res.dryRun) {
      log.info(`Dry run — ${res.count} parcel(s) would be rescheduled`);
      return ` | Would reschedule ${res.count}`;
    }
    if (res.warning) {
      log.warn(res.warning);
      return ' | Reschedule: none matched';
    }
    log.info(`Reschedule — Changed: ${res.changed} | Skipped: ${res.skipped} | Errors: ${res.errors}`);
    return ` | Rescheduled ${res.changed}`;
  }

  scanDriveBtn.addEventListener('click', async () => {
    const dryRun = dryRunToggle.checked;
    log.start(dryRun ? 'Dry run — nothing will be moved or rescheduled' : 'Listing photos in Drive...');
    setDepotStatus('running', 'Keep this window open — processing labels...');
    setDepotButtons(true);

    try {
      const config = await loadConfig();
      if (!config.driveFolderId) throw new Error('Drive Folder ID not set in Settings');

      // Fail before touching Drive rather than halfway through the folder.
      const verify = depotVerifier();
      log.info('Checking depot connection...');
      await verify(DEPOT_PROBE);
      log.ok('Depot is responding');

      const run = (token) => processLabels({
        folderInput: config.driveFolderId,
        token,
        verify,
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

      const reschedule = await rescheduleFound(results, dryRun);

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
