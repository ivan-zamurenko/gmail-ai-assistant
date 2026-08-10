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

export async function depotLookup(numbers) {
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
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return toDoc(await res.text());
  }

  // ── Finding the consignment ──────────────────────────────────────────────────

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
    return Array.from(doc.querySelectorAll('tbody tr')).flatMap((tr) => {
      const link = tr.querySelectorAll('td')[1]?.querySelector('a');
      const m = (link?.getAttribute('href') ?? '').match(/chooseItem\('([^']+)'/);
      return m ? [{ consId: m[1], consNumber: text(link) }] : [];
    });
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

  function parseScans(doc) {
    return Array.from(doc.querySelectorAll('#MAINTABLE tbody tr')).flatMap((tr) => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 12) return [];

      const [date = '', time = ''] = text(tds[4]).split(' ');
      return [{
        route:  text(tds[1]),
        depot:  text(tds[2]),
        // CSS clips the visible text, the title attribute carries the full wording.
        type:      tds[3].getAttribute('title')?.trim() || text(tds[3]),
        date,
        time,
        notes:     tds[10].getAttribute('title')?.trim() || text(tds[10]),
        signature: text(tds[11]),
      }];
    });
  }

  /** Dates are DD/MM/YYYY, so sorting them as strings would put 10/08 before 07/08. */
  function stamp({ date, time }) {
    const [d, m, y] = date.split('/');
    return new Date(`${y}-${m}-${d}T${time || '00:00:00'}`).getTime();
  }

  const latest = (scans) => scans.reduce((a, b) => (stamp(b) >= stamp(a) ? b : a));

  // ── One consignment ──────────────────────────────────────────────────────────

  async function lookupOne(query) {
    const searched = await quickSearch(query);
    let detail = searched;

    if (!searched.getElementById('hiddenConsBarcodeValue')) {
      const hits = parseHitList(searched);
      // Quick search matches substrings, so two hits mean we cannot tell which
      // parcel the customer meant — that is a case for a human, not a template.
      if (hits.length !== 1) return { query, ok: false, reason: `${hits.length} matches` };
      detail = await fetchConsignment(hits[0].consId);
    }

    const consNumber = detail.getElementById('hiddenConsBarcodeValue')?.value ?? '';
    const delivery   = readBlock(detail, 'Delivery Address');
    const confirm    = readBlock(detail, 'Confirmation / Notification / Delivery Details');

    const scans = parseScans(await fetchDoc(scanUrl(consNumber)));
    if (!scans.length) return { query, ok: false, reason: 'no scans' };

    return {
      query,
      ok:           true,
      consNumber,
      status:       text(detail.querySelectorAll('h1 b')[1]),
      arrangedDate: pick(confirm, 'Arranged Delivery Date'),
      lastScan:     latest(scans),
      scanCount:    scans.length,
      address: {
        contact:  pick(delivery, 'Contact'),
        company:  pick(delivery, 'Company Name'),
        lines:    addressLines(delivery),
        town:     pick(delivery, 'Town'),
        county:   pick(delivery, 'County'),
        postCode: pick(delivery, 'Post Code'),
        depot:    pick(delivery, 'Delivery Depot'),
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
