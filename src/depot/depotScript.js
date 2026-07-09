/**
 * src/depot/depotScript.js
 * ========================
 * Injected into the depot tab via chrome.scripting.executeScript({ func, args }).
 * MUST be self-contained — no imports, no outer scope references.
 *
 * Modes:
 *   'cad'    — reads the pending list, processes only CAD-scanned parcels (original flow)
 *   'labels' — receives consignment numbers extracted from Drive label photos,
 *              looks them up in the pending list, then processes them
 *
 * @param {{ dryRun?: boolean, mode?: 'cad'|'labels', consNumbers?: string[] }} options
 */
export async function depotMain({ dryRun = true, mode = 'cad', consNumbers = [] } = {}) {
  try {
    return await _depotMainImpl({ dryRun, mode, consNumbers });
  } catch (err) {
    console.error('[depotMain] fatal:', err);
    return { __error: err?.message ?? String(err) };
  }
}

async function _depotMainImpl({ dryRun, mode, consNumbers }) {

  // ── Constants ─────────────────────────────────────────────────────────────────

  const STATUS = {
    PENDING:    'PENDING',
    GOODS_HELD: 'GOODS HELD',
    DELIVERED:  'DELIVERED',
    OFD:        'OFD',
  };

  // Update every January. Format: 'DD/MM/YY'
  const IRISH_HOLIDAYS = new Set([
    '01/01/26', '02/02/26', '17/03/26', '06/04/26', '04/05/26',
    '01/06/26', '03/08/26', '26/10/26', '25/12/26', '26/12/26',
  ]);

  // ── Date helpers ──────────────────────────────────────────────────────────────

  const pad = n => String(n).padStart(2, '0');

  function toDateKey(d) {
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
  }

  function isNonWorkingDay(d) {
    return d.getDay() === 0 || d.getDay() === 6 || IRISH_HOLIDAYS.has(toDateKey(d));
  }

  function getDates() {
    const today = new Date();
    const next  = new Date(today);
    next.setDate(today.getDate() + 1);
    while (isNonWorkingDay(next)) next.setDate(next.getDate() + 1);
    return {
      todayShort:    `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${String(today.getFullYear()).slice(-2)}`,
      tomorrowInput: `${pad(next.getDate())}/${pad(next.getMonth() + 1)}/${next.getFullYear()}`,
    };
  }

  // ── Classify ──────────────────────────────────────────────────────────────────

  function buildNotesPattern(todayShort) {
    const e = todayShort.replace(/\//g, '\\/');
    return new RegExp(
      `Del\\.\\s*date\\s*changed\\s*FROM\\s*\\d{2}\\/\\d{2}\\/\\d{2}\\s*TO\\s*${e}`, 'i'
    );
  }

  function classify(status, notes, todayShort) {
    if (status === STATUS.PENDING)
      return { action: 'CHANGE_DATE', reason: 'PENDING' };
    if (status === STATUS.DELIVERED || status === STATUS.OFD)
      return { action: 'CHANGE_DATE', reason: `${status} → multi-parcel, one left in depot` };
    if (status === STATUS.GOODS_HELD) {
      return buildNotesPattern(todayShort).test(notes)
        ? { action: 'CHANGE_DATE', reason: 'GOODS HELD → Future Dated yesterday' }
        : { action: 'SKIP',        reason: 'GOODS HELD → Book In or manual GH scan' };
    }
    return { action: 'SKIP', reason: `Unknown status: "${status}"` };
  }

  // ── Fetch helpers ─────────────────────────────────────────────────────────────

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  function getSessionParams() {
    const p = new URLSearchParams(window.location.search);
    return { session: p.get('session'), uid: p.get('UID') };
  }

  // ── Pending list ──────────────────────────────────────────────────────────────

  // Captures the pending list URL from the trigger link's onclick attribute.
  // Reading the attribute string avoids any MAIN-world execution and works
  // in ISOLATED world regardless of the page's Content Security Policy.
  function getPendingListUrl() {
    const trigger = document.querySelector('thead th:nth-child(2) a.normal');
    if (!trigger) throw new Error('Pending trigger link not found. Are you on the correct depot page?');

    // Most depot systems set onclick as an HTML attribute: onclick="window.open('url')"
    const onclick = trigger.getAttribute('onclick') ?? '';
    const match   = onclick.match(/window\.open\(\s*['"]([^'"]+)['"]/)
                 ?? onclick.match(/open\(\s*['"]([^'"]+)['"]/);
    if (match) return match[1];

    // Fallback: plain href (some depot versions use <a href> directly)
    const href = trigger.getAttribute('href');
    if (href && href !== '#' && !href.startsWith('javascript')) return href;

    throw new Error('Could not read pending list URL. The trigger link has no readable onclick or href.');
  }

  // Parses all rows from the pending list into { consNumber, consId, type, route }.
  function parseRows(doc) {
    return Array.from(doc.querySelectorAll('tbody tr')).map(tr => {
      const tds  = tr.querySelectorAll('td');
      const link = tds[1]?.querySelector('a');
      if (!link) return null;
      const m = (link.getAttribute('href') ?? '').match(/chooseItem\('([^']+)'\s*,\s*'([^']+)'\)/);
      if (!m) return null;
      return {
        consNumber: link.textContent.trim(),
        consId:     m[1],
        type:       m[2],
        route:      tds[5]?.textContent.trim().toLowerCase() ?? '',
      };
    }).filter(Boolean);
  }

  async function getCADConsignments() {
    const doc = await fetchDoc(getPendingListUrl());
    return parseRows(doc).filter(r => r.route === 'cad');
  }

  // For label mode: finds parcels in the pending list matching our scanned numbers.
  // Checks both consNumber and consId since the label may show either.
  async function findByNumbers(numbers) {
    const doc = await fetchDoc(getPendingListUrl());
    const set = new Set(numbers);
    return parseRows(doc).filter(r => set.has(r.consNumber) || set.has(r.consId));
  }

  // ── Consignment detail ────────────────────────────────────────────────────────

  async function fetchConsignment(consId, type = 'PopUp') {
    const { session, uid } = getSessionParams();
    return fetchDoc(
      `/scripts/cgiip.exe/WService=wsInterlink/woConsignmentDetails.p` +
      `?session=${encodeURIComponent(session)}&Mode=CS&UID=${encodeURIComponent(uid)}` +
      `&Type=${encodeURIComponent(type)}&ConsId=${encodeURIComponent(consId)}`
    );
  }

  async function getNotes(consDoc) {
    let notesUrl = null;
    for (const s of consDoc.querySelectorAll('script')) {
      const m = s.textContent.match(/ConsignmentsNotes['"]\s*\)\s*\.load\s*\(\s*['"]([^'"]+)['"]/);
      if (m) { notesUrl = m[1]; break; }
    }
    if (!notesUrl) return '';
    try {
      const doc = await fetchDoc(new URL(notesUrl, window.location.href).href);
      return doc.body?.textContent?.trim() ?? '';
    } catch { return ''; }
  }

  // ── Actions ───────────────────────────────────────────────────────────────────

  async function logCall(consId, consDoc) {
    const btn = consDoc.getElementById('btnLogCall');
    if (!btn) return;
    const { session, uid } = getSessionParams();

    const form = btn.closest('form');
    if (form?.getAttribute('action')) {
      const body = new URLSearchParams({ session, ConsId: consId });
      for (const el of form.elements) {
        if (el.name && el.type === 'hidden') body.set(el.name, el.value);
      }
      await fetch(new URL(form.getAttribute('action'), window.location.href).href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        credentials: 'include',
      });
      return;
    }

    const onclick = btn.getAttribute('onclick') ?? '';
    const om = onclick.match(
      /(?:window\.open|location(?:\.href)?\s*=|location\.assign\s*\()\s*['"]([\/\w][^'"]+)['"]/
    );
    if (om) {
      await fetch(new URL(om[1], window.location.href).href, { credentials: 'include' });
      return;
    }

    // Fallback: direct POST to the standard endpoint
    await fetch(
      `/scripts/cgiip.exe/WService=wsInterlink/woLogCall.p` +
      `?session=${encodeURIComponent(session)}&ConsId=${encodeURIComponent(consId)}&UID=${encodeURIComponent(uid)}`,
      { credentials: 'include' }
    ).catch(() => {});
  }

  async function submitReschedule(consId, tomorrowInput) {
    const { session } = getSessionParams();
    const formUrl =
      `/scripts/cgiip.exe/WService=wsInterlink/woRearrangeConsignment.p` +
      `?session=${encodeURIComponent(session)}&ConsId=${encodeURIComponent(consId)}`;

    const formDoc = await fetchDoc(formUrl);
    const form    = formDoc.querySelector('form');
    if (!form) throw new Error('Reschedule form not found in server response');

    const body = new URLSearchParams();
    for (const el of form.elements) {
      if (el.name && el.type === 'hidden') body.append(el.name, el.value);
    }
    body.set('arranged-by',   'customer');
    body.set('arrange',       '1');
    body.set('arranged-date', tomorrowInput);

    const res = await fetch(
      new URL(form.getAttribute('action') ?? formUrl, window.location.href).href,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        credentials: 'include',
      }
    );
    if (!res.ok) throw new Error(`Reschedule POST returned HTTP ${res.status}`);

    const resultDoc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const ok  = resultDoc.querySelector('.panel-success p, #panel-success p');
    if (ok) return ok.textContent.trim();
    const err = resultDoc.querySelector('.panel-danger p, #panel-error p, .alert p');
    throw new Error(err?.textContent.trim() ?? 'No success or error message in server response');
  }

  // ── Process loop ──────────────────────────────────────────────────────────────

  async function processPackages(packages, todayShort, tomorrowInput) {
    let changed = 0, skipped = 0, errors = 0;
    const results = []; // per-parcel outcome — used by organizeLabels() to route photos

    for (const pkg of packages) {
      try {
        const consDoc = await fetchConsignment(pkg.consId, pkg.type);
        const status  = consDoc.querySelectorAll('h1 b')[1]?.textContent.trim() ?? '';
        if (!status) throw new Error('Status not found — depot page structure may have changed');

        const notes = status === STATUS.GOODS_HELD ? await getNotes(consDoc) : '';
        const { action, reason } = classify(status, notes, todayShort);
        console.log(`[${pkg.consNumber}] ${status} → ${action} | ${reason}`);

        if (action === 'CHANGE_DATE') {
          await logCall(pkg.consId, consDoc);
          const msg = await submitReschedule(pkg.consId, tomorrowInput);
          console.log(`[${pkg.consNumber}] ✅ ${msg}`);
          changed++;
        } else {
          console.log(`[${pkg.consNumber}] ⏭️  Skipped`);
          skipped++;
        }

        results.push({ consNumber: pkg.consNumber, consId: pkg.consId, status, action });
      } catch (err) {
        console.error(`[${pkg.consNumber}] ❌ ${err.message}`);
        errors++;
        results.push({ consNumber: pkg.consNumber, consId: pkg.consId, status: 'ERROR', action: 'ERROR' });
      }
    }

    return { changed, skipped, errors, results };
  }

  // ── Entry point ───────────────────────────────────────────────────────────────

  console.log(`DPD Depot | mode=${mode} | ${dryRun ? 'DRY RUN' : 'LIVE'} | ${new Date().toLocaleTimeString()}`);

  const { todayShort, tomorrowInput } = getDates();

  const packages = mode === 'cad'
    ? await getCADConsignments()
    : await findByNumbers(consNumbers);

  if (packages.length === 0) {
    const warning = mode === 'cad'
      ? 'No CAD parcels found. Are you on the correct depot page?'
      : `None of the scanned numbers found in the pending list: ${consNumbers.join(', ')}`;
    console.warn(`⚠️ ${warning}`);
    return { changed: 0, skipped: 0, errors: 0, warning };
  }

  if (dryRun) {
    console.table(packages.map(({ consNumber, consId }) => ({ consNumber, consId })));
    console.log(`DRY RUN — ${packages.length} parcel(s) would be processed. No changes made.`);
    return { dryRun: true, count: packages.length };
  }

  const result = await processPackages(packages, todayShort, tomorrowInput);
  console.log(`Done | Changed: ${result.changed} | Skipped: ${result.skipped} | Errors: ${result.errors}`);
  return result;
}
