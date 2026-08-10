/**
 * snippets/discover_consignment_details.js
 * ========================================
 * Read-only inspector for a consignment detail page.
 *
 * Why: the auto-reply needs delivery date, delivered-to and address, and we
 * only know the selector for the status so far. This prints every label/value
 * pair on the page so the real selectors can be written instead of guessed.
 *
 * HOW TO RUN
 *   1. Open the depot page and log in as usual.
 *   2. Open ONE consignment that is already DELIVERED — those pages carry the
 *      most filled-in fields, so nothing important stays hidden.
 *   3. DevTools (F12) → Console → paste this whole file → Enter.
 *   4. Copy the output back to the chat.
 *
 * Safe to run: it only reads the page. Nothing is submitted or changed.
 */

(() => {
  const clean = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const out = {};

  out.url = window.location.pathname + window.location.search.replace(/=[^&]*/g, '=***');

  // ── Headline: this is where the status lives today ──────────────────────────
  out.headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => ({
    tag:  h.tagName,
    text: clean(h),
    // depotScript.js reads h1 b[1] — confirm that still holds.
    bold: Array.from(h.querySelectorAll('b')).map(clean),
  }));

  // ── Two-column tables are how this system shows "Label: value" ──────────────
  out.tableRows = Array.from(document.querySelectorAll('table tr'))
    .map((tr) => Array.from(tr.querySelectorAll('th, td')).map(clean))
    .filter((cells) => cells.some((c) => c))
    .slice(0, 120);

  // ── Definition lists and Bootstrap form rows, in case values live there ─────
  out.labelled = Array.from(document.querySelectorAll('dt, label, .control-label'))
    .map((el) => {
      const holder = el.tagName === 'DT' ? el.nextElementSibling
                                         : el.parentElement?.nextElementSibling ?? el.parentElement;
      return { label: clean(el), value: clean(holder) };
    })
    .filter((p) => p.label && p.value)
    .slice(0, 80);

  // ── Named inputs: the depot often renders read-only data as filled fields ───
  out.fields = Array.from(document.querySelectorAll('input[name], select[name], textarea[name]'))
    .filter((el) => el.type !== 'hidden')
    .map((el) => ({ name: el.name, type: el.type, value: el.value }))
    .slice(0, 80);

  // ── Panels loaded over AJAX (notes work this way) hold the rest ─────────────
  out.ajaxPanels = Array.from(document.querySelectorAll('script'))
    .flatMap((s) => Array.from((s.textContent ?? '').matchAll(/\$\(\s*['"]#([\w-]+)['"]\s*\)\s*\.load\s*\(\s*['"]([^'"]+)['"]/g)))
    .map((m) => ({ target: m[1], url: m[2].replace(/=[^&]*/g, '=***') }));

  console.log('=== CONSIGNMENT DETAIL INSPECTION ===');
  console.log(JSON.stringify(out, null, 2));
  console.log('=== END — copy everything above ===');
})();
