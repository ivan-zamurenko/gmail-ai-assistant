// Paste the built dist/console/lookupConsole.js into the depot tab's console to
// try the real module by hand — no duplicated snippet to drift out of sync.
import { depotLookup } from './lookup.js';

const dash = (v) => v || '—';

function show(result) {
  if (!result.ok) {
    console.log(`%c✖ ${result.query}%c  ${result.reason}`, 'color:#e55;font-weight:bold', 'color:#999');
    return;
  }

  const scan = result.lastScan;
  const { address } = result;
  const place = [...address.lines, address.town, address.county, address.postCode]
    .filter(Boolean).join(', ');

  console.groupCollapsed(
    `%c${result.consNumber}%c  ${result.status}%c  ${scan.type} ${scan.date} ${scan.time}`,
    'font-weight:bold', 'color:#0a0;font-weight:bold', 'color:#888',
  );
  console.log(`last scan   ${scan.type} — ${scan.date} ${scan.time}  (depot ${dash(scan.depot)}, route ${dash(scan.route)})`);
  console.log(`signed by   ${dash(scan.signature)}${scan.notes ? `  ·  ${scan.notes}` : ''}`);
  console.log(`consignee   ${dash(address.contact)}${address.company ? `, ${address.company}` : ''}`);
  console.log(`address     ${dash(place)}`);
  console.log(`depot       ${dash(address.depot)}`);
  console.log(`arranged    ${dash(result.arrangedDate)}  ·  ${result.scanCount} scans  ·  searched as "${result.query}"`);
  console.groupEnd();
}

/** Accepts numbers as separate arguments so the console call stays short. */
window.lookup = async (...numbers) => {
  const results = await depotLookup(numbers.flat().map(String));
  results.forEach(show);
  return results;
};

console.log('Ready. Try:  await lookup("131787155", "633582029")');
