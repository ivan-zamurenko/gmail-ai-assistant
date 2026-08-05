/**
 * depot/lookupConsignment.js
 * ==========================
 * Looks up a single consignment by its number, using the depot's quick-search.
 *
 * This replaces the carrier API we do not have: the depot system already knows
 * every parcel's status, so we ask it the same way a human would.
 *
 * Runs INSIDE the depot tab via chrome.scripting.executeScript, for the same
 * reason depotScript.js does: the session token lives in that page's URL
 * (?session=...&UID=...), not in a cookie, so no other context can authenticate.
 *
 * Must stay self-contained — executeScript serialises only this function body,
 * so imports and outer-scope references are not available at runtime.
 */

/**
 * @typedef {Object} DepotConsignment
 * @property {string}      consNumber
 * @property {boolean}     found
 * @property {string|null} status      - Depot status, e.g. 'PENDING', 'DELIVERED'
 * @property {string|null} notes       - Latest depot notes, when available
 */

/**
 * @param {string} consNumber  Consignment number taken from a customer email
 * @returns {Promise<DepotConsignment & { __error?: string }>}
 */
export async function lookupConsignmentMain(consNumber) {
  try {
    const number = String(consNumber ?? '').trim();

    // The depot's own script refuses anything shorter, so stop before the
    // round-trip rather than parsing a validation-error page.
    if (number.length < 3) {
      return { consNumber: number, found: false, status: null, notes: null };
    }

    const params  = new URLSearchParams(window.location.search);
    const session = params.get('session');
    const uid     = params.get('UID');

    if (!session || !uid) {
      return { __error: 'No depot session in tab URL — open the depot page and log in again.' };
    }

    const fetchDoc = async (url, init) => {
      const res = await fetch(url, { credentials: 'include', ...init });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return new DOMParser().parseFromString(await res.text(), 'text/html');
    };

    const readStatus = (doc) => doc.querySelectorAll('h1 b')[1]?.textContent.trim() || null;

    // ── Quick search ─────────────────────────────────────────────────────────
    const searchUrl =
      `/scripts/cgiip.exe/WService=wsInterlink/woConQuickSearch.p` +
      `?session=${encodeURIComponent(session)}&UID=${encodeURIComponent(uid)}`;

    let doc = await fetchDoc(searchUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ 'con-quick-search': number }).toString(),
    });

    // Quick search lands on one of two pages depending on how many parcels
    // match the number, so handle both rather than assuming one.
    let status = readStatus(doc);

    if (!status) {
      // Result list — follow the first row through to its detail page.
      const link = Array.from(doc.querySelectorAll('tbody tr'))
        .map((tr) => tr.querySelectorAll('td')[1]?.querySelector('a'))
        .find((a) => a && /chooseItem\(/.test(a.getAttribute('href') ?? ''));

      const consId = link?.getAttribute('href')?.match(/chooseItem\('([^']+)'/)?.[1];
      if (!consId) {
        return { consNumber: number, found: false, status: null, notes: null };
      }

      doc = await fetchDoc(
        `/scripts/cgiip.exe/WService=wsInterlink/woConsignmentDetails.p` +
        `?session=${encodeURIComponent(session)}&Mode=CS&UID=${encodeURIComponent(uid)}` +
        `&Type=PopUp&ConsId=${encodeURIComponent(consId)}`
      );
      status = readStatus(doc);
    }

    if (!status) {
      return { consNumber: number, found: false, status: null, notes: null };
    }

    // ── Notes ────────────────────────────────────────────────────────────────
    // Loaded lazily by the page, so the URL has to be dug out of an inline
    // script. Best-effort: a reply is still useful without them.
    let notes = null;
    for (const s of doc.querySelectorAll('script')) {
      const m = s.textContent.match(/ConsignmentsNotes['"]\s*\)\s*\.load\s*\(\s*['"]([^'"]+)['"]/);
      if (!m) continue;
      try {
        const notesDoc = await fetchDoc(new URL(m[1], window.location.href).href);
        notes = notesDoc.body?.textContent?.trim() || null;
      } catch { /* notes are optional */ }
      break;
    }

    return { consNumber: number, found: true, status, notes };
  } catch (err) {
    console.error('[lookupConsignment] fatal:', err);
    return { __error: err.message };
  }
}
