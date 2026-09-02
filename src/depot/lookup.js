/**
 * depot/lookup.js
 * ===============
 * Looks up a consignment by any number found in a customer email.
 *
 * Runs inside the depot tab via executeScript, so everything lives in one
 * self-contained function — the injected copy has no imports.
 *
 * The detail page shows only the *arranged* date, which stays untouched after a
 * parcel is carded and sent back. The scan history is the honest source.
 */

export async function depotLookup(numbers, { identityOnly = false } = {}) {
  const SCAN_URL = '/scripts/cgiip.exe/WService=wsInterlink/woScanningHistoryList.p';
  const CONS_URL = '/scripts/cgiip.exe/WService=wsInterlink/woConsignmentDetails.p';

  const text  = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const toDoc = (html) => new DOMParser().parseFromString(html, 'text/html');

  function sessionParams() {
    const p = new URLSearchParams(window.location.search);
    return { session: p.get('session') ?? '', uid: p.get('UID') ?? '' };
  }

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Depot page returned HTTP ${res.status}`);
    return toDoc(await res.text());
  }

  // ── Finding the consignment ──────────────────────────────────────────────────

  function depotQuery(input) {
    const raw = String(input ?? '').trim();
    // A leading zero is an explicit operator marker for a legacy eight-digit
    // number. Bare eight-digit input stays rejected so a typo cannot broaden
    // Quick Search to several consignments.
    if (/^\d{8}$/.test(raw)) {
      return { raw, error: '8-digit numbers require a leading zero marker' };
    }
    return { raw, query: /^0\d{8}$/.test(raw) ? raw.slice(1) : raw };
  }

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

  /** Search results link straight to the detail page — unlike the CAD list, which uses chooseItem(). */
  function parseHitList(doc) {
    const hits = new Map();
    for (const a of doc.querySelectorAll('#MAINTABLE a[href*="woConsignmentDetails.p"]')) {
      const consId = new URLSearchParams(a.getAttribute('href').split('?')[1]).get('ConsId');
      if (consId && !hits.has(consId)) hits.set(consId, { consId, consNumber: text(a) });
    }
    return Array.from(hits.values());
  }

  /** Detail responses expose ConsId differently across depot page variants. */
  function consIdFromDetail(doc) {
    const hidden = doc.getElementById('hiddenConsIdValue')?.value
      || doc.querySelector('input[name="ConsId" i]')?.value;
    if (hidden) return hidden;

    for (const el of doc.querySelectorAll('[href*="ConsId="], [action*="ConsId="]')) {
      const raw = el.getAttribute('href') || el.getAttribute('action') || '';
      const query = raw.split('?')[1];
      const consId = query ? new URLSearchParams(query).get('ConsId') : '';
      if (consId) return consId;
    }
    return '';
  }

  function fetchConsignment(consId) {
    const { session, uid } = sessionParams();
    return fetchDoc(`${CONS_URL}?session=${encodeURIComponent(session)}&Mode=CS` +
      `&UID=${encodeURIComponent(uid)}&Type=PopUp&ConsId=${encodeURIComponent(consId)}`);
  }

  // ── Reading the detail page ──────────────────────────────────────────────────

  /** Rows render as `<label>Name</label> value`, so the value is a bare text node. */
  function readBlock(doc, legendText) {
    const legend = Array.from(doc.querySelectorAll('legend'))
      .find((l) => text(l) === legendText);
    if (!legend) return [];

    return Array.from(legend.parentElement.querySelectorAll('.form-row')).map((row) => {
      const clone = row.cloneNode(true);
      clone.querySelectorAll('label, div, input').forEach((el) => el.remove());
      return { label: text(row.querySelector('label')), value: text(clone) };
    });
  }

  const pick = (rows, label) => rows.find((r) => r.label === label)?.value ?? '';

  /** Depot versions use slightly different labels for phone and email fields. */
  const pickMatching = (rows, pattern) => rows.find((r) => pattern.test(r.label))?.value ?? '';

  /** The second address line sits in its own row under an empty label. */
  function addressLines(rows) {
    const start = rows.findIndex((r) => r.label === 'Address');
    if (start === -1) return [];

    const lines = [rows[start].value];
    for (let i = start + 1; i < rows.length && !rows[i].label; i++) lines.push(rows[i].value);
    return lines.filter(Boolean);
  }

  // ── Reading the scan history ─────────────────────────────────────────────────

  function scanUrl(consNumber) {
    const { session, uid } = sessionParams();
    return `${SCAN_URL}?session=${encodeURIComponent(session)}&form=theForm` +
      `&ConsBarcode=${encodeURIComponent(consNumber)}&UID=${encodeURIComponent(uid)}`;
  }

  /** Operational values hidden in the scan tooltip, e.g. Bay: 32, Sequence: 5. */
  function scanNoteField(notes, label) {
    const match = new RegExp(`(?:^|[,|]\\s*)${label}:\\s*([^,|]+)`, 'i').exec(notes);
    return match?.[1]?.trim() ?? '';
  }

  function parseScans(doc) {
    return Array.from(doc.querySelectorAll('#MAINTABLE tbody tr')).flatMap((tr) => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 12) return [];

      const [date = '', time = ''] = text(tds[4]).split(' ');
      const notes = tds[10].getAttribute('title')?.trim() || text(tds[10]);
      return [{
        route:  text(tds[1]),
        depot:  text(tds[2]),
        // CSS clips the visible text, the title attribute carries the full wording.
        type:      tds[3].getAttribute('title')?.trim() || text(tds[3]),
        // One consignment can hold several parcels; each scan names which one.
        parcel:    text(tds[7]),
        date,
        time,
        notes,
        bay:        scanNoteField(notes, 'Bay'),
        sequence:   scanNoteField(notes, 'Sequence'),
        // The onward barcode carries a /N parcel suffix; keep only the barcode.
        onwardBc:   scanNoteField(notes, 'Onward BC').split('/')[0],
        signature: text(tds[11]),
        coords:    coordsFromRow(tr),
      }];
    });
  }

  /** The Map column links to OpenStreetMap with the scan's GPS in the query. */
  function coordsFromRow(tr) {
    const link = tr.querySelector('a[href*="openstreetmap.org"]');
    if (!link) return null;
    const p   = new URLSearchParams(link.getAttribute('href').split('?')[1] ?? '');
    const lat = Number(p.get('mlat'));
    const lng = Number(p.get('mlon'));
    return Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null;
  }

  /** Dates are DD/MM/YYYY, so sorting them as strings would put 10/08 before 07/08. */
  function stamp({ date, time }) {
    const [d, m, y] = date.split('/');
    return new Date(`${y}-${m}-${d}T${time || '00:00:00'}`).getTime();
  }

  const latest = (scans) => scans.reduce((a, b) => (stamp(b) >= stamp(a) ? b : a));

  // ── One consignment ──────────────────────────────────────────────────────────

  async function lookupOne(input) {
    const normalized = depotQuery(input);
    if (normalized.error) {
      return { query: normalized.raw, ok: false, reason: normalized.error };
    }
    const query = normalized.query;
    const t0 = Date.now();
    const searched = await quickSearch(query);
    const t1 = Date.now();
    let detail = searched;
    let consId = consIdFromDetail(searched);
    const directNumber = searched.getElementById('hiddenConsBarcodeValue')?.value ?? '';

    if (identityOnly && directNumber) {
      if (directNumber !== query) return { query, ok: false, reason: '0 matches' };
      if (!/^\d+$/.test(consId)) {
        return { query, ok: false, reason: 'Exact result missing ConsId' };
      }
      return { query, ok: true, consNumber: directNumber, consId };
    }

    if (!directNumber) {
      const hits = parseHitList(searched);
      if (identityOnly) {
        const exactHits = hits.filter(hit => hit.consNumber === query && /^\d+$/.test(hit.consId));
        if (exactHits.length !== 1) {
          return { query, ok: false, reason: `${exactHits.length} matches` };
        }
        return { query, ok: true, ...exactHits[0] };
      }
      // Quick search matches substrings, so two hits mean we cannot tell which
      // parcel the customer meant — that is a case for a human, not a template.
      if (hits.length !== 1) return { query, ok: false, reason: `${hits.length} matches` };
      consId = hits[0].consId;
      detail = await fetchConsignment(hits[0].consId);
    }
    if (!consId) consId = consIdFromDetail(detail);
    const t2 = Date.now();

    const consNumber = directNumber || detail.getElementById('hiddenConsBarcodeValue')?.value || '';
    const delivery   = readBlock(detail, 'Delivery Address');
    const confirm    = readBlock(detail, 'Confirmation / Notification / Delivery Details');
    const contact    = [...delivery, ...confirm];

    const scans = parseScans(await fetchDoc(scanUrl(consNumber)));
    const t3 = Date.now();
    // The parcel exists even with no scans, so callers that only need identity
    // (label renaming) still get the number back.
    if (!scans.length) return { query, ok: false, reason: 'no scans', consNumber, consId };

    // Only field scans (delivery, carding, failed attempt) carry GPS; the most
    // recent of those is where the parcel physically ended up.
    const located = scans.filter((s) => s.coords);
    const drop    = located.length ? latest(located) : null;

    return {
      query,
      ok:           true,
      consNumber,
      consId,
      status:       text(detail.querySelectorAll('h1 b')[1]),
      arrangedDate: pick(confirm, 'Arranged Delivery Date'),
      lastScan:     latest(scans),
      scanCount:    scans.length,
      scans,
      timing:       { search: t1 - t0, detail: t2 - t1, scans: t3 - t2 },
      drop:         drop && { ...drop.coords, type: drop.type, date: drop.date, time: drop.time },
      address: {
        contact:  pick(delivery, 'Contact'),
        company:  pick(delivery, 'Company Name'),
        lines:    addressLines(delivery),
        town:     pick(delivery, 'Town'),
        county:   pick(delivery, 'County'),
        postCode: pick(delivery, 'Post Code'),
        depot:    pick(delivery, 'Delivery Depot'),
        // Prefer a real mobile; fall back to a landline only when none is listed.
        mobile:   pickMatching(contact, /mobile/i) || pickMatching(contact, /telephone|phone/i),
        email:    pickMatching(contact, /e-?mail/i),
      },
    };
  }

  const results = [];
  for (const query of numbers) {
    // One failure must not cost us the rest of the batch.
    try {
      results.push(await lookupOne(query));
    } catch (err) {
      results.push({ query, ok: false, reason: err.message });
    }
  }
  return results;
}
