/**
 * src/depot/depotScript.js
 * ========================
 * Injected into the depot tab via chrome.scripting.executeScript({ func, args }).
 * MUST be self-contained — no imports, no outer scope references.
 *
 * Modes:
 *   'cad'    — reads the current pending list and checks parcel-history eligibility
 *   'labels' — receives exact targets resolved from Drive label photos
 *   'manual' — receives one exact target and an operator-selected date
 *
 * @param {{ dryRun?: boolean, mode?: 'cad'|'labels'|'manual', date?: string,
 *           targets?: Array<{consNumber, consId, type}> }} options
 * @returns {{ dryRun?, count?, changed?, skipped?, errors?, results?, warning?, __error? }}
 */
export async function depotMain({ dryRun = true, mode = 'cad', date = '', targets = [], calendar } = {}) {

  function safeFailure(error, fallback = 'Depot operation failed') {
    const known = new Set([
      "Scan history unavailable or malformed",
      "Consignment identity mismatch; manual review required",
      "Eligibility changed before save; manual review required",
      "Calendar plan missing or invalid; refresh the operation",
      "Calendar plan expired at Irish midnight; refresh the operation",
      "Manual date must use YYYY-MM-DD",
      "Manual date is not a valid calendar date",
      "Manual date must be a future working day",
      "Refusing a cross-origin depot request",
      "Pending trigger link not found — are you on the correct depot page?",
      "Unexpected trigger href",
      "Reschedule form not found",
      "Reschedule rejected by server",
      "Reschedule: server did not confirm. See console for details.",
      "Status not found — depot page structure may have changed",
      "Not the correct depot page (unexpected origin)",
      "Unsupported depot mode"
    ]);
    const raw = typeof error?.message === 'string' ? error.message : '';
    if (known.has(raw)) return raw;
    const status = raw.match(/(?:HTTP|Drive API|Drive) ([1-5]\d{2})\b/)?.[1];
    const codes = new Set(['permission-denied', 'unauthenticated', 'unavailable', 'deadline-exceeded', 'resource-exhausted', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']);
    const candidate = error?.code ?? raw.match(/\[([a-zA-Z-]+)\]$/)?.[1];
    const code = codes.has(candidate) ? ` [${candidate}]` : '';
    return `${fallback}${status ? ` (HTTP ${status})` : ''}${code}`;
  }

  // ── Constants ──────────────────────────────────────────────────────────────────

  const STATUS = {
    PENDING:    'PENDING',
    GOODS_HELD: 'GOODS HELD',
    DELIVERED:  'DELIVERED',
    OFD:        'OFD',
  };

  // Type codes used by lookupConsignmentList() on the depot page
  const CONS_LIST_TYPE = {
    P: 'Pending', PA: 'PendingAlert', IFU: 'IFUMisdirects', IFUA: 'IFUMisdirectsAlert',
    GH: 'GoodsHeld', GHA: 'GoodsHeldAlert', OFD: 'OFD', OFDA: 'OFDAlert',
    POD: 'POD', PODA: 'PODAlert', R: 'Returns', RA: 'ReturnsAlert',
    RS: 'Rescheduled', RSA: 'RescheduledAlert', T: 'Total', TA: 'TotalAlert',
    F: 'Future', NFU: 'NFUMisdirects', NFUA: 'NFUMisdirectsAlert',
  };



  // ── Date helpers ───────────────────────────────────────────────────────────────

  // Calendar policy is computed once in the trusted extension caller. MAIN
  // receives a plain snapshot, never code/closures. Recheck its day before IO
  // and each mutation; crossing Irish midnight requires a fresh operator run.
  const plan = calendar && { ...calendar };
  function assertCalendarPlan() {
    const validDate = value => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!plan || plan.version !== 'IE-BPFI-2026-2027-v1' || plan.timeZone !== 'Europe/Dublin'
        || !validDate(plan.today) || !validDate(plan.targetDate) || plan.targetDate <= plan.today
        || !['2026', '2027'].includes(plan.today.slice(0, 4))
        || !['2026', '2027'].includes(plan.targetDate.slice(0, 4))
        || (mode === 'manual' && date !== plan.targetDate)) {
      throw new Error('Calendar plan missing or invalid; refresh the operation');
    }
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const part = type => parts.find(p => p.type === type).value;
    if (`${part('year')}-${part('month')}-${part('day')}` !== plan.today) {
      throw new Error('Calendar plan expired at Irish midnight; refresh the operation');
    }
  }

  // ── Classify ───────────────────────────────────────────────────────────────────

  const normalize = value => String(value ?? '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  const decision = (action, reason) => ({ action, reason });

  function civilDate(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4}|\d{2})$/.exec(value);
    if (!match) return null;
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1])));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[1])) return null;
    return date.toISOString().slice(0, 10);
  }

  // Pure policy: the physical-parcel evidence permits one whole-series change.
  // Unknown latest events are not evidence that a parcel is still in the depot.
  function classify(status, notes, scans, today) {
    if (status === STATUS.GOODS_HELD) {
      const confirmed = notes.some(note => {
        const match = /^del\.\s*date\s+changed\s+from\s+(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))\s+to\s+(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))\s*$/i.exec(note.trim());
        return match && civilDate(match[1]) && civilDate(match[2]) === today;
      });
      return confirmed ? decision('CHANGE_DATE', 'Confirmed delivery-date change to today')
        : decision('SKIP', 'No confirmed delivery-date change to today');
    }
    if (![STATUS.PENDING, STATUS.OFD, STATUS.DELIVERED].includes(status)) {
      return decision('REVIEW', 'Unsupported consignment status; manual review required');
    }
    if (!scans.length) return decision('REVIEW', 'Scan history missing; manual review required');
    const parcels = new Map();
    for (const scan of scans) {
      const day = civilDate(scan.date);
      const time = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(scan.time);
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(scan.date) || !day || day > today
          || !time || Number(time[1]) > 23 || Number(time[2]) > 59 || Number(time[3] ?? 0) > 59 || !scan.type) {
        return decision('REVIEW', 'Scan identity or timestamp invalid; manual review required');
      }
      // The depot records consignment creation as Order received / Par #0.
      // It is not a physical parcel or movement evidence. Other zero/unknown
      // identities still require review; never discard an unbound return/delivery.
      if (scan.parcel === '0' && normalize(scan.type) === 'order received') continue;
      if (!/^[1-9]\d{0,5}$/.test(scan.parcel)) {
        return decision('REVIEW', 'Scan identity or timestamp invalid; manual review required');
      }
      const stamp = `${day}T${time[1]}:${time[2]}:${time[3] ?? '00'}`;
      const entries = parcels.get(scan.parcel) ?? [];
      entries.push({ ...scan, day, stamp, type: normalize(scan.type) });
      parcels.set(scan.parcel, entries);
    }
    let allowed = null;
    for (const entries of parcels.values()) {
      const lastStamp = entries.reduce((latest, entry) => entry.stamp > latest ? entry.stamp : latest, '');
      const latest = entries.filter(entry => entry.stamp === lastStamp);
      if (new Set(latest.map(entry => entry.type)).size !== 1) {
        return decision('REVIEW', 'Conflicting latest scans; manual review required');
      }
      const last = latest[0];
      if (!['cad', 'cad scan', 'cancelled out for delivery', 'out for delivery', 'delivered',
        'return to depot', 'returned to depot', 'goods held', 'pending', 'carded',
        'failed delivery', 'incorrect address'].includes(last.type)) {
        return decision('REVIEW', 'Unknown latest scan; manual review required');
      }
      if (['cad', 'cad scan'].includes(last.type) && last.day === today) {
        allowed = decision('CHANGE_DATE', 'CAD today; parcel remains in depot');
      } else if (status === STATUS.PENDING && last.type === 'cancelled out for delivery'
          && !entries.some(entry => ['return to depot', 'returned to depot'].includes(entry.type))) {
        allowed ??= decision('CHANGE_DATE', 'Cancelled OFD; parcel never returned to depot');
      }
    }
    return allowed ?? decision('SKIP', 'No eligible physical parcel in depot');
  }

  // ── Origin guard ───────────────────────────────────────────────────────────────

  // This runs in the page MAIN world. The tab can navigate after the extension
  // checked its URL, so confirm where we actually are (same rule as
  // depotTarget.js) and never send session-bearing requests to another origin.
  function isDepotPage() {
    const here = new URL(window.location.href);
    return here.protocol === 'http:'
      && here.hostname.toLowerCase().endsWith('.interlink.local')
      && here.hostname.length > '.interlink.local'.length
      && here.href.startsWith(`${here.origin}/`); // no user:pass@ in the URL
  }

  function sameOrigin(raw) {
    const here = new URL(window.location.href);
    const url = new URL(raw, here.href);
    if (url.origin !== here.origin) throw new Error('Refusing a cross-origin depot request');
    return url.href;
  }

  // ── Fetch helpers ──────────────────────────────────────────────────────────────

  function getSessionParams() {
    const p = new URLSearchParams(window.location.search);
    return { session: p.get('session'), uid: p.get('UID') };
  }

  async function fetchDoc(url) {
    const res = await fetch(sameOrigin(url), { credentials: 'include' });
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
    if (!m) throw new Error('Unexpected trigger href');

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
      console.warn('[pending list] ROUTE_HEADER_MISSING: falling back to column 6');
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
    for (const script of consDoc.querySelectorAll('script')) {
      const match = script.textContent.match(/ConsignmentsNotes['"]\s*\)\s*\.load\s*\(\s*['"]([^'"]+)['"]/);
      if (!match) continue;
      const doc = await fetchDoc(match[1]);
      // Match complete note cells, not a substring in arbitrary/negated prose.
      const cells = Array.from(doc.querySelectorAll('td')).map(cell => cell.textContent?.trim() ?? '');
      return cells.length ? cells : [doc.body?.textContent?.trim() ?? ''];
    }
    return [];
  }

  async function readEligibility(pkg) {
    const consDoc = await fetchConsignment(pkg.consId, pkg.type);
    // The zero prefix is the existing explicit marker for a legacy 8-digit
    // number. No suffix/approximate match may join another series' scan history.
    const expectedNumber = pkg.consNumber.replace(/^0(?=\d{8}$)/, '');
    const actualNumber = consDoc.getElementById('hiddenConsBarcodeValue')?.value ?? '';
    let actualId = consDoc.getElementById('hiddenConsIdValue')?.value
      || consDoc.querySelector('input[name="ConsId" i]')?.value;
    if (!actualId) {
      const ids = new Set();
      for (const element of consDoc.querySelectorAll('[href*="ConsId="], [action*="ConsId="]')) {
        const raw = element.getAttribute('href') || element.getAttribute('action') || '';
        const id = new URLSearchParams(raw.split('?')[1] ?? '').get('ConsId');
        if (id) ids.add(id);
      }
      if (ids.size === 1) actualId = [...ids][0];
    }
    if (actualNumber !== expectedNumber || actualId !== pkg.consId) {
      throw new Error('Consignment identity mismatch; manual review required');
    }
    const status = normalize(consDoc.querySelectorAll('h1 b')[1]?.textContent).toUpperCase();
    if (!status) throw new Error('Status not found — depot page structure may have changed');
    let notes = [], scans = [];
    if (status === STATUS.GOODS_HELD) notes = await getNotes(consDoc);
    else if ([STATUS.PENDING, STATUS.OFD, STATUS.DELIVERED].includes(status)) {
      const { session, uid } = getSessionParams();
      const doc = await fetchDoc(`/scripts/cgiip.exe/WService=wsInterlink/woScanningHistoryList.p`
        + `?session=${encodeURIComponent(session)}&form=theForm&ConsBarcode=${encodeURIComponent(actualNumber)}&UID=${encodeURIComponent(uid)}`);
      if (!doc.getElementById('MAINTABLE')) throw new Error('Scan history unavailable or malformed');
      const rows = Array.from(doc.querySelectorAll('#MAINTABLE tbody tr'));
      if (rows.length > 1000) throw new Error('Scan history unavailable or malformed');
      scans = rows.map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 12) throw new Error('Scan history unavailable or malformed');
        const text = cell => cell.textContent?.trim() ?? '';
        const [date = '', time = '', ...extra] = text(cells[4]).split(/\s+/);
        if (extra.length) throw new Error('Scan history unavailable or malformed');
        return { parcel: text(cells[7]), type: cells[3].getAttribute('title')?.trim() || text(cells[3]), date, time };
      });
    }
    return { status, ...classify(status, notes, scans, plan.today) };
  }

  // ── Actions ────────────────────────────────────────────────────────────────────

  async function submitReschedule(consId, tomorrowInput, recheck, progress) {
    const { session } = getSessionParams();
    const formUrl = `/scripts/cgiip.exe/WService=wsInterlink/woRearrangeConsignment.p` +
      `?session=${encodeURIComponent(session)}&ConsId=${encodeURIComponent(consId)}`;

    progress('FORM', 'Loading date form');
    const formDoc = await fetchDoc(formUrl);
    const form    = formDoc.querySelector('form');
    if (!form) {
      throw new Error('Reschedule form not found');
    }

    const actionUrl = sameOrigin(form.getAttribute('action') ?? formUrl);


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

    assertCalendarPlan();
    progress('RECHECK', 'Checking fresh identity and eligibility before Save');
    await recheck();
    assertCalendarPlan();
    progress('SAVE', 'POST date form; waiting for server confirmation');
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
    if (errMsg) throw new Error('Reschedule rejected by server');

    const ok = resultDoc.querySelector('.panel-success p, #panel-success p, .alert-success p, .success p');
    if (ok) return ok.textContent.trim();

    // The depot answers with the form again, so the date it now holds is the
    // honest confirmation — this system may have no success banner at all.
    const savedDate = resultDoc.querySelector('[name="arranged-date"]')?.getAttribute('value');
    if (savedDate === tomorrowInput) return `arranged-date is now ${savedDate}`;

    throw new Error(`Reschedule: server did not confirm. See console for details.`);
  }

  // ── Process loop ───────────────────────────────────────────────────────────────

  async function processPackages(packages, arrangedDate) {
    let changed = 0, skipped = 0, errors = 0, eligible = 0;
    const results = [];
    for (const [index, pkg] of packages.entries()) {
      // Owner-approved public con_id on outcomes only. Internal ConsId, raw status,
      // Notes, session URL and form/server bodies stay out of diagnostics.
      const prefix = `[DPD reschedule] [${index + 1}/${packages.length}]`;
      const number = /^\d{8,9}$|^\d{14}$/.test(String(pkg.consNumber ?? '')) ? String(pkg.consNumber) : 'невідомий con_id';
      const outcome = label => `${number} → ${label}`;
      const progress = (phase, message) => {
        const label = { SAVED: '✅ Перенесено', WOULD_CHANGE: '🔎 Буде перенесено', SKIPPED: '⏭️ Пропущено' }[phase];
        console.log(`${prefix} ${phase} | ${label ? `${outcome(label)} | ` : ''}${message}`);
      };
      try {
        progress('CHECK', 'Reading current status and parcel evidence');
        const initial = await readEligibility(pkg);
        const { status, reason } = initial;
        const action = initial.action === 'REVIEW' ? 'ERROR' : initial.action;
        if (action === 'CHANGE_DATE') {
          if (!dryRun) {
            assertCalendarPlan();
            await submitReschedule(pkg.consId, arrangedDate, async () => {
              const fresh = await readEligibility(pkg);
              if (fresh.action !== 'CHANGE_DATE') throw new Error('Eligibility changed before save; manual review required');
            }, progress);
            changed++;
            progress('SAVED', 'Date change confirmed by server');
          } else {
            progress('WOULD_CHANGE', reason);
          }
          eligible++;
        } else if (action === 'ERROR') {
          errors++;
          console.warn(`${prefix} REVIEW | ${outcome('⚠️ Потрібна перевірка')} | ${reason}`);
        } else {
          skipped++;
          progress('SKIPPED', reason);
        }
        results.push({ consNumber: pkg.consNumber, consId: pkg.consId, status, action, reason });
      } catch (err) {
        console.error(`${prefix} ERROR | ${outcome('❌ Помилка')} | ${safeFailure(err, 'Reschedule failed')}`);
        errors++;
        results.push({ consNumber: pkg.consNumber, consId: pkg.consId, status: 'ERROR', action: 'ERROR', reason: safeFailure(err, 'Reschedule failed') });
      }
    }
    return { changed, skipped, errors, results, ...(dryRun && { eligible }) };
  }

  // ── Entry point ────────────────────────────────────────────────────────────────

  try {

    if (!isDepotPage()) throw new Error('Not the correct depot page (unexpected origin)');
    if (!['cad', 'labels', 'manual'].includes(mode)) throw new Error('Unsupported depot mode');
    console.log(`[DPD reschedule] START | mode=${mode} | ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    assertCalendarPlan();
    const arrangedDate = plan.targetDate.split('-').reverse().join('/');
    console.log(`[DPD reschedule] TARGET_DATE | ${arrangedDate} | Europe/Dublin`);
    const allRows = mode === 'cad' ? await fetchPendingList() : [];
    const exactTargets = Array.isArray(targets) ? targets : [];
    const packages = mode === 'cad'
      ? Array.from(new Map(allRows.filter(row => /^\d{9}$/.test(row.consNumber) && /^\d+$/.test(row.consId)).map(row => [row.consId, row])).values())
      : Array.from(new Map(exactTargets.flatMap((target) => {
        const consNumber = String(target?.consNumber ?? '').trim();
        const consId = String(target?.consId ?? '').trim();
        if (!/^\d{9}$/.test(consNumber) || !/^\d+$/.test(consId)) return [];
        return [[consId, { consNumber, consId, type: 'PopUp' }]];
      })).values());

    console.log(`[DPD reschedule] TARGETS | ${packages.length} consignment(s)`);
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
        warning = `No exact consignment targets among ${allRows.length} pending. Routes seen: ${routes.join(', ') || '(all blank)'}`;
      }
      console.warn('[DPD reschedule] NO_TARGETS | Nothing to process');
      console.log('[DPD reschedule] DONE | Checked: 0 | Changed: 0 | Skipped: 0 | Errors: 0');
      return { changed: 0, skipped: 0, errors: 0, warning };
    }

    const result = await processPackages(packages, arrangedDate);
    console.log(`[DPD reschedule] DONE | Checked: ${packages.length} | `
      + (dryRun ? `Eligible: ${result.eligible} | ` : '')
      + `Changed: ${result.changed} | Skipped: ${result.skipped} | Errors: ${result.errors}`);
    if (dryRun) {
      return {
        ...result,
        dryRun: true,
        count:  packages.length,
        packages: packages.map(({ consNumber, consId }) => ({ consNumber, consId })),
        date: arrangedDate,
        calendarVersion: plan.version,
        calendarTimeZone: plan.timeZone,
      };
    }

    return result;

  } catch (err) {
    console.error('[DPD reschedule] FATAL |', safeFailure(err));
    return { __error: safeFailure(err) };
  }
}
