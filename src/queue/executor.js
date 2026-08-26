/**
 * src/queue/executor.js
 * =====================
 * Turns a queue task into a depot action and back into a one-line result.
 *
 * This is the only place on the extension side that knows depot verbs. It reuses
 * the exact same depotMain the popup buttons run, so "reschedule" means one thing
 * across the whole extension.
 *
 * Slice 1 wires only /reschedule all (CAD scan). The other modes answer honestly
 * that they are not connected yet, rather than failing in some obscure way.
 */

import { depotMain }       from '../depot/depotScript.js';
import { RESCHEDULE_MODE, STATUS } from './contract.js';
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
 * Runs depotMain across the open depot tabs and returns the first real result.
 *
 * A tab can match by URL yet be the wrong one: its frame may be an error page
 * (throws on inject), or it may be a depot page that is not the dashboard
 * (depotMain returns "Pending trigger link not found"). The popup avoids this
 * by running on the tab the user is looking at; the queue has no active tab,
 * so it tries each depot tab until one actually carries the pending list.
 */
async function injectDepot(args) {
  const tabs = await findDepotTabs();
  if (!tabs.length) return { reason: 'Відкрий вкладку депо й залогінься' };

  const WRONG_PAGE = /trigger link not found|correct depot page/i;
  let lastReason = null;

  for (const tab of tabs) {
    let res;
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func:   depotMain,
        args:   [args],
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

    if (!res) {
      lastReason = 'Депо-скрипт не повернув результат — ти на сторінці депо?';
      continue;
    }
    if (res.__error) {
      lastReason = res.__error;
      if (WRONG_PAGE.test(res.__error)) continue; // another tab may be the dashboard
      return { reason: res.__error };             // a genuine depot error — stop
    }
    return { result: res };
  }

  return { reason: lastReason ?? 'Не знайдено робочої вкладки депо' };
}

async function runCad(dryRun) {
  const { result: res, reason } = await injectDepot({ dryRun, mode: 'cad' });
  if (reason) return error(reason);
  return done(summarize(res), detailsFor(res));
}

/** @returns {Promise<{status: string, summary: string}>} */
export async function executeTask(task) {
  const { mode, dryRun = true } = task.args ?? {};

  if (mode === RESCHEDULE_MODE.ALL) return runCad(dryRun);

  return error(`Режим "${mode}" ще не під'єднано в розширенні`);
}
