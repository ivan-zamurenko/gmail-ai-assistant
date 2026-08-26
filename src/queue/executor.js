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

const done  = (summary) => ({ status: STATUS.DONE,  summary });
const error = (summary) => ({ status: STATUS.ERROR, summary });

async function findDepotTab() {
  const tabs = await chrome.tabs.query({ url: CONSTANTS.DEPOT_URL_PATTERN });
  return tabs[0] ?? null;
}

/** Mirrors the popup's showDepotResult, condensed to one Discord line. */
function summarize(res, dryRun) {
  if (dryRun)      return `Dry run: оброблено б ${res.count} посилок(и)`;
  if (res.warning) return res.warning;
  return `Готово — Змінено: ${res.changed} | Пропущено: ${res.skipped} | Помилки: ${res.errors}`;
}

async function runCad(dryRun) {
  const tab = await findDepotTab();
  if (!tab) return error('Відкрий вкладку депо й залогінься');

  let injection;
  try {
    [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func:   depotMain,
      args:   [{ dryRun, mode: 'cad' }],
      // The depot rejects POSTs from an isolated world; MAIN makes them
      // ordinary page requests, exactly like running the snippet in the console.
      world:  'MAIN',
    });
  } catch (err) {
    return error(`Не дістатися депо-вкладки — ${err.message}`);
  }

  const res = injection?.result;
  if (!res)          return error('Депо-скрипт не повернув результат — ти на сторінці депо?');
  if (res.__error)   return error(res.__error);
  return done(summarize(res, dryRun));
}

/** @returns {Promise<{status: string, summary: string}>} */
export async function executeTask(task) {
  const { mode, dryRun = true } = task.args ?? {};

  if (mode === RESCHEDULE_MODE.ALL) return runCad(dryRun);

  return error(`Режим "${mode}" ще не під'єднано в розширенні`);
}
