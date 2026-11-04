import { safeErrorMessage } from '../utils/errors.js';

const REASONS = new Set([
  'Confirmed delivery-date change to today', 'No confirmed delivery-date change to today',
  'Unsupported consignment status; manual review required', 'Scan history missing; manual review required',
  'Scan identity or timestamp invalid; manual review required', 'Conflicting latest scans; manual review required',
  'Unknown latest scan; manual review required', 'CAD today; parcel remains in depot',
  'NearRoute today; parcel remains in depot',
  'Cancelled OFD; parcel never returned to depot', 'No eligible physical parcel in depot',
  'Scan history unavailable or malformed', 'Consignment identity mismatch; manual review required',
  'Eligibility changed before save; manual review required',
  'Reschedule outcome uncertain; check the depot before retrying',
  'Another reschedule is already running in this tab',
]);
const safeReason = reason => REASONS.has(reason) ? reason : safeErrorMessage(new Error(reason), 'Depot operation failed');

/** Final mirror in the extension context; live phases remain in depot MAIN Console. */
export function logRescheduleResult(result, logger = console) {
  if (!result || result.__error) {
    logger.error(`[DPD reschedule] FATAL | ${safeReason(result?.__error)}`);
    return;
  }
  const rows = result.results ?? [];
  logger.log(`[DPD reschedule] RESULT | ${result.dryRun ? 'DRY RUN' : 'LIVE'} | ${rows.length} consignment(s)`);
  rows.forEach((row, i) => {
    const action = row.action === 'CHANGE_DATE' ? (result.dryRun ? 'WOULD_CHANGE' : 'SAVED')
      : ['SKIP', 'ERROR', 'REVIEW'].includes(row.action) ? row.action : 'REVIEW';
    const number = /^\d{8,9}$|^\d{14}$/.test(String(row.consNumber ?? '')) ? String(row.consNumber) : 'невідомий con_id';
    const label = { SAVED: '✅ Перенесено', WOULD_CHANGE: '🔎 Буде перенесено', SKIP: '⏭️ Пропущено',
      ERROR: '❌ Помилка', REVIEW: '⚠️ Потрібна перевірка' }[action];
    const line = `[DPD reschedule] [${i + 1}/${rows.length}] ${number} → ${label} (${action}) | ${safeReason(row.reason)}`;
    (action === 'ERROR' ? logger.error : logger.log).call(logger, line);
  });
}
