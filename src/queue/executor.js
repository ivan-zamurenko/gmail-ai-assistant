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
function detailsFor(res, dryRun) {
  if (dryRun) {
    const lines = (res.packages ?? []).map((p) => `${String(p.consNumber).padEnd(11)} ${p.consId}`);
    return lines.length ? block(lines) : undefined;
  }
  const lines = (res.results ?? []).map((r) =>
    `${String(r.consNumber).padEnd(11)} ${ACTION_ICON[r.action] ?? '•'} ${r.action}` +
    (r.status ? ` (${r.status})` : ''));
  return lines.length ? block(lines) : undefined;
}

/** Mirrors the popup's showDepotResult, condensed to one Discord line. */
function summarize(res, dryRun) {
  if (dryRun)      return `Dry run: оброблено б ${res.count} посилок(и)`;
  if (res.warning) return res.warning;
  return `Готово — Змінено: ${res.changed} | Пропущено: ${res.skipped} | Помилки: ${res.errors}`;
}

/**
 * Runs depotMain in the first depot tab that accepts injection. A tab whose
 * frame is an error page (unreachable host, dropped session) still matches by
 * URL but throws on inject, so we try the next matching tab before giving up.
 */
async function injectDepot(args) {
  const tabs = await findDepotTabs();
  if (!tabs.length) return { reason: 'Відкрий вкладку депо й залогінься' };

  let lastErr = null;
  for (const tab of tabs) {
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func:   depotMain,
        args:   [args],
        // The depot rejects POSTs from an isolated world; MAIN makes them
        // ordinary page requests, exactly like running the snippet in the console.
        world:  'MAIN',
      });
      return { result: injection?.result };
    } catch (err) {
      lastErr = err;
    }
  }
  if (/error page/i.test(lastErr?.message ?? '')) {
    return { reason: 'Депо-вкладка показує помилку — онови її (F5), перевір мережу депо й залогінься' };
  }
  return { reason: `Не дістатися депо-вкладки — ${lastErr?.message}` };
}

async function runCad(dryRun) {
  const { result: res, reason } = await injectDepot({ dryRun, mode: 'cad' });
  if (reason)        return error(reason);
  if (!res)          return error('Депо-скрипт не повернув результат — ти на сторінці депо?');
  if (res.__error)   return error(res.__error);
  return done(summarize(res, dryRun), detailsFor(res, dryRun));
}

/** @returns {Promise<{status: string, summary: string}>} */
export async function executeTask(task) {
  const { mode, dryRun = true } = task.args ?? {};

  if (mode === RESCHEDULE_MODE.ALL) return runCad(dryRun);

  return error(`Режим "${mode}" ще не під'єднано в розширенні`);
}
