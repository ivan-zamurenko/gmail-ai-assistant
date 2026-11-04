import { logRescheduleResult } from '../depot/rescheduleDiagnostics.js';
import { irishDay, prepareDepotArgs } from '../../shared/depotCalendar.js';
import { safeErrorMessage } from '../utils/errors.js';
/**
 * popup/depotFlow.js
 * ==================
 * Handles all depot-related flows:
 *   - Scan CAD List (Future Dates)
 *   - Scan Drive Labels (barcode → depot → file under YYYY/MM)
 */

import { getAuthToken }                        from '../auth/getAuthToken.js';
import { LABEL_SCAN_JOB_KEY, isActive }        from '../queue/labelScanJob.js';
import { depotMain }                           from '../depot/depotScript.js';
import { assertDepotTab }                      from '../depot/depotTarget.js';
import {
  addRecoveryTargets,
  applyRecoveryResult,
  loadRecoveryTargets,
} from '../depot/rescheduleRecovery.js';
import { createLog }                           from './logView.js';
import { setStatus }                           from './statusHelper.js';

const JOB_STAGES = {
  queued:       'Waiting for the queue',
  'depot-probe': 'Checking depot',
  'depot-ready': 'Depot ready',
  'drive-auth':  'Authorising Drive',
  'drive-ready': 'Drive ready',
  listing:      'Listing photos',
  downloading:  'Downloading',
  reading:      'Reading',
  checking:     'Checking',
  filing:       'Filing',
  reschedule:   'Rescheduling',
};

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
      setDepotStatus('done', `Dry run: checked ${result.count} consignments | Eligible: ${result.eligible} | Skipped: ${result.skipped} | Review: ${result.review ?? 0} | Errors: ${result.errors} | ${result.date} (${result.calendarTimeZone}; ${result.calendarVersion}; ${result.policyVersion})`);
    } else if (result.warning) {
      setDepotStatus('done', result.warning);
    } else {
      setDepotStatus('done',
        `Done — Changed: ${result.changed} | Skipped: ${result.skipped} | Review: ${result.review ?? 0} | Errors: ${result.errors}`
      );
    }
    for (const entry of (result.results ?? []).slice(0, 25)) {
      log.info(`${entry.consNumber} — ${entry.action}: ${entry.reason ?? ''}`);
    }
  }

  function hideProgress() {
    scanProgress.hidden = true;
    progressFill.style.width = '0%';
    progressLabel.textContent = '';
  }

  async function getActiveDepotTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return assertDepotTab(tab);
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
        args:   [prepareDepotArgs({ dryRun: dryRunToggle.checked, mode: 'cad' })],
        // The depot rejects POSTs from an isolated world; MAIN makes them
        // ordinary page requests, exactly like running the snippet in the console.
        world:  'MAIN',
      });
      logRescheduleResult(injection.result);
      if (!injection.result) throw new Error('Depot script returned no result — check you are on the depot page');
      if (injection.result.__error) throw new Error(injection.result.__error);
      showDepotResult(injection.result);
    } catch (err) {
      setDepotStatus('error', safeErrorMessage(err, 'Depot operation failed'));
    } finally {
      setDepotButtons(false);
    }
  });

  // ── Exact reschedule of saved targets (retry) ───────────────────────────────

  async function runExactReschedule(targets, dryRun, expectedDay) {
    // Capture before persistence/tab awaits, and reject retry confirmation that
    // outlived its original Irish day before it can re-add old targets.
    const operationNow = new Date();
    const prepared = prepareDepotArgs({ dryRun, mode: 'labels', targets, expectedDay }, operationNow);
    log.info(`${dryRun ? 'Would reschedule' : 'Rescheduling'} ${targets.length} parcel(s) to the next Irish working day...`);

    // Persist before the live attempt. If the popup closes or every request
    // fails, the exact targets remain reusable without reading Drive again.
    if (!dryRun) {
      await addRecoveryTargets(chrome.storage.local, targets, { now: operationNow });
      await refreshRetryButton();
    }

    const tab = await getActiveDepotTab();
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func:   depotMain,
      args:   [prepared],
      world:  'MAIN',
    });

    const res = injection?.result;
    logRescheduleResult(res);
    if (!res || res.__error) {
      log.fail(`Reschedule: ${res?.__error ?? 'depot script returned nothing'}`);
      const remaining = await refreshRetryButton();
      return ` | Reschedule failed | Retry saved: ${remaining.length}`;
    }
    if (res.dryRun) {
      log.info(`Dry run — checked ${res.count} | Eligible: ${res.eligible} | Skipped: ${res.skipped} | Review: ${res.review ?? 0} | Errors: ${res.errors} | ${res.date} (${res.calendarTimeZone}; ${res.calendarVersion}; ${res.policyVersion})`);
      for (const entry of (res.results ?? []).slice(0, 25)) log.info(`${entry.consNumber} — ${entry.action}: ${entry.reason ?? ''}`);
      return ` | Would reschedule ${res.eligible} | Review: ${res.review ?? 0} | Errors: ${res.errors}`;
    }
    if (res.warning) {
      log.warn(res.warning);
      return ' | Reschedule: none matched';
    }

    const errors = (res.results ?? []).filter(entry => entry.action === 'ERROR');
    const skipped = (res.results ?? []).filter(entry => entry.action === 'SKIP');
    const review = (res.results ?? []).filter(entry => entry.action === 'REVIEW');
    for (const entry of errors.slice(0, 20)) log.fail(`${entry.consNumber} — reschedule failed`);
    if (errors.length > 20) log.fail(`...and ${errors.length - 20} more failed parcel(s)`);
    for (const entry of review.slice(0, 20)) log.warn(`${entry.consNumber} — needs review (${entry.reason ?? 'manual review required'})`);
    if (review.length > 20) log.warn(`...and ${review.length - 20} more parcel(s) need review`);
    for (const entry of skipped.slice(0, 20)) log.warn(`${entry.consNumber} — skipped (${entry.status})`);
    if (skipped.length > 20) log.warn(`...and ${skipped.length - 20} more skipped parcel(s)`);

    const remaining = await applyRecoveryResult(chrome.storage.local, res);
    await refreshRetryButton();
    log.info(`Reschedule — Changed: ${res.changed} | Skipped: ${res.skipped} | Review: ${res.review ?? 0} | Errors: ${res.errors}`);
    if (remaining.length) log.warn(`${remaining.length} failed or review parcel(s) saved for retry`);
    return ` | Rescheduled ${res.changed}`
      + (remaining.length ? ` | Retry saved: ${remaining.length}` : '');
  }

  retryRescheduleBtn.addEventListener('click', async () => {
    const expectedDay = irishDay();
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
      const result = await runExactReschedule(targets, dryRun, expectedDay);
      const remaining = await refreshRetryButton();
      setDepotStatus('done',
        `${dryRun ? 'Retry preview complete' : 'Retry complete'}${result}`
        + (remaining.length ? ` | Still waiting: ${remaining.length}` : ''),
      );
    } catch (err) {
      log.fail(safeErrorMessage(err, 'Depot operation failed'));
      setDepotStatus('error', `${safeErrorMessage(err, 'Depot operation failed')} | Saved targets remain available`);
    } finally {
      setDepotButtons(false);
    }
  });

  refreshRetryButton().catch((err) => {
    log.fail(`Cannot load saved reschedules — ${safeErrorMessage(err, 'Depot operation failed')}`);
  });

  // ── Scan Drive Labels: a background job (S04-03) ─────────────────────────────
  // The popup only starts and watches it; offscreen runs it in the shared queue,
  // so closing this window does not stop the batch.
  let shownJob = null;

  function renderLabelJob(job) {
    if (!job || job.version !== 1) return;
    const short = String(job.id).slice(0, 8);
    const mode = job.dryRun ? 'Dry run' : 'Live';
    if (isActive(job)) {
      scanProgress.hidden = false;
      const percent = job.total > 0 ? Math.round((job.current / job.total) * 100) : 0;
      progressFill.style.width = `${percent}%`;
      progressLabel.textContent = `${JOB_STAGES[job.stage] ?? 'Working'}`
        + (job.total > 0 ? ` ${job.current} of ${job.total} · ${percent}%` : '');
      setDepotStatus('running', `${mode} label scan ${short} running — you can close this window`);
      setDepotButtons(true);
      return;
    }
    hideProgress();
    setDepotButtons(false);
    const at = new Date(job.updatedAt).toLocaleTimeString();
    setDepotStatus(job.state === 'done' ? 'done' : 'error', `${mode} label scan ${short} (${at}): ${job.summary ?? job.state}`);
    if (shownJob !== job.id) {
      shownJob = job.id;
      for (const line of String(job.details ?? '').split('\n').filter(Boolean)) log.info(line);
    }
    refreshRetryButton().catch(() => {});
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[LABEL_SCAN_JOB_KEY]) renderLabelJob(changes[LABEL_SCAN_JOB_KEY].newValue);
  });
  chrome.storage.local.get(LABEL_SCAN_JOB_KEY)
    .then((stored) => {
      const job = stored?.[LABEL_SCAN_JOB_KEY];
      if (job) shownJob = isActive(job) ? null : job.id;
      renderLabelJob(job);
    })
    .catch((err) => log.fail(`Cannot load label scan state — ${safeErrorMessage(err, 'Depot operation failed')}`));

  scanDriveBtn.addEventListener('click', async () => {
    const dryRun = dryRunToggle.checked;
    if (!dryRun && !window.confirm(
      'LIVE MODE: photos will be moved and parcel dates may change. Continue?',
    )) return;
    setDepotButtons(true);
    log.start(dryRun ? 'Dry run label scan — nothing will be moved or rescheduled' : 'Live label scan');
    try {
      // Ask for Google consent here: the background runner can only use a token silently.
      await getAuthToken();
      const response = await chrome.runtime.sendMessage({ type: 'label-scan-start', dryRun });
      if (!response?.jobId || response.reason) throw new Error(response?.reason ?? 'Label scan did not start');
      log.info(`Label scan ${response.jobId.slice(0, 8)} started — it keeps running if you close this window`);
    } catch (err) {
      setDepotStatus('error', safeErrorMessage(err, 'Label scan did not start'));
      setDepotButtons(false);
    }
  });
}
