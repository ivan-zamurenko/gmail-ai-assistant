// Paste the built dist/console/lookup.js into the depot tab's console to try
// the real module by hand — no duplicated snippet to drift out of sync.
import { depotLookup } from './lookup.js';

window.depotLookup = depotLookup;

/** Shows what quick search actually answers, so response parsing is observed, not guessed. */
window.depotQuickSearchRaw = async (number) => {
  const form = document.getElementById('ConQSearchForm');
  const res = await fetch(form.action, {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:        new URLSearchParams({ 'con-quick-search': number }).toString(),
  });

  const html = await res.text();
  const doc  = new DOMParser().parseFromString(html, 'text/html');
  const rows = Array.from(doc.querySelectorAll('tr'));
  doc.querySelectorAll('script, style').forEach((el) => el.remove());

  return {
    httpStatus:   res.status,
    finalUrl:     res.url,
    redirected:   res.redirected,
    htmlLength:   html.length,
    isDetailPage: !!doc.getElementById('hiddenConsBarcodeValue'),
    heading:      doc.querySelector('h1')?.textContent.replace(/\s+/g, ' ').trim(),
    tableIds:     Array.from(doc.querySelectorAll('table')).map((t) => t.id || '(no id)'),
    rowCount:     rows.length,
    // The row markup is exactly what we failed to recognise, so show it verbatim.
    firstRows:    rows.slice(0, 4).map((tr) => tr.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 400)),
    linkHrefs:    Array.from(doc.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href'))
      .filter((h) => /chooseItem|ConsId|Consignment/i.test(h))
      .slice(0, 10),
    visibleText:  (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
  };
};

console.log('Ready. Try:  await depotQuickSearchRaw("131787155")');
