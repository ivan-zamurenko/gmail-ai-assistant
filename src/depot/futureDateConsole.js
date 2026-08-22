// Paste the built dist/console/futureDateConsole.js into the depot tab's console
// to dry-run the barcode-list reschedule check by hand — no snippet to drift.
import { futureDateCheck } from './futureDateCheck.js';

function show(r) {
  const yes = r.futureDate === 'yes';
  const mark = yes ? '✅' : '⛔';
  console.log(
    `%c${mark} ${r.consNumber}%c  FutureDate: %c${r.futureDate.toUpperCase()}%c  ·  ${r.reason}`,
    'font-weight:bold',
    'color:#888',
    yes ? 'color:#0a0;font-weight:bold' : 'color:#e55;font-weight:bold',
    'color:#888',
  );
}

/** Accepts barcodes as separate arguments so the console call stays short. */
window.futureDate = async (...barcodes) => {
  const results = await futureDateCheck(barcodes.flat().map(String));
  results.forEach(show);
  console.table(results.map(({ consNumber, consId, status, futureDate, reason }) =>
    ({ conID: consNumber, consId, status, futureDate, reason })));
  return results;
};

console.log('Ready. Try:  await futureDate("131787155", "633582029")');
