import { irishDay, manualDateMessage, prepareDepotArgs } from '../../shared/depotCalendar.js';
import { resultDetails } from './resultDetails.js';
import { reportSelection } from '../depot/reportSelection.js';
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
import { fetchPodImage, podFailureCode }   from '../depot/podImage.js';
import { isDepotUrl }      from '../depot/depotTarget.js';
import {
  applyRecoveryResult,
  loadRecoveryTargets,
} from '../depot/rescheduleRecovery.js';
import {
  COMMANDS, RESCHEDULE_MODE, STATUS, TASK_SCHEMA_VERSION,
} from './contract.js';
import { CONSTANTS }       from '../utils/constants.js';
import { safeErrorMessage } from '../utils/errors.js';
import { loadConfig }      from '../config/config.js';

const done  = (summary, details) => ({ status: STATUS.DONE,  summary, details });
const error = (summary)          => ({ status: STATUS.ERROR, summary });

const ACTION_ICON = { CHANGE_DATE: '✅', SKIP: '⏭️', ERROR: '❌' };
const config = loadConfig();

async function findDepotTabs() {
  // The pattern query can return a tab that has since navigated; re-check each
  // URL with the same rule the popup uses before anything is injected.
  const tabs = (await chrome.tabs.query({ url: CONSTANTS.DEPOT_URL_PATTERN }))
    .filter((tab) => isDepotUrl(tab.url));
  // Chrome's Memory Saver discards idle background tabs; waking a discarded depot
  // tab forces a full page reload (10–40s), which is the bulk of a slow /find.
  // Pinning them keeps the renderer alive so later tasks inject instantly.
  await Promise.all(tabs.map((t) =>
    chrome.tabs.update(t.id, { autoDiscardable: false }).catch(() => {})));
  return tabs;
}

/** The same per-parcel detail the depot console shows, rendered for Discord. */
function detailsFor(res) {
  if (res.dryRun && !res.results) {
    const lines = (res.packages ?? []).map((p) => `${String(p.consNumber).padEnd(11)} ${p.consId}`);
    return resultDetails(lines);
  }
  const lines = (res.results ?? []).map((r) =>
    `${String(r.consNumber).padEnd(11)} ${ACTION_ICON[r.action] ?? '•'} ${r.action}` +
    (r.status ? ` (${r.status})` : '') + (r.reason ? ` — ${r.reason}` : ''));
  return resultDetails(lines);
}

/** Mirrors the popup's showDepotResult, condensed to one Discord line. */
function summarize(res) {
  // Order matters: an empty scan returns a warning with no count, so it must be
  // checked before the dry-run line that reads res.count.
  if (res.warning) return res.warning;
  if (res.dryRun)  return `Dry run: перевірено ${res.count} серій` + (Number.isInteger(res.eligible)
    ? ` | Дозволено: ${res.eligible} | Пропущено: ${res.skipped} | Помилки: ${res.errors}` : '')
    + (res.date ? ` | Дата: ${res.date} (${res.calendarTimeZone}; ${res.calendarVersion})` : '');
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
const UNCERTAIN = 'Результат зміни не підтверджено. Перевір depot перед повтором [uncertain-write]';

async function runInDepotTabs(func, args, classify, mutation = false) {
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
      if (mutation) return { reason: UNCERTAIN };
      const safeMessage = safeErrorMessage(err, 'Depot injection failed');
      diag.push({ id: tab.id, discarded: tab.discarded, ms: Date.now() - ti, err: safeMessage });
      lastReason = /error page/i.test(err?.message ?? '')
        ? 'Депо-вкладка показує помилку — онови її (F5), перевір мережу депо й залогінься'
        : `Не дістатися депо-вкладки — ${safeMessage}`;
      continue;
    }
    diag.push({ id: tab.id, discarded: tab.discarded, ms: Date.now() - ti });

    if (mutation && !res) return { reason: UNCERTAIN };
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

const injectDepot = async (args) => {
  let prepared;
  try { prepared = prepareDepotArgs(args); }
  catch (err) { return { reason: safeErrorMessage(err, 'Calendar preparation failed') }; }
  return runInDepotTabs(depotMain, [prepared], classifyDepot, args.dryRun === false);
};
const injectLookup = (conId, options) => runInDepotTabs(
  depotLookup,
  options ? [[String(conId)], options] : [[String(conId)]],
  classifyLookup,
);

/** Internal offscreen bridge: exact depot lookup for a decoded label number. */
export async function lookupLabelTarget(conId) {
  if (typeof conId !== 'string' || !/^\d{9}$/.test(conId)) {
    return { reason: 'Некоректний номер лейбла' };
  }
  return injectLookup(conId, { identityOnly: true });
}

/** Internal offscreen bridge: apply the shared label reschedule rules. */
export async function rescheduleLabelTargets({ dryRun, targets }) {
  if (typeof dryRun !== 'boolean' || !Array.isArray(targets)) {
    return { reason: 'Некоректний label reschedule batch' };
  }
  return injectDepot({ dryRun, mode: 'labels', targets });
}

async function runCad(dryRun) {
  const { result: res, reason } = await injectDepot({ dryRun, mode: 'cad' });
  if (reason) return error(reason);
  return done(summarize(res), detailsFor(res));
}

const manualDateError = manualDateMessage;

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
  const expectedDay = irishDay();
  const targets = await loadRecoveryTargets(chrome.storage.local);
  if (targets.length === 0) {
    return done('Немає server errors із сьогоднішнього Scan Drive Labels');
  }

  const { result: res, reason } = await injectDepot({ dryRun, mode: 'labels', targets, expectedDay });
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

  // Operator find needs scan facts only; POD stays in the driver report flow.
  return projectFindResult(res);
}

/** Report selection is read-only; chosen tuples are rechecked against fresh depot scans. */
async function runReport(args) {
  const { result: res, reason } = await injectLookup(args.conId);
  if (reason) return error(reason);
  if (!res?.ok) return error(findFailure(res));
  const selected = reportSelection(res.scans, args.selection);
  if (selected.error) return error(selected.error);
  if (selected.candidates) return { status: STATUS.DONE, parcel: { report: {
    version: 1, state: 'choose', consNumber: args.conId, candidates: selected.candidates,
  } } };
  const event = selected.event;
  const podResult = event.type === 'Delivered' && event.eventId
    ? await fetchPodImage(event.eventId, config.podAuth) : null;
  if (podResult?.error) console.warn('[report] POD_UNAVAILABLE', podFailureCode(podResult.error));
  // Preserve the complete approved address. Oversized values require manual review,
  // never a silently shortened destination. Arbitrary depot fields stay local.
  const sourceAddress = res.address && typeof res.address === 'object' ? res.address : {};
  const address = {};
  for (const key of ['contact', 'company', 'town', 'county', 'postCode', 'mobile']) {
    const value = sourceAddress[key];
    if (value != null && (typeof value !== 'string' || value.length > 1000)) return error('Report address unavailable; manual review required.');
    address[key] = value ?? '';
  }
  const lines = sourceAddress.lines ?? [];
  if (!Array.isArray(lines) || lines.length > 10 || lines.some(line => typeof line !== 'string' || line.length > 1000)) {
    return error('Report address unavailable; manual review required.');
  }
  address.lines = lines;
  if (sourceAddress.truncated === true) address.truncated = true;
  if (event.signature != null && (typeof event.signature !== 'string' || event.signature.length > 1000)) {
    return error('Report signature unavailable; manual review required.');
  }
  const podBody = podResult?.image?.body;
  const pod = typeof podBody === 'string' && podBody.length <= 700000 && /^[A-Za-z0-9+/=]+$/.test(podBody)
    ? { mime: 'image/jpeg', body: podBody } : null;
  const coords = event.coords;
  const validCoords = coords && Number.isFinite(coords.lat) && Math.abs(coords.lat) <= 90
    && Number.isFinite(coords.lng) && Math.abs(coords.lng) <= 180;
  return { status: STATUS.DONE, parcel: {
    ...(pod && { pod }),
    report: { version: 1, state: 'ready', consNumber: args.conId,
      address,
      event: { parcel: String(Number(event.parcel)), type: event.type, date: event.date, time: event.time,
        signature: event.type === 'Delivered' ? event.signature ?? '' : '',
        coords: validCoords ? { lat: coords.lat, lng: coords.lng } : null },
    },
  } };
}

/** Explicit outbound parcel contract; no depot/session objects cross this boundary. */
export function projectFindResult(res, podBody = '') {
  // /find is an administrator-only, ephemeral operational card. Keep the payload
  // structured and bounded; arbitrary depot notes still stay inside the extension.
  const operationalValue = (value) => {
    const clean = String(value ?? '').trim();
    return /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,23}$/.test(clean) ? clean : '';
  };
  const textValue = (value, max = 200) => Array.from(typeof value === 'string' ? value : '')
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : char;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  if (!Array.isArray(res.scans) || res.scans.length > 1000
      || res.scans.some(scan => !scan || typeof scan !== 'object')) {
    return error('Parcel data unavailable: unsupported or oversized scan history');
  }
  const scans = res.scans.map((scan) => {
    const bay      = operationalValue(scan.bay);
    const sequence = operationalValue(scan.sequence);
    const onwardBc = operationalValue(scan.onwardBc);
    return {
      parcel: typeof scan.parcel === 'string' && /^\d{1,6}$/.test(scan.parcel) ? scan.parcel : '',
      type:   textValue(scan.type, 48),
      date:   typeof scan.date === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(scan.date) ? scan.date : '',
      time:   typeof scan.time === 'string' && /^\d{2}:\d{2}(?::\d{2})?$/.test(scan.time) ? scan.time : '',
      route:  textValue(scan.route, 24),
      ...(scan.signature && { signature: textValue(scan.signature, 80) }),
      ...(bay && { bay }),
      ...(sequence && { sequence }),
      ...(onwardBc && { onwardBc }),
      ...(['Delivered', 'Carded', 'Failed Delivery', 'Incorrect Address'].includes(scan.type)
        && typeof scan.parcel === 'string' && /^\d{1,6}$/.test(scan.parcel) && Number(scan.parcel) > 0
        && Number.isFinite(scan.coords?.lat) && Math.abs(scan.coords.lat) <= 90
        && Number.isFinite(scan.coords?.lng) && Math.abs(scan.coords.lng) <= 180
        && { coords: { lat: scan.coords.lat, lng: scan.coords.lng } }),
    };
  });
  const address = res.address && typeof res.address === 'object' ? res.address : {};
  const addressTruncated = address.truncated === true
    || (address.lines != null && !Array.isArray(address.lines))
    || (Array.isArray(address.lines) && (address.lines.length > 5
      || address.lines.some(line => typeof line !== 'string' || line.length > 200)))
    || [address.town, address.county].some(value => value != null
      && (typeof value !== 'string' || value.length > 200));
  const drop = res.drop;
  const validDrop = drop && Number.isFinite(drop.lat) && Math.abs(drop.lat) <= 90
    && Number.isFinite(drop.lng) && Math.abs(drop.lng) <= 180;
  const duration = value => Number.isFinite(value) && value >= 0 && value <= 7200000 ? value : 0;
  const parcel = {
    query:      textValue(res.query, 20),
    consNumber: textValue(res.consNumber, 20),
    arrangedDate: textValue(res.arrangedDate, 24),
    scans,
    ...(typeof podBody === 'string' && podBody.length <= 700000 && /^[A-Za-z0-9+/=]+$/.test(podBody) && { pod: { mime: 'image/jpeg', body: podBody } }),
    drop: validDrop ? { lat: drop.lat, lng: drop.lng, type: textValue(drop.type, 48), date: textValue(drop.date, 10), time: textValue(drop.time, 8) } : null,
    timing: { search: duration(res.timing?.search), detail: duration(res.timing?.detail), scans: duration(res.timing?.scans) },
    address: {
      ...(addressTruncated && { truncated: true }),
      contact:  textValue(address.contact),
      company:  textValue(address.company),
      lines:    (Array.isArray(address.lines) ? address.lines : []).slice(0, 5).map((line) => textValue(line)).filter(Boolean),
      town:     textValue(address.town),
      county:   textValue(address.county),
      postCode: textValue(address.postCode, 16),
      depot:    textValue(address.depot, 80),
      mobile:   textValue(address.mobile, 80),
      email:    textValue(address.email, 160),
    },
  };
  if (new TextEncoder().encode(JSON.stringify(parcel)).byteLength > 900000) {
    return error('Parcel data unavailable: result size limit exceeded');
  }
  return { status: STATUS.DONE, parcel };
}

/** @returns {Promise<{status: string, summary: string}>} */
export async function executeTask(task) {
  if (!task || task.schemaVersion !== TASK_SCHEMA_VERSION) {
    return error('Непідтримувана версія queue task');
  }

  if (task.command === COMMANDS.FIND || task.command === COMMANDS.REPORT) {
    const conId = task.args?.conId;
    if (typeof conId !== 'string' || !/^\d{9}(?:\d{5})?$/.test(conId)) {
      return error('Некоректний номер посилки');
    }
    return task.command === COMMANDS.REPORT ? runReport(task.args) : runFind(task.args);
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
