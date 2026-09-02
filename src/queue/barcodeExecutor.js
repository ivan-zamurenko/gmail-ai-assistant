/**
 * Executes `/reschedule barcodes` in the offscreen DOM context.
 * Drive image decoding stays here; authenticated depot access is delegated to
 * the background worker through two narrow ports.
 */

import { loadConfig } from '../config/config.js';
import { createLabelVerifier, DEPOT_PROBE } from '../depot/labelVerifier.js';
import {
  addRecoveryTargets,
  applyRecoveryResult,
} from '../depot/rescheduleRecovery.js';
import {
  COMMANDS, RESCHEDULE_MODE, STATUS, TASK_SCHEMA_VERSION,
} from './contract.js';

const MAX_DETAIL_LINES = 25;
const ACTION_ICON = { CHANGE_DATE: '✅', SKIP: '⏭️', ERROR: '❌' };

const done = (summary, details) => ({ status: STATUS.DONE, summary, details });
const error = (summary) => ({ status: STATUS.ERROR, summary });

function fatal(message) {
  return Object.assign(new Error(message), { fatal: true });
}

async function scanWithDriveAdapter(options) {
  const { processLabels } = await import('../depot/driveScanner.js');
  return processLabels(options);
}

function detailsFor(res) {
  const lines = res.dryRun
    ? (res.packages ?? []).map(pkg => `${String(pkg.consNumber).padEnd(11)} ${pkg.consId}`)
    : (res.results ?? []).map(item =>
      `${String(item.consNumber).padEnd(11)} ${ACTION_ICON[item.action] ?? '•'} ${item.action}`
      + (item.status ? ` (${item.status})` : ''));
  if (lines.length > MAX_DETAIL_LINES) {
    lines.length = MAX_DETAIL_LINES;
    lines.push(`… ще ${(res.dryRun ? res.packages : res.results).length - MAX_DETAIL_LINES}`);
  }
  return lines.length ? lines.join('\n') : undefined;
}

export async function executeBarcodeTask(task, ports = {}) {
  if (task?.schemaVersion !== TASK_SCHEMA_VERSION
      || task.command !== COMMANDS.RESCHEDULE
      || task.args?.mode !== RESCHEDULE_MODE.BARCODES) {
    return error('Некоректна barcode queue task');
  }

  const dryRun = task.args?.dryRun ?? true;
  if (typeof dryRun !== 'boolean') return error('Некоректне значення dryRun');
  const progress = (current, total, stage) => {
    try { ports.onProgress?.(current, total, stage); } catch { /* diagnostics must not stop work */ }
  };

  const config = (ports.loadConfig ?? loadConfig)();
  if (!config.driveFolderId) return error('Drive Folder ID не налаштований у розширенні');

  const lookup = ports.lookup;
  const reschedule = ports.reschedule;
  const tokenProvider = ports.getAuthToken;
  if (typeof lookup !== 'function'
      || typeof reschedule !== 'function'
      || typeof tokenProvider !== 'function') {
    return error('Barcode executor ports are unavailable');
  }

  const verifier = createLabelVerifier({
    lookup: async (number) => {
      const response = await lookup(number);
      if (response?.reason) throw fatal(response.reason);
      return response?.result;
    },
  });

  progress(0, 0, 'depot-probe');
  await verifier.verify(DEPOT_PROBE);
  progress(0, 0, 'depot-ready');

  progress(0, 0, 'drive-auth');
  const token = await tokenProvider();
  if (!token) return error('Google Drive не авторизований — відкрий розширення й увійди один раз');
  progress(0, 0, 'drive-ready');

  const scanLabels = ports.processLabels ?? scanWithDriveAdapter;
  let results;
  try {
    results = await scanLabels({
      folderInput: config.driveFolderId,
      token,
      verify: verifier.verify,
      dryRun,
      onProgress: progress,
    });
  } catch (err) {
    if (/Drive API (401|403)|HTTP (401|403)/.test(err.message)) {
      await ports.removeCachedAuthToken?.(token);
      return error('Google Drive authorization expired — open the extension and authorize Drive again');
    }
    throw err;
  }

  if (results.length === 0) return done('У папці Drive немає фотографій лейблів');

  const numbers = results.filter(item => item.number).map(item => item.number);
  const { targets, unresolved } = verifier.targetsFor(numbers);
  const photoErrors = results.filter(item => item.error).length;
  const recognized = results.filter(item => item.number).length;
  if (targets.length === 0) {
    return done(`Фото: ${results.length} | Розпізнано: ${recognized} | Exact targets: 0`);
  }

  const storage = ports.storage ?? chrome.storage.local;
  if (!dryRun) await addRecoveryTargets(storage, targets);

  progress(0, targets.length, 'reschedule');
  const response = await reschedule({ dryRun, targets });
  if (response?.reason || !response?.result) {
    return error(`${response?.reason ?? 'Depot не повернув результат'} | Для retry: ${targets.length}`);
  }

  const res = response.result;
  if (dryRun) {
    return done(
      `Dry run — Фото: ${results.length} | Розпізнано: ${recognized}`
      + ` | Reschedule: ${res.count ?? 0} | File errors: ${photoErrors}`,
      detailsFor(res),
    );
  }

  const remaining = await applyRecoveryResult(storage, res);
  return done(
    `Фото: ${results.length - photoErrors}/${results.length} | Змінено: ${res.changed}`
    + ` | Пропущено: ${res.skipped} | Помилки: ${res.errors}`
    + ` | Retry: ${remaining.length}`
    + (unresolved ? ` | Unresolved: ${unresolved}` : ''),
    detailsFor(res),
  );
}
