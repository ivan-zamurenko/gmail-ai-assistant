/**
 * src/depot/depotScript.js
 * ========================
 * Injected into the depot tab via chrome.scripting.executeScript({ func, args }).
 * MUST be self-contained — no imports, no outer scope references.
 *
 * Modes:
 *   'cad'    — reads the pending list, processes only CAD-scanned parcels
 *   'labels' — receives consignment numbers from Drive label photos, looks them up
 *
 * @param {{ dryRun?: boolean, mode?: 'cad'|'labels', consNumbers?: string[] }} options
 * @returns {{ dryRun?, count?, changed?, skipped?, errors?, results?, warning?, __error? }}
 */
export async function depotMain({ dryRun = true, mode = 'cad', consNumbers = [] } = {}) {

  // ── Constants ──────────────────────────────────────────────────────────────────

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

  // Type codes used by lookupConsignmentList() on the depot page
  const CONS_LIST_TYPE = {
    P: 'Pending', PA: 'PendingAlert', IFU: 'IFUMisdirects', IFUA: 'IFUMisdirectsAlert',
    GH: 'GoodsHeld', GHA: 'GoodsHeldAlert', OFD: 'OFD', OFDA: 'OFDAlert',
    POD: 'POD', PODA: 'PODAlert', R: 'Returns', RA: 'ReturnsAlert',
    RS: 'Rescheduled', RSA: 'RescheduledAlert', T: 'Total', TA: 'TotalAlert',
    F: 'Future', NFU: 'NFUMisdirects', NFUA: 'NFUMisdirectsAlert',
  };

  // ── Date helpers ───────────────────────────────────────────────────────────────

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
      todayShort:    toDateKey(today),
      tomorrowInput: `${pad(next.getDate())}/${pad(next.getMonth() + 1)}/${next.getFullYear()}`,
    };
  }

  // ── Classify ───────────────────────────────────────────────────────────────────

  function buildNotesPattern(todayShort) {
    const escaped = todayShort.replace(/\//g, '\\/');
    return new RegExp(
      `Del\\.\\s*date\\s*changed\\s*FROM\\s*\\d{2}\\/\\d{2}\\/\\d{2}\\s*TO\\s*${escaped}`, 'i'
    );
  }

  function classify(status, notes, todayShort) {
    if (status === STATUS.PENDING || status === STATUS.DELIVERED || status === STATUS.OFD)
      return { action: 'CHANGE_DATE', reason: status };
    if (status === STATUS.GOODS_HELD) {
      return buildNotesPattern(todayShort).test(notes)
        ? { action: 'CHANGE_DATE', reason: 'GOODS HELD → Future Dated yesterday' }
        : { action: 'SKIP',        reason: 'GOODS HELD → Book In or manual GH scan' };
    }
    return { action: 'SKIP', reason: `Unknown status: "${status}"` };
  }

  // ── Fetch helpers ──────────────────────────────────────────────────────────────

  function getSessionParams() {
    const p = new URLSearchParams(window.location.search);
    return { session: p.get('session'), uid: p.get('UID') };
  }

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  // ── Pending list ───────────────────────────────────────────────────────────────

  // Builds the pending list URL from the trigger link's CL() arguments + session params.
  // The trigger href looks like: javascript:CL('24143736', 'P')
  // No window.open interception needed.
  function getPendingListUrl() {
    const trigger = document.querySelector('thead th:nth-child(2) a.normal');
    if (!trigger) throw new Error('Pending trigger link not found — are you on the correct depot page?');

    const m = (trigger.getAttribute('href') ?? '').match(/CL\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/);
    if (!m) throw new Error(`Unexpected trigger href: ${trigger.getAttribute('href')}`);

    const { session, uid } = getSessionParams();
    const typeName = CONS_LIST_TYPE[m[2]] ?? m[2];

    return `/scripts/cgiip.exe/WService=wsInterlink/woConsignmentList.p` +
      `?session=${encodeURIComponent(session)}&UID=${encodeURIComponent(uid)}` +
      `&RowNo=${encodeURIComponent(m[1])}&Type=${encodeURIComponent(typeName)}&DashName=Customer`;
  }

  function parseRows(doc) {
    return Array.from(doc.querySelectorAll('tbody tr')).flatMap(tr => {
      const tds  = tr.querySelectorAll('td');
      const link = tds[1]?.querySelector('a');
      if (!link) return [];
      const m = (link.getAttribute('href') ?? '').match(/chooseItem\('([^']+)'\s*,\s*'([^']+)'\)/);
      if (!m) return [];
      return [{ consNumber: link.textContent.trim(), consId: m[1], type: m[2],
                route: tds[5]?.textContent.trim().toLowerCase() ?? '' }];
    });
  }

  async function fetchPendingList() {
    return parseRows(await fetchDoc(getPendingListUrl()));
  }

  // ── Consignment detail ─────────────────────────────────────────────────────────

  async function fetchConsignment(consId, type = 'PopUp') {
    const { session, uid } = getSessionParams();
    return fetchDoc(
      `/scripts/cgiip.exe/WService=wsInterlink/woConsignmentDetails.p` +
      `?session=${encodeURIComponent(session)}&Mode=CS&UID=${encodeURIComponent(uid)}` +
      `&Type=${encodeURIComponent(type)}&ConsId=${encodeURIComponent(consId)}`
    );
  }

  async function getNotes(consDoc) {
    for (const s of consDoc.querySelectorAll('script')) {
      const m = s.textContent.match(/ConsignmentsNotes['"]\s*\)\s*\.load\s*\(\s*['"]([^'"]+)['"]/);
      if (!m) continue;
      try {
        const doc = await fetchDoc(new URL(m[1], window.location.href).href);
        return doc.body?.textContent?.trim() ?? '';
      } catch { return ''; }
    }
    return '';
  }

  // ── Actions ────────────────────────────────────────────────────────────────────

  async function logCall(consId, consDoc) {
    const btn = consDoc.getElementById('btnLogCall');
    if (!btn) return;

    const { session, uid } = getSessionParams();

    // Prefer form submission if available
    const form = btn.closest('form');
    if (form?.getAttribute('action')) {
      const body = new URLSearchParams({ session, ConsId: consId });
      for (const el of form.elements) {
        if (el.name && el.type === 'hidden') body.set(el.name, el.value);
      }
      await fetch(new URL(form.getAttribute('action'), window.location.href).href, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      return;
    }

    // Try onclick URL
    const om = (btn.getAttribute('onclick') ?? '').match(
      /(?:window\.open|location(?:\.href)?\s*=|location\.assign\s*\()\s*['"]([/\w][^'"]+)['"]/
    );
    if (om) {
      await fetch(new URL(om[1], window.location.href).href, { credentials: 'include' });
      return;
    }

    // Fallback: standard endpoint
    await fetch(
      `/scripts/cgiip.exe/WService=wsInterlink/woLogCall.p` +
      `?session=${encodeURIComponent(session)}&ConsId=${encodeURIComponent(consId)}&UID=${encodeURIComponent(uid)}`,
      { credentials: 'include' }
    ).catch(() => {});
  }

  async function submitReschedule(consId, tomorrowInput) {
    const { session } = getSessionParams();
    const formUrl = `/scripts/cgiip.exe/WService=wsInterlink/woRearrangeConsignment.p` +
      `?session=${encodeURIComponent(session)}&ConsId=${encodeURIComponent(consId)}`;

    const formDoc = await fetchDoc(formUrl);
    const form    = formDoc.querySelector('form');
    if (!form) throw new Error('Reschedule form not found');

    const body = new URLSearchParams();
    for (const el of form.elements) {
      if (el.name && el.type === 'hidden') body.append(el.name, el.value);
    }
    body.set('arranged-by', 'customer');
    body.set('arrange', '1');
    body.set('arranged-date', tomorrowInput);

    const res = await fetch(
      new URL(form.getAttribute('action') ?? formUrl, window.location.href).href,
      { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString() }
    );
    if (!res.ok) throw new Error(`Reschedule POST returned HTTP ${res.status}`);

    const resultDoc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const ok  = resultDoc.querySelector('.panel-success p, #panel-success p');
    if (ok) return ok.textContent.trim();
    const err = resultDoc.querySelector('.panel-danger p, #panel-error p, .alert p');
    throw new Error(err?.textContent.trim() ?? 'No success or error message in server response');
  }

  // ── Process loop ───────────────────────────────────────────────────────────────

  async function processPackages(packages, todayShort, tomorrowInput) {
    let changed = 0, skipped = 0, errors = 0;
    const results = [];

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
          console.log(`[${pkg.consNumber}] ⏭️  skipped`);
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

  // ── Entry point ────────────────────────────────────────────────────────────────

  try {
    console.log(`DPD Depot | mode=${mode} | ${dryRun ? 'DRY RUN' : 'LIVE'} | ${new Date().toLocaleTimeString()}`);

    const { todayShort, tomorrowInput } = getDates();
    const allRows = await fetchPendingList();
    const consSet = new Set(consNumbers);

    const packages = mode === 'cad'
      ? allRows.filter(r => r.route === 'cad')
      : allRows.filter(r => consSet.has(r.consNumber) || consSet.has(r.consId));

    if (packages.length === 0) {
      const warning = mode === 'cad'
        ? 'No CAD parcels found — are you on the correct depot page?'
        : `None of the scanned numbers found in the pending list: ${consNumbers.join(', ')}`;
      console.warn(`⚠️ ${warning}`);
      return { changed: 0, skipped: 0, errors: 0, warning };
    }

    if (dryRun) {
      console.table(packages.map(({ consNumber, consId }) => ({ consNumber, consId })));
      console.log(`DRY RUN — ${packages.length} parcel(s) would be processed.`);
      return { dryRun: true, count: packages.length };
    }

    const result = await processPackages(packages, todayShort, tomorrowInput);
    console.log(`Done | Changed: ${result.changed} | Skipped: ${result.skipped} | Errors: ${result.errors}`);
    return result;

  } catch (err) {
    console.error('[depotMain] fatal:', err);
    return { __error: err?.message ?? String(err) };
  }
}
