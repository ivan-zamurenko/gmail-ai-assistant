/**
 * snippets/discover_quick_search.js
 * =================================
 * Read-only inspector for the depot quick-search box.
 *
 * Why: the extension needs to look up a consignment by its number
 * (e.g. from a customer email), but the endpoint behind
 * <input id="con-quick-search"> is not documented anywhere in this repo.
 * This prints everything needed to implement that lookup.
 *
 * HOW TO RUN
 *   1. Open the depot page and log in as usual.
 *   2. Open DevTools (F12) → Console.
 *   3. Paste this whole file, press Enter.
 *   4. Copy the output back to the chat.
 *
 * Safe to run: it only reads the page. Nothing is submitted or changed.
 */

(() => {
  const out = {};

  // ── The input itself ────────────────────────────────────────────────────────
  const input = document.querySelector('#con-quick-search, [name="con-quick-search"]');
  if (!input) {
    console.error('con-quick-search not found — are you on the depot page with the search box visible?');
    return;
  }

  out.input = {
    id:          input.id,
    name:        input.name,
    type:        input.type,
    placeholder: input.placeholder,
    // Inline handlers reveal the endpoint when there is no real form submit.
    onkeydown:   input.getAttribute('onkeydown'),
    onkeypress:  input.getAttribute('onkeypress'),
    onchange:    input.getAttribute('onchange'),
  };

  // ── The form it belongs to ──────────────────────────────────────────────────
  const form = input.closest('form');
  out.form = form
    ? {
        action:   form.getAttribute('action'),
        method:   form.getAttribute('method'),
        onsubmit: form.getAttribute('onsubmit'),
        fields:   Array.from(form.elements)
          .filter((el) => el.name)
          .map((el) => ({ name: el.name, type: el.type, value: el.value })),
      }
    : '(input is not inside a <form> — likely submitted by JavaScript)';

  // ── Nearby buttons that might trigger the search ────────────────────────────
  const scope = form ?? input.parentElement?.parentElement ?? document;
  out.buttons = Array.from(
    scope.querySelectorAll('button, input[type=submit], input[type=button], a')
  )
    .filter((el) => /search|find|go|submit/i.test(el.textContent + el.value + el.id + el.className))
    .map((el) => ({
      tag:     el.tagName,
      id:      el.id,
      text:    (el.textContent || el.value || '').trim().slice(0, 40),
      href:    el.getAttribute('href'),
      onclick: el.getAttribute('onclick'),
    }));

  // ── Page scripts mentioning quick search ────────────────────────────────────
  // The endpoint is usually built inside a small inline handler function.
  out.scriptHints = Array.from(document.querySelectorAll('script'))
    .map((s) => s.textContent ?? '')
    .filter((t) => /quick-?search|quickSearch/i.test(t))
    .flatMap((t) =>
      t
        .split('\n')
        .filter((line) => /quick-?search|quickSearch|\.p\b|cgiip/i.test(line))
        .map((line) => line.trim())
    )
    .slice(0, 30);

  // ── Session context (values redacted — we only need to know they exist) ─────
  const params = new URLSearchParams(window.location.search);
  out.session = {
    hasSession: params.has('session'),
    hasUID:     params.has('UID'),
    path:       window.location.pathname,
    // Needed verbatim for host_permissions in manifest.json: the background
    // service worker cannot rely on activeTab, which only applies to clicks.
    origin:     window.location.origin,
  };

  console.log('=== QUICK SEARCH INSPECTION ===');
  console.log(JSON.stringify(out, null, 2));
  console.log('=== END — copy everything above ===');
})();
