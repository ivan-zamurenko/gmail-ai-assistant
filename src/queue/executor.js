/**
 * src/queue/executor.js
 * =====================
 * Turns a queue task into a depot action and back into a one-line result.
 *
 * This is the only place on the extension side that knows depot verbs. It reuses
 * the exact same depotMain and depotLookup the popup runs, so "reschedule" and
 * "find" mean one thing across the whole extension.
 *
 * Wired so far: /reschedule all, /reschedule parcel, and /find. Unsupported
 * modes answer honestly rather than failing in some obscure way.
 */

import { depotMain }       from '../depot/depotScript.js';
import { depotLookup }     from '../depot/lookup.js';
import {
  applyRecoveryResult,
  loadRecoveryTargets,
} from '../depot/rescheduleRecovery.js';
import {
  COMMANDS, RESCHEDULE_MODE, STATUS, TASK_SCHEMA_VERSION,
} from './contract.js';
import { CONSTANTS }       from '../utils/constants.js';
import { safeErrorMessage } from '../utils/errors.js';

const done  = (summary, details) => ({ status: STATUS.DONE,  summary, details });
const error = (summary)          => ({ status: STATUS.ERROR, summary });

// Discord caps a message near 2000 chars, so the per-parcel block is bounded.
const MAX_DETAIL_LINES = 25;
const ACTION_ICON = { CHANGE_DATE: '✅', SKIP: '⏭️', ERROR: '❌' };

async function findDepotTabs() {
  const tabs = await chrome.tabs.query({ url: CONSTANTS.DEPOT_URL_PATTERN });
  // Chrome's Memory Saver discards idle background tabs; waking a discarded depot
  // tab forces a full page reload (10–40s), which is the bulk of a slow /find.
  // Pinning them keeps the renderer alive so later tasks inject instantly.
  await Promise.all(tabs.map((t) =>
    chrome.tabs.update(t.id, { autoDiscardable: false }).catch(() => {})));
  return tabs;
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
  const diag = []; // per-tab inject cost — a discarded/frozen tab is slow to wake

  for (const tab of tabs) {
    let res;
    const ti = Date.now();
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
      const safeMessage = safeErrorMessage(err);
      diag.push({ id: tab.id, discarded: tab.discarded, ms: Date.now() - ti, err: safeMessage });
      lastReason = /error page/i.test(safeMessage)
        ? 'Депо-вкладка показує помилку — онови її (F5), перевір мережу депо й залогінься'
        : `Не дістатися депо-вкладки — ${safeMessage}`;
      continue;
    }
    diag.push({ id: tab.id, discarded: tab.discarded, ms: Date.now() - ti });

    const verdict = classify(res);
    if (verdict.wrongPage) { lastReason = verdict.reason; continue; }
    if (verdict.ok && verdict.value && typeof verdict.value === 'object') verdict.value._diag = diag;
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

function manualDateError(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return 'Некоректна дата — використовуй YYYY-MM-DD';
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const selected = new Date(year, month - 1, day);
  if (selected.getFullYear() !== year || selected.getMonth() !== month - 1 || selected.getDate() !== day) {
    return 'Некоректна календарна дата';
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (selected <= today) return 'Дата має бути пізніше за сьогодні';
  if (selected.getDay() === 0 || selected.getDay() === 6) return 'Дата не може бути вихідним днем';
  return null;
}

async function runParcel({ conId, newDate, dryRun }) {
  const { result: lookup, reason: lookupReason } = await injectLookup(conId);
  if (lookupReason) return error(lookupReason);
  if (!lookup?.consNumber) return error(findFailure(lookup));
  if (!lookup.consId) return error('Depot lookup не повернув точний внутрішній ConsId');

  const targetNumber = /^0\d{8}$/.test(conId) ? conId : lookup.consNumber;
  const { result: res, reason } = await injectDepot({
    dryRun,
    mode: 'manual',
    date: newDate,
    targets: [{ consNumber: targetNumber, consId: lookup.consId, type: 'PopUp' }],
  });
  if (reason) return error(reason);
  return done(`${summarize(res)} | Дата: ${newDate}`, detailsFor(res));
}

async function runRetry(dryRun) {
  const targets = await loadRecoveryTargets(chrome.storage.local);
  if (targets.length === 0) {
    return done('Немає server errors із сьогоднішнього Scan Drive Labels');
  }

  const { result: res, reason } = await injectDepot({ dryRun, mode: 'labels', targets });
  if (reason) return error(`${reason} | ${targets.length} посилок залишено для retry`);

  if (dryRun) {
    return done(`${summarize(res)} | Збережено для retry: ${targets.length}`, detailsFor(res));
  }

  const remaining = await applyRecoveryResult(chrome.storage.local, res);
  return done(`${summarize(res)} | Залишилось для retry: ${remaining.length}`, detailsFor(res));
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

async function runFind(args) {
  const conId = args?.conId;
  if (!conId) return error('Не вказано номер посилки');

  const { result: res, reason } = await injectLookup(conId);
  if (reason)  return error(reason);
  if (!res.ok) return error(findFailure(res));

  // /find is an administrator-only, ephemeral operational card. Keep the payload
  // structured and bounded; arbitrary depot notes still stay inside the extension.
  const operationalValue = (value) => {
    const clean = String(value ?? '').trim();
    return /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,23}$/.test(clean) ? clean : '';
  };
  const textValue = (value, max = 200) => Array.from(String(value ?? ''))
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : char;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  const scans = res.scans.map((scan) => {
    const bay      = operationalValue(scan.bay);
    const sequence = operationalValue(scan.sequence);
    const onwardBc = operationalValue(scan.onwardBc);
    return {
      parcel: scan.parcel,
      type:   scan.type,
      date:   scan.date,
      time:   scan.time,
      route:  scan.route,
      ...(scan.signature && { signature: textValue(scan.signature, 80) }),
      ...(bay && { bay }),
      ...(sequence && { sequence }),
      ...(onwardBc && { onwardBc }),
    };
  });
  const parcel = {
    query:      res.query,
    consNumber: res.consNumber,
    arrangedDate: res.arrangedDate,
    scans,
    drop:       res.drop,
    timing:     res.timing,
    _diag:      res._diag,
    address: {
      contact:  textValue(res.address.contact),
      company:  textValue(res.address.company),
      lines:    (res.address.lines ?? []).map((line) => textValue(line)).filter(Boolean),
      town:     textValue(res.address.town),
      county:   textValue(res.address.county),
      postCode: textValue(res.address.postCode, 16),
      depot:    textValue(res.address.depot, 80),
      mobile:   textValue(res.address.mobile, 80),
      email:    textValue(res.address.email, 160),
    },
  };
  return { status: STATUS.DONE, parcel };
}

/** @returns {Promise<{status: string, summary: string}>} */
export async function executeTask(task) {
  if (!task || task.schemaVersion !== TASK_SCHEMA_VERSION) {
    return error('Непідтримувана версія queue task');
  }

  if (task.command === COMMANDS.FIND) {
    const conId = task.args?.conId;
    if (typeof conId !== 'string' || !/^\d{9}(?:\d{5})?$/.test(conId)) {
      return error('Некоректний номер посилки');
    }
    return runFind(task.args);
  }

  if (task.command !== COMMANDS.RESCHEDULE) {
    return error('Невідома queue command');
  }

  const { mode, dryRun = true } = task.args ?? {};
  if (typeof dryRun !== 'boolean') return error('Некоректне значення dryRun');
  if (mode === RESCHEDULE_MODE.ALL) return runCad(dryRun);
  if (mode === RESCHEDULE_MODE.RETRY) return runRetry(dryRun);
  if (mode === RESCHEDULE_MODE.PARCEL) {
    const { conId, newDate } = task.args ?? {};
    if (typeof conId !== 'string' || !/^\d{9}(?:\d{5})?$/.test(conId)) {
      return error('Некоректний номер посилки');
    }
    const dateError = manualDateError(newDate);
    if (dateError) return error(dateError);
    return runParcel({ conId, newDate, dryRun });
  }

  return error(`Режим "${mode}" ще не під'єднано в розширенні`);
}
