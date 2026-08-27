/**
 * src/queue/executor.js
 * =====================
 * Turns a queue task into a depot action and back into a one-line result.
 *
 * This is the only place on the extension side that knows depot verbs. It reuses
 * the exact same depotMain and depotLookup the popup runs, so "reschedule" and
 * "find" mean one thing across the whole extension.
 *
 * Wired so far: /reschedule all (CAD scan) and /find (one consignment). The
 * other reschedule modes answer honestly that they are not connected yet,
 * rather than failing in some obscure way.
 */

import { depotMain }       from '../depot/depotScript.js';
import { depotLookup }     from '../depot/lookup.js';
import { COMMANDS, RESCHEDULE_MODE, STATUS } from './contract.js';
import { CONSTANTS }       from '../utils/constants.js';

const done  = (summary, details) => ({ status: STATUS.DONE,  summary, details });
const error = (summary)          => ({ status: STATUS.ERROR, summary });

// Discord caps a message near 2000 chars, so the per-parcel block is bounded.
const MAX_DETAIL_LINES = 25;
const ACTION_ICON = { CHANGE_DATE: '✅', SKIP: '⏭️', ERROR: '❌' };

async function findDepotTabs() {
  return chrome.tabs.query({ url: CONSTANTS.DEPOT_URL_PATTERN });
}

/** Trims a line list to fit Discord and notes how many were hidden. */
function block(lines) {
  if (lines.length <= MAX_DETAIL_LINES) return lines.join('\n');
  const shown = lines.slice(0, MAX_DETAIL_LINES);
  shown.push(`… ще ${lines.length - MAX_DETAIL_LINES}`);
  return shown.join('\n');
}

/** The same per-parcel detail the depot console shows, rendered for Discord. */
function detailsFor(res) {
  if (res.dryRun) {
    const lines = (res.packages ?? []).map((p) => `${String(p.consNumber).padEnd(11)} ${p.consId}`);
    return lines.length ? block(lines) : undefined;
  }
  const lines = (res.results ?? []).map((r) =>
    `${String(r.consNumber).padEnd(11)} ${ACTION_ICON[r.action] ?? '•'} ${r.action}` +
    (r.status ? ` (${r.status})` : ''));
  return lines.length ? block(lines) : undefined;
}

/** Mirrors the popup's showDepotResult, condensed to one Discord line. */
function summarize(res) {
  // Order matters: an empty scan returns a warning with no count, so it must be
  // checked before the dry-run line that reads res.count.
  if (res.warning) return res.warning;
  if (res.dryRun)  return `Dry run: оброблено б ${res.count} посилок(и)`;
  return `Готово — Змінено: ${res.changed} | Пропущено: ${res.skipped} | Помилки: ${res.errors}`;
}

/**
 * Runs an injected depot function across the open depot tabs and returns the
 * first real result.
 *
 * A tab can match by URL yet be the wrong one: its frame may be an error page
 * (throws on inject), or it may be a depot page that is not the one we need
 * (the depot script says so). The popup avoids this by running on the tab the
 * user is looking at; the queue has no active tab, so it tries each depot tab
 * until one actually answers. `classify` turns a raw result into a verdict:
 * `{ ok, value }` to accept, `{ wrongPage, reason }` to try the next tab, or
 * `{ reason }` for a genuine depot error that should stop the search.
 */
async function runInDepotTabs(func, args, classify) {
  const tabs = await findDepotTabs();
  if (!tabs.length) return { reason: 'Відкрий вкладку депо й залогінься' };

  let lastReason = null;

  for (const tab of tabs) {
    let res;
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func,
        args,
        // The depot rejects POSTs from an isolated world; MAIN makes them
        // ordinary page requests, exactly like running the snippet in the console.
        world:  'MAIN',
      });
      res = injection?.result;
    } catch (err) {
      lastReason = /error page/i.test(err.message)
        ? 'Депо-вкладка показує помилку — онови її (F5), перевір мережу депо й залогінься'
        : `Не дістатися депо-вкладки — ${err.message}`;
      continue;
    }

    const verdict = classify(res);
    if (verdict.wrongPage) { lastReason = verdict.reason; continue; }
    return verdict.ok ? { result: verdict.value } : { reason: verdict.reason };
  }

  return { reason: lastReason ?? 'Не знайдено робочої вкладки депо' };
}

// depotMain reports a wrong page through __error; only these mean "try elsewhere".
const WRONG_PAGE = /trigger link not found|correct depot page/i;

function classifyDepot(res) {
  if (!res) return { wrongPage: true, reason: 'Депо-скрипт не повернув результат — ти на сторінці депо?' };
  if (res.__error) {
    return WRONG_PAGE.test(res.__error)
      ? { wrongPage: true, reason: res.__error }
      : { ok: false, reason: res.__error };
  }
  return { ok: true, value: res };
}

// depotLookup returns one result per query; only a missing search box means the
// tab is wrong. "0 matches" / "no scans" are honest answers, not wrong pages.
function classifyLookup(res) {
  if (!Array.isArray(res) || !res.length) {
    return { wrongPage: true, reason: 'Депо-пошук нічого не повернув — ти на сторінці депо?' };
  }
  const [r] = res;
  if (!r.ok && /depot page/i.test(r.reason ?? '')) return { wrongPage: true, reason: r.reason };
  return { ok: true, value: r };
}

const injectDepot   = (args)  => runInDepotTabs(depotMain,   [args],           classifyDepot);
const injectLookup  = (conId) => runInDepotTabs(depotLookup, [[String(conId)]], classifyLookup);

async function runCad(dryRun) {
  const { result: res, reason } = await injectDepot({ dryRun, mode: 'cad' });
  if (reason) return error(reason);
  return done(summarize(res), detailsFor(res));
}

// ── Find one consignment ───────────────────────────────────────────────────────

/** Turns a lookup miss into a plain-English one-liner for Discord. */
function findFailure(res) {
  const who = res.consNumber || res.query;
  if (/no scans/i.test(res.reason))       return `${who} — no scans yet (parcel hasn't moved)`;
  if (/^\d+ matches$/i.test(res.reason)) {
    const [n] = res.reason.split(' ');
    return Number(n) === 0
      ? `${who} — not found`
      : `${who} — ambiguous: ${n} matches, use the full number`;
  }
  return `${who} — ${res.reason}`;
}

/** The same fields the depot console prints, laid out for a Discord code block. */
function findDetails(res) {
  const s = res.lastScan;
  const a = res.address;
  const place     = [...a.lines, a.town, a.county, a.postCode].filter(Boolean).join(', ');
  // Contact and company are often the same person; show the name once.
  const consignee = [...new Set([a.contact, a.company].filter(Boolean))].join(', ');
  const scanLoc   = [s.depot && `depot ${s.depot}`, s.route && `route ${s.route}`].filter(Boolean).join(', ');

  const rows = [
    ['Status',    res.status],
    ['Last scan', `${s.type} — ${s.date} ${s.time}${scanLoc ? `  (${scanLoc})` : ''}`],
    ['Signed by', [s.signature, s.notes].filter(Boolean).join('  ·  ')],
    ['Consignee', consignee],
    ['Address',   place],
    ['Post code', a.postCode],
    ['Depot',     a.depot],
    ['GPS',       res.drop && `${res.drop.lat}, ${res.drop.lng}  (${res.drop.type})`],
    ['Arranged',  [res.arrangedDate, `${res.scanCount} scans`].filter(Boolean).join('  ·  ')],
  ];

  return rows
    .filter(([, value]) => value && value.trim())
    .map(([label, value]) => `${`${label}:`.padEnd(11)} ${value}`)
    .join('\n');
}

// Eircode: 3-char routing key + 4-char unique id. The unique id never uses
// B G I J L O Q S U Z, so placeholders like ZZZZ fail this on their own.
const EIRCODE = /^[AC-FHKNPRTV-Y][0-9][0-9W][0-9AC-FHKNPRTV-Y]{4}$/;

const normEircode = (pc) => {
  const s = (pc || '').replace(/\s+/g, '').toUpperCase();
  return EIRCODE.test(s) ? s : null;
};

/**
 * A Google Maps link for the drop point. With a valid Eircode it becomes a
 * directions link, so one click shows the gap between where the parcel was left
 * and where it was addressed — Google resolves the Eircode, we geocode nothing.
 */
function mapLink(res) {
  if (!res.drop) return null;
  const { lat, lng } = res.drop;
  const eircode = normEircode(res.address.postCode);
  return eircode
    ? `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${eircode}`
    : `https://www.google.com/maps?q=${lat},${lng}`;
}

async function runFind(args) {
  const conId = args?.conId;
  if (!conId) return error('Не вказано номер посилки');

  const { result: res, reason } = await injectLookup(conId);
  if (reason)  return error(reason);
  if (!res.ok) return error(findFailure(res));

  const result = done(`${res.consNumber} — ${res.status}`, findDetails(res));
  const link   = mapLink(res);
  if (link) result.link = link;
  return result;
}

/** @returns {Promise<{status: string, summary: string}>} */
export async function executeTask(task) {
  if (task.command === COMMANDS.FIND) return runFind(task.args);

  const { mode, dryRun = true } = task.args ?? {};
  if (mode === RESCHEDULE_MODE.ALL) return runCad(dryRun);

  return error(`Режим "${mode}" ще не під'єднано в розширенні`);
}
