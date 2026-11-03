const STAGE_LABELS = {
  'depot-probe': 'Перевіряю з’єднання з depot',
  'depot-ready': 'Depot відповідає',
  'drive-auth': 'Перевіряю Google Drive',
  'drive-ready': 'Google Drive підключено',
  listing: 'Отримую список фотографій',
  done: 'Обробляю фотографії',
  reschedule: 'Переношу знайдені посилки',
};

const BAR_WIDTH = 12;

export function renderBarcodeProgress(progress, dryRun) {
  const current = Math.max(0, Number(progress.current) || 0);
  const total = Math.max(0, Number(progress.total) || 0);
  const percent = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const bar = `${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)}`;
  const count = total ? ` ${current}/${total} · ${percent}%` : '';
  const seconds = Math.max(0, Math.round((Number(progress.elapsedMs) || 0) / 1000));
  const stage = STAGE_LABELS[progress.stage] ?? 'Виконую задачу';

  return `⏳ Scan Drive Labels (${dryRun ? 'DRY RUN' : 'LIVE'})\n`
    + `\`[${bar}]${count}\`\n`
    + `${stage} · ${seconds} с`;
}

/** Limits Discord edits while always allowing the final photo and reschedule phase. */
export function shouldPublishBarcodeProgress(previous, next, now, intervalMs = 1_500) {
  if (!previous) return true;
  if (next.stage === 'reschedule') return true;
  if (next.total > 0 && next.current === next.total) return true;
  return now - previous.publishedAt >= intervalMs;
}
