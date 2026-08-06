/**
 * snippets/discover_reschedule_form.js
 * ====================================
 * Read-only inspector for the "rearrange consignment" form.
 *
 * Why: our POST is rejected — the server answers with the same form instead of
 * a confirmation. The body we send has `action=` empty, so the server is most
 * likely being told "just show me the form". This prints what the real submit
 * button puts into that field, and which visible inputs we are currently
 * dropping.
 *
 * HOW TO RUN
 *   1. Open the depot page and log in as usual.
 *   2. Open DevTools (F12) → Console.
 *   3. Paste this whole file, press Enter.
 *   4. Copy the output back to the chat.
 *
 * Safe to run: it only fetches and reads the form. Nothing is submitted.
 */

(async () => {
  // Any consignment from the failing run — this one came from the last log.
  const CONS_ID = '4347034';

  const session = new URLSearchParams(window.location.search).get('session');
  if (!session) {
    console.error('No ?session= in the URL — open this from the depot page, not a blank tab.');
    return;
  }

  const url = `/scripts/cgiip.exe/WService=wsInterlink/woRearrangeConsignment.p` +
    `?session=${encodeURIComponent(session)}&ConsId=${encodeURIComponent(CONS_ID)}`;

  const html = await (await fetch(url, { credentials: 'include' })).text();
  const doc  = new DOMParser().parseFromString(html, 'text/html');
  const form = doc.querySelector('form');
  if (!form) { console.error('No <form> in the response.'); return; }

  const lines = [];
  const add = (...s) => lines.push(...s);

  add('── FORM ──');
  add(`action:   ${form.getAttribute('action')}`);
  add(`method:   ${form.getAttribute('method')}`);
  add(`onsubmit: ${form.getAttribute('onsubmit')}`);

  add('', '── FIELDS ──');
  for (const el of form.elements) {
    if (!el.name) continue;
    const checked = /radio|checkbox/.test(el.type) ? ` checked=${el.checked}` : '';
    add(`${el.type.padEnd(10)} ${el.name.padEnd(28)} = ${JSON.stringify(el.value)}${checked}`);
  }

  add('', '── BUTTONS (what they run on click) ──');
  for (const el of form.querySelectorAll('button, input[type=submit], input[type=button], a')) {
    const label = (el.value || el.textContent || '').trim().slice(0, 40);
    add(`${el.tagName} "${label}" onclick=${el.getAttribute('onclick')} href=${el.getAttribute('href')}`);
  }

  // The value for the hidden `action` field is assigned somewhere in these scripts.
  add('', '── SCRIPT LINES MENTIONING action ──');
  for (const s of doc.querySelectorAll('script')) {
    for (const line of (s.textContent ?? '').split('\n')) {
      if (/\baction\b/.test(line)) add(line.trim());
    }
  }

  const report = lines.join('\n');
  console.log(report);
  if (typeof copy === 'function') { copy(report); console.log('↑ copied to clipboard'); }
})();
