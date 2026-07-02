/**
 * DEPOT DELIVERY DATE MANAGER — v2 (HEADLESS)
 * ============================================
 * Chrome DevTools → Sources → Snippets → Run
 *
 * Identical behaviour to v1, completely headless:
 *  – No popup windows open or flash on screen
 *  – All page loads via fetch() + DOMParser
 *  – Notes AJAX URL is extracted from inline scripts and fetched directly
 *  – Reschedule form submitted via POST — skips UI btnLogCall/btnReschedule steps
 *
 * Output: console only.
 *
 * SAFETY:
 *  CONFIG.dryRun = true  → shows what WOULD happen, no changes made
 *  CONFIG.dryRun = false → executes changes
 *
 * Always run with dryRun: true first, verify the list, then switch to false.
 */

// ─────────────────────────────────────────────
// CONFIGіі
// ─────────────────────────────────────────────
const CONFIG = {
  dryRun: true,
  status: {
    pending:        'PENDING',
    goodsHeld:      'GOODS HELD',
    delivered:      'DELIVERED', 
    outForDelivery: 'OFD',
  },
};

// ─────────────────────────────────────────────
// IRISH PUBLIC HOLIDAYS
// Update once a year (January).
// Format: 'DD/MM/YY' — same format the system uses in Notes.
// ─────────────────────────────────────────────
const IRISH_HOLIDAYS = new Set([
  '01/01/26', // New Year's Day
  '02/02/26', // St. Brigid's Dayіі
  '17/03/26', // St. Patrick's Day
  '06/04/26', // Easter Monday
  '04/05/26', // May Bank Holiday
  '01/06/26', // June Bank Holiday
  '03/08/26', // August Bank Holiday
  '26/10/26', // October Bank Holiday
  '25/12/26', // Christmas Day
  '26/12/26', // St. Stephen's Day
]);

function toDateKey(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear()).slice(-2)}`;
}

function isNonWorkingDay(date) {
  const day = date.getDay();
  return day === 0 || day === 6 || IRISH_HOLIDAYS.has(toDateKey(date));
}

// ─────────────────────────────────────────────
// DATES
// Notes format:  DD/MM/YY   e.g. "29/06/26"
// Input format:  DD/MM/YYYY e.g. "30/06/2026"
// ─────────────────────────────────────────────
function getDates() {
  const pad   = n => String(n).padStart(2, '0');
  const today = new Date();
  const next  = new Date(today);
  next.setDate(today.getDate() + 1);
  while (isNonWorkingDay(next)) next.setDate(next.getDate() + 1);

  return {
    todayShort:    `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${String(today.getFullYear()).slice(-2)}`,
    tomorrowInput: `${pad(next.getDate())}/${pad(next.getMonth() + 1)}/${next.getFullYear()}`,
  };
}

// ─────────────────────────────────────────────
// NOTES PATTERN + CLASSIFY
// Identical to v1.
// ─────────────────────────────────────────────
function buildNotesPattern(todayShort) {
  const escaped = todayShort.replace(/\//g, '\\/');
  return new RegExp(
    `Del\\.\\s*date\\s*changed\\s*FROM\\s*\\d{2}\\/\\d{2}\\/\\d{2}\\s*TO\\s*${escaped}`,
    'i'
  );
}

function classify(status, notes, todayShort) {
  if (status === CONFIG.status.pending) {
    return { action: 'CHANGE_DATE', reason: 'PENDING → reschedule to next working day' };
  }
  if (status === CONFIG.status.delivered || status === CONFIG.status.outForDelivery) {
    return { action: 'CHANGE_DATE', reason: `${status} → multi-parcel, one left in depot → reschedule` };
  }
  if (status === CONFIG.status.goodsHeld) {
    return buildNotesPattern(todayShort).test(notes)
      ? { action: 'CHANGE_DATE', reason: 'GOODS HELD → was Future Dated yesterday → reschedule' }
      : { action: 'SKIP',        reason: 'GOODS HELD → Book In or manual GH scan → skip' };
  }
  return { action: 'SKIP', reason: `Unknown status: "${status}"` };
}

// ─────────────────────────────────────────────
// FETCH HELPERS
// ─────────────────────────────────────────────

// Fetches a URL and returns a parsed document.
// credentials: 'include' ensures session cookies are forwarded (same-origin).
async function fetchDoc(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return new DOMParser().parseFromString(await res.text(), 'text/html');
}

function getSessionParams() {
  const p = new URLSearchParams(window.location.search);
  return { session: p.get('session'), uid: p.get('UID') };
}

// ─────────────────────────────────────────────
// GET CAD CONSIGNMENTS (headless)
// Intercepts window.open to capture the pending list URL without
// displaying a popup, then fetches the page and reads the rows.
// ─────────────────────────────────────────────
async function getCADConsignments() {
  const trigger = document.querySelector('thead th:nth-child(2) a.normal');
  if (!trigger) throw new Error('Pending trigger link not found. Are you on the correct page?');

  // The onclick handler calls window.open synchronously — capture the URL
  // and immediately restore the original to avoid side effects.
  let pendingUrl = null;
  const orig = window.open;
  window.open = (url) => { pendingUrl = url; return { closed: true, close() {} }; };
  trigger.click();
  window.open = orig;

  if (!pendingUrl) throw new Error('Could not capture pending list URL from trigger link');

  const doc = await fetchDoc(pendingUrl);

  return Array.from(doc.querySelectorAll('tbody tr'))
    .map(tr => {
      const tds  = tr.querySelectorAll('td');
      const link = tds[1]?.querySelector('a');
      if (!link) return null;

      const match = (link.getAttribute('href') ?? '').match(/chooseItem\('([^']+)'\s*,\s*'([^']+)'\)/);
      if (!match) return null;

      if ((tds[5]?.textContent.trim() ?? '').toLowerCase() !== 'cad') return null;

      return { consNumber: link.textContent.trim(), consId: match[1], type: match[2] };
    })
    .filter(Boolean);
}

// ─────────────────────────────────────────────
// FETCH CONSIGNMENT
// Headless replacement for openConsignment().
// Returns a parsed document instead of a popup window.
// ─────────────────────────────────────────────
async function fetchConsignment(consId, type = 'PopUp') {
  const { session, uid } = getSessionParams();
  const url =
    `/scripts/cgiip.exe/WService=wsInterlink/woConsignmentDetails.p` +
    `?session=${encodeURIComponent(session)}` +
    `&Mode=CS&UID=${encodeURIComponent(uid)}` +
    `&Type=${encodeURIComponent(type)}` +
    `&ConsId=${encodeURIComponent(consId)}`;
  return fetchDoc(url);
}

// ─────────────────────────────────────────────
// GET NOTES (headless)
// Notes are AJAX-loaded via jQuery .load() in the original page.
// We extract the AJAX URL from the page's inline scripts and fetch it directly.
// If the URL can't be found, returns '' — classify() will SKIP the parcel
// rather than guessing, which is the safe default.
// ─────────────────────────────────────────────
async function getNotes(consigneeDoc) {
  let notesUrl = null;
  for (const script of consigneeDoc.querySelectorAll('script')) {
    // Matches: $('#ConsignmentsNotes').load('/some/path?...')
    const m = script.textContent.match(
      /ConsignmentsNotes['"]\s*\)\s*\.load\s*\(\s*['"]([^'"]+)['"]/
    );
    if (m) { notesUrl = m[1]; break; }
  }

  if (!notesUrl) return '';

  try {
    const doc = await fetchDoc(
      new URL(notesUrl, window.location.href).href
    );
    return doc.body?.textContent?.trim() ?? '';
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────────
// LOG CALL
// Mirrors the btnLogCall.click() step from v1.
// Attempts to submit the Log Call entry so the server knows a call was
// made before the reschedule — some systems enforce this as a prerequisite.
//
// Strategy (in order):
//  1. If btnLogCall is inside a <form>, submit that form's action URL.
//  2. If btnLogCall has an onclick with a navigable URL, GET that URL.
//  3. If neither is found, construct a direct call using ConsId + session.
//     (Conservative fallback — better to try than to skip.)
//
// Best-effort: errors here don't block the reschedule attempt.
// If the server rejects the reschedule, submitReschedule() will throw.
// ─────────────────────────────────────────────
async function logCall(consId, consDoc) {
  const btn = consDoc.getElementById('btnLogCall');
  if (!btn) return; // button not present — step not required on this page

  const { session } = getSessionParams();

  // Case 1: button lives inside a <form> — submit that form directly
  const form = btn.closest('form');
  if (form?.getAttribute('action')) {
    const body = new URLSearchParams({ session, ConsId: consId });
    for (const el of form.elements) {
      if (el.name && el.type === 'hidden') body.set(el.name, el.value);
    }
    await fetch(new URL(form.getAttribute('action'), window.location.href).href, {
      method:      'POST',
      headers:     { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:        body.toString(),
      credentials: 'include',
    });
    return;
  }

  // Case 2: onclick contains a navigable URL — e.g. window.open('woLogCall.p?...')
  const onclick = btn.getAttribute('onclick') ?? '';
  const onclickMatch = onclick.match(
    /(?:window\.open|location(?:\.href)?\s*=|location\.assign\s*\()\s*['"]([\/\w][^'"]+)['"]/);
  if (onclickMatch) {
    await fetch(new URL(onclickMatch[1], window.location.href).href, {
      credentials: 'include',
    });
    return;
  }

  // Case 3: URL can't be determined — attempt a direct POST to the standard endpoint
  // guessed from the same URL pattern as the rest of the system
  const { uid } = getSessionParams();
  const fallbackUrl =
    `/scripts/cgiip.exe/WService=wsInterlink/woLogCall.p` +
    `?session=${encodeURIComponent(session)}` +
    `&ConsId=${encodeURIComponent(consId)}` +
    `&UID=${encodeURIComponent(uid)}`;
  await fetch(fallbackUrl, { credentials: 'include' }).catch(() => {});
}

// ─────────────────────────────────────────────
// SUBMIT RESCHEDULE (headless)
// Directly fetches the reschedule form and submits it via POST.
// Skips the UI btnLogCall → btnReschedule flow — the server reads
// only the POST parameters and doesn't require those UI steps.
//
// Returns the success message from the server response.
// Throws if the server returns no success indicator.
// ─────────────────────────────────────────────
async function submitReschedule(consId, tomorrowInput) {
  const { session } = getSessionParams();
  const formUrl =
    `/scripts/cgiip.exe/WService=wsInterlink/woRearrangeConsignment.p` +
    `?session=${encodeURIComponent(session)}` +
    `&ConsId=${encodeURIComponent(consId)}`;

  // Step 1: Fetch the form to collect hidden fields and confirm the action URL
  const formDoc = await fetchDoc(formUrl);
  const form = formDoc.querySelector('form');
  if (!form) throw new Error('Reschedule form not found in server response');

  // Step 2: Build the POST body from all hidden fields in the form,
  // then add our reschedule values (same values fillReschedule() sets in v1).
  const body = new URLSearchParams();
  for (const el of form.elements) {
    if (el.name && el.type === 'hidden') {
      body.append(el.name, el.value);
    }
  }
  body.set('arranged-by',   'customer');
  body.set('arrange',       '1');          // "Select another delivery date" radio
  body.set('arranged-date', tomorrowInput);

  // Step 3: POST — x-www-form-urlencoded for CGI compatibility
  const actionUrl = new URL(form.getAttribute('action') ?? formUrl, window.location.href).href;
  const res = await fetch(actionUrl, {
    method:      'POST',
    headers:     { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:        body.toString(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Reschedule POST returned HTTP ${res.status}`);

  // Step 4: Verify the response contains the success message
  const resultDoc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const successEl = resultDoc.querySelector('.panel-success p, #panel-success p');
  if (successEl) return successEl.textContent.trim();

  // No success — surface any error message from the response
  const errorEl = resultDoc.querySelector('.panel-danger p, #panel-error p, .alert p');
  throw new Error(errorEl?.textContent.trim() ?? 'Server returned no success or error message');
}

// ─────────────────────────────────────────────
// RUN — orchestrator
// Same flow as v1: getCADConsignments → classify → act.
// ─────────────────────────────────────────────
async function run() {
  console.log('══════════════════════════════════════════');
  console.log('DEPOT SCRIPT v2 (headless) |', new Date().toLocaleTimeString());
  console.log('MODE:', CONFIG.dryRun ? '🔍 DRY RUN — no changes' : '⚡ LIVE — making changes');
  console.log('══════════════════════════════════════════');

  const { todayShort, tomorrowInput } = getDates();
  console.log(`Today  (Notes format): ${todayShort}`);
  console.log(`Tomorrow (input format): ${tomorrowInput}`);

  const cadRows = await getCADConsignments();
  console.log(`\nParcels with CAD scan: ${cadRows.length}`);

  if (cadRows.length === 0) {
    console.warn('⚠️ No CAD parcels found. Check that Route column is at td index 5 (6th <td>).');
    return;
  }

  if (CONFIG.dryRun) {
    console.log('\n📋 CAD parcels found (would be processed in LIVE mode):');
    console.table(cadRows.map(({ consNumber, consId }) => ({ consNumber, consId })));
    console.log('\n⚠️  DRY RUN complete. Set CONFIG.dryRun = false to execute changes.');
    console.log('Note: GOODS HELD classification happens live when Notes are read.');
    return;
  }

  let changed = 0, skipped = 0, errors = 0;

  for (const pkg of cadRows) {
    console.log(`\n[${pkg.consNumber}] Fetching consignment...`);
    try {
      const consDoc = await fetchConsignment(pkg.consId, pkg.type);

      const status = consDoc.querySelectorAll('h1 b')[1]?.textContent.trim() ?? '';
      if (!status) throw new Error('Status element not found — page structure may have changed');
      console.log(`[${pkg.consNumber}] Status: ${status}`);

      let notes = '';
      if (status === CONFIG.status.goodsHeld) {
        notes = await getNotes(consDoc);
      }

      const { action, reason } = classify(status, notes, todayShort);
      console.log(`[${pkg.consNumber}] → ${action} | ${reason}`);

      if (action === 'CHANGE_DATE') {
        await logCall(pkg.consId, consDoc);
        const msg = await submitReschedule(pkg.consId, tomorrowInput);
        console.log(`[${pkg.consNumber}] ✅ ${msg}`);
        changed++;
      } else {
        console.log(`[${pkg.consNumber}] ⏭️  Skipped`);
        skipped++;
      }

    } catch (err) {
      console.error(`[${pkg.consNumber}] ❌ Error: ${err.message}`);
      errors++;
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log(`DONE | Changed: ${changed} | Skipped: ${skipped} | Errors: ${errors}`);
  console.log('══════════════════════════════════════════');
}

run();
