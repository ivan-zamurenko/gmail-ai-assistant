/**
 * depot/futureDateCheck.js
 * ========================
 * STUB for the "reschedule from a barcode list" flow.
 *
 * Given a list of barcodes it finds each parcel, reads its scan status and
 * decides — with the exact CAD-scan rules — whether it *would* be moved to the
 * next working day. It does NOT reschedule anything yet: this only reports the
 * verdict so the classification can be checked against reality first.
 *
 * Self-contained (no imports) so it can be injected via executeScript, matching
 * lookup.js and depotScript.js.
 *
 * @param {string[]} barcodes
 * @returns {Promise<Array<{ query, ok, consNumber, consId, status, futureDate: 'yes'|'no', reason }>>}
 */
export async function futureDateCheck(barcodes) {
  const CONS_URL = '/scripts/cgiip.exe/WService=wsInterlink/woConsignmentDetails.p';
  const SCAN_URL = '/scripts/cgiip.exe/WService=wsInterlink/woScanningHistoryList.p';

  const STATUS = { PENDING: 'PENDING', GOODS_HELD: 'GOODS HELD', DELIVERED: 'DELIVERED', OFD: 'OFD' };

  const text  = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const toDoc = (html) => new DOMParser().parseFromString(html, 'text/html');

  const pad = (n) => String(n).padStart(2, '0');
  const todayShort = () => {
    const d = new Date();
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
  };

  function sessionParams() {
    const p = new URLSearchParams(window.location.search);
    return { session: p.get('session') ?? '', uid: p.get('UID') ?? '' };
  }

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return toDoc(await res.text());
  }

  // ── Finding the consignment (same route as lookup.js) ────────────────────────

  async function quickSearch(number) {
    const form = document.getElementById('ConQSearchForm');
    if (!form) throw new Error('Quick search form not found — is this a depot page?');

    const res = await fetch(form.action, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:        new URLSearchParams({ 'con-quick-search': number }).toString(),
    });
    if (!res.ok) throw new Error(`Quick search HTTP ${res.status}`);
    return toDoc(await res.text());
  }

  function parseHitList(doc) {
    const hits = new Map();
    for (const a of doc.querySelectorAll('#MAINTABLE a[href*="woConsignmentDetails.p"]')) {
      const consId = new URLSearchParams(a.getAttribute('href').split('?')[1]).get('ConsId');
      if (consId && !hits.has(consId)) hits.set(consId, { consId, consNumber: text(a) });
    }
    return Array.from(hits.values());
  }

  function fetchConsignment(consId) {
    const { session, uid } = sessionParams();
    return fetchDoc(`${CONS_URL}?session=${encodeURIComponent(session)}&Mode=CS` +
      `&UID=${encodeURIComponent(uid)}&Type=PopUp&ConsId=${encodeURIComponent(consId)}`);
  }

  // ── Notes (needed to tell a re-carded GOODS HELD apart) ──────────────────────

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

  // ── Scan history (ViewScanning) ──────────────────────────────────────────────

  function scanUrl(consNumber) {
    const { session, uid } = sessionParams();
    return `${SCAN_URL}?session=${encodeURIComponent(session)}&form=theForm` +
      `&ConsBarcode=${encodeURIComponent(consNumber)}&UID=${encodeURIComponent(uid)}`;
  }

  // CSS clips the visible cell, so the title attribute carries the full wording.
  function scanTypes(doc) {
    return Array.from(doc.querySelectorAll('#MAINTABLE tbody tr')).flatMap((tr) => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 12) return [];
      return [tds[3].getAttribute('title')?.trim() || text(tds[3])];
    });
  }

  const isCanceledOfd = (type) => {
    const t = type.toLowerCase();
    return /cancel/.test(t) && t.includes('ofd');
  };

  async function hasCanceledOfdScan(consNumber) {
    try {
      return scanTypes(await fetchDoc(scanUrl(consNumber))).some(isCanceledOfd);
    } catch { return false; }
  }

  // ── Classify (identical rules to the CAD scan flow) ──────────────────────────

  function buildNotesPattern(today) {
    const escaped = today.replace(/\//g, '\\/');
    return new RegExp(
      `Del\\.\\s*date\\s*changed\\s*FROM\\s*\\d{2}\\/\\d{2}\\/\\d{2}\\s*TO\\s*${escaped}`, 'i'
    );
  }

  function classify(status, notes, canceledOfd, today) {
    if (status === STATUS.PENDING || status === STATUS.DELIVERED || status === STATUS.OFD)
      return { futureDate: 'yes', reason: status };
    if (status === STATUS.GOODS_HELD) {
      if (buildNotesPattern(today).test(notes))
        return { futureDate: 'yes', reason: 'GOODS HELD → Future Dated yesterday' };
      // A cancelled OFD leaves the parcel back in the depot: safe to re-date when
      // the notes are otherwise clear (nothing was booked in by hand).
      if (canceledOfd && !notes.trim())
        return { futureDate: 'yes', reason: 'GOODS HELD → Canceled OFD, notes clear' };
      return { futureDate: 'no', reason: 'GOODS HELD → Book In or manual GH scan' };
    }
    return { futureDate: 'no', reason: `Unknown status: "${status}"` };
  }

  // ── One barcode ──────────────────────────────────────────────────────────────

  async function checkOne(query) {
    const searched = await quickSearch(query);

    let detail = searched;
    let consId = '';

    if (!searched.getElementById('hiddenConsBarcodeValue')) {
      const hits = parseHitList(searched);
      // A substring match with two hits is a human decision, not a rule.
      if (hits.length !== 1)
        return { query, ok: false, consNumber: query, consId: '', status: '', futureDate: 'no', reason: `${hits.length} matches` };
      consId = hits[0].consId;
      detail = await fetchConsignment(consId);
    }

    const consNumber = detail.getElementById('hiddenConsBarcodeValue')?.value ?? query;
    const status     = text(detail.querySelectorAll('h1 b')[1]);
    if (!status)
      return { query, ok: false, consNumber, consId, status: '', futureDate: 'no', reason: 'Status not found' };

    // Notes and the scan history only change the verdict for GOODS HELD, so we
    // skip both extra requests for every other status.
    const notes       = status === STATUS.GOODS_HELD ? await getNotes(detail) : '';
    const canceledOfd = status === STATUS.GOODS_HELD ? await hasCanceledOfdScan(consNumber) : false;
    const { futureDate, reason } = classify(status, notes, canceledOfd, todayShort());

    return { query, ok: true, consNumber, consId, status, futureDate, reason };
  }

  const results = [];
  for (const query of barcodes) {
    // One failure must not cost us the rest of the batch.
    try {
      results.push(await checkOne(String(query)));
    } catch (err) {
      results.push({ query, ok: false, consNumber: String(query), consId: '', status: '', futureDate: 'no', reason: err.message });
    }
  }
  return results;
}
