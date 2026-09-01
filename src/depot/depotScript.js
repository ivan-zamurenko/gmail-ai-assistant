/**
 * src/depot/depotScript.js
 * ========================
 * Injected into the depot tab via chrome.scripting.executeScript({ func, args }).
 * MUST be self-contained — no imports, no outer scope references.
 *
 * Modes:
 *   'cad'    — reads the pending list, processes only CAD-scanned parcels
 *   'labels' — receives exact targets resolved from Drive label photos
 *   'manual' — receives one exact target and an operator-selected date
 *
 * @param {{ dryRun?: boolean, mode?: 'cad'|'labels'|'manual', date?: string,
 *           targets?: Array<{consNumber, consId, type}> }} options
 * @returns {{ dryRun?, count?, changed?, skipped?, errors?, results?, warning?, __error? }}
 */
export async function depotMain({ dryRun = true, mode = 'cad', date = '', targets = [] } = {}) {

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

  function manualDateInput(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
    if (!match) throw new Error('Manual date must use YYYY-MM-DD');

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    const selected = new Date(year, month - 1, day);
    if (selected.getFullYear() !== year || selected.getMonth() !== month - 1 || selected.getDate() !== day) {
      throw new Error('Manual date is not a valid calendar date');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selected <= today || isNonWorkingDay(selected)) {
      throw new Error('Manual date must be a future working day');
    }
    return `${dayText}/${monthText}/${yearText}`;
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
    if (!res.ok) throw new Error(`Depot page returned HTTP ${res.status}`);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  // ── Pending list ───────────────────────────────────────────────────────────────

  // Builds the pending list URL from the trigger link's CL() arguments + session params.
  // The trigger href looks like: javascript:CL('24143736', 'P')
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

  // The Route column has moved between depot releases, so trust the header over a fixed index.
  function findRouteIndex(doc) {
    const headers = Array.from(doc.querySelectorAll('thead th, thead td'));
    const idx = headers.findIndex(h => /route/i.test(h.textContent ?? ''));
    if (idx === -1) {
      console.warn(`[pending list] no "Route" header found, falling back to column 6. Headers: ${headers.map(h => h.textContent.trim()).join(' | ')}`);
      return 5;
    }
    return idx;
  }

  function parseRows(doc) {
    const routeIdx = findRouteIndex(doc);
    return Array.from(doc.querySelectorAll('tbody tr')).flatMap(tr => {
      const tds  = tr.querySelectorAll('td');
      const link = tds[1]?.querySelector('a');
      if (!link) return [];
      const m = (link.getAttribute('href') ?? '').match(/chooseItem\('([^']+)'\s*,\s*'([^']+)'\)/);
      if (!m) return [];
      return [{ consNumber: link.textContent.trim(), consId: m[1], type: m[2],
                route: tds[routeIdx]?.textContent.trim().toLowerCase() ?? '' }];
    });
  }

  async function fetchPendingList() {
    const rows = parseRows(await fetchDoc(getPendingListUrl()));
    console.log(`[pending list] ${rows.length} row(s) parsed`);
    return rows;
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
    // Fully best-effort — a logCall failure must never block the reschedule.
    try {
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
      );
    } catch (e) {
      console.warn(`[logCall] non-fatal: ${e.message}`);
    }
  }

  async function submitReschedule(consId, tomorrowInput) {
    const { session } = getSessionParams();
    const formUrl = `/scripts/cgiip.exe/WService=wsInterlink/woRearrangeConsignment.p` +
      `?session=${encodeURIComponent(session)}&ConsId=${encodeURIComponent(consId)}`;

    const formDoc = await fetchDoc(formUrl);
    const form    = formDoc.querySelector('form');
    if (!form) {
      const preview = formDoc.body?.textContent?.trim().slice(0, 200) ?? '(empty)';
      throw new Error(`Reschedule form not found. Page says: ${preview}`);
    }

    const actionUrl = new URL(form.getAttribute('action') ?? formUrl, window.location.href).href;


    // Echo every field back exactly as the server filled it — a field we omit
    // may be stored empty, and the date is the only thing we may change.
    const body = new URLSearchParams();
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'submit' || el.type === 'button' || el.type === 'reset') continue;
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) continue;
      body.append(el.name, el.value);
    }
    // Overrides mirror a real Save recorded from the depot UI: the hidden
    // `action` field carries the verb, and the page leaves arranged-cancel out
    // unless you pick "Cancel delivery".
    body.set('action', 'Save');
    body.set('arranged-by', 'customer');
    body.set('arrange', '1');
    body.set('arranged-date', tomorrowInput);
    body.set('btnSave', 'Save');
    body.delete('arranged-cancel');

    const res = await fetch(actionUrl, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`Reschedule POST returned HTTP ${res.status}`);

    const responseText = await res.text();
    const resultDoc = new DOMParser().parseFromString(responseText, 'text/html');

    const errEl = resultDoc.querySelector('.panel-danger p, #panel-error p, .alert-danger p, .alert-danger, .error p');
    const errMsg = errEl?.textContent.trim();
    if (errMsg) throw new Error(`Server error: ${errMsg}`);

    const ok = resultDoc.querySelector('.panel-success p, #panel-success p, .alert-success p, .success p');
    if (ok) return ok.textContent.trim();

    // The depot answers with the form again, so the date it now holds is the
    // honest confirmation — this system may have no success banner at all.
    const savedDate = resultDoc.querySelector('[name="arranged-date"]')?.getAttribute('value');
    if (savedDate === tomorrowInput) return `arranged-date is now ${savedDate}`;

    // Neither success nor error found — show what the page actually says.
    // Scripts must go first, or the jQuery boilerplate fills the whole preview.
    resultDoc.querySelectorAll('script, style').forEach(el => el.remove());
    const visibleText = (resultDoc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
    console.warn(`[reschedule] arranged-date came back as "${savedDate}", asked for "${tomorrowInput}"`);
    console.warn(`[reschedule] unconfirmed response text length: ${visibleText.length}`);
    throw new Error(`Reschedule: server did not confirm. See console for details.`);
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

    if (!['cad', 'labels', 'manual'].includes(mode)) throw new Error(`Unsupported depot mode: ${mode}`);
    const { todayShort, tomorrowInput } = getDates();
    const arrangedDate = mode === 'manual' ? manualDateInput(date) : tomorrowInput;
    const allRows = mode === 'cad' ? await fetchPendingList() : [];
    const exactTargets = Array.isArray(targets) ? targets : [];
    const packages = mode === 'cad'
      ? allRows.filter(r => r.route === 'cad')
      : Array.from(new Map(exactTargets.flatMap((target) => {
        const consNumber = String(target?.consNumber ?? '').trim();
        const consId = String(target?.consId ?? '').trim();
        if (!/^\d{9}$/.test(consNumber) || !/^\d+$/.test(consId)) return [];
        return [[consId, { consNumber, consId, type: 'PopUp' }]];
      })).values());

    if (packages.length === 0) {
      let warning;
      if (mode === 'manual') {
        warning = 'No exact verified parcel target was supplied.';
      } else if (mode === 'labels') {
        warning = 'No exact verified label targets were supplied.';
      } else if (allRows.length === 0) {
        warning = 'Pending list came back empty — the list page did not load or its layout changed.';
      } else if (mode === 'cad') {
        const routes = [...new Set(allRows.map(r => r.route))].filter(Boolean);
        warning = `No CAD parcels among ${allRows.length} pending. Routes seen: ${routes.join(', ') || '(all blank)'}`;
      }
      console.warn(`⚠️ ${warning}`);
      return { changed: 0, skipped: 0, errors: 0, warning };
    }

    if (dryRun) {
      console.table(packages.map(({ consNumber, consId }) => ({ consNumber, consId })));
      console.log(`DRY RUN — ${packages.length} parcel(s) would be processed.`);
      return {
        dryRun: true,
        count:  packages.length,
        packages: packages.map(({ consNumber, consId }) => ({ consNumber, consId })),
        ...(mode === 'manual' && { date: arrangedDate }),
      };
    }

    const result = await processPackages(packages, todayShort, arrangedDate);
    console.log(`Done | Changed: ${result.changed} | Skipped: ${result.skipped} | Errors: ${result.errors}`);
    return result;

  } catch (err) {
    console.error('[depotMain] fatal:', err);
    return { __error: err?.message ?? String(err) };
  }
}
