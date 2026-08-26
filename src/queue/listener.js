/**
 * src/queue/listener.js
 * =====================
 * One poll of the queue: claim the oldest pending task, run it, write the result.
 *
 * Kept to a single task per tick on purpose — a service-worker wake is short, and
 * the bot only ever waits on one command at a time. The in-flight guard stops a
 * slow task from being picked up twice by overlapping alarms within one worker.
 */

import { claimNextTask, writeResult } from './firestore.js';
import { executeTask } from './executor.js';
import { STATUS }      from './contract.js';
import { logger }      from '../utils/logger.js';

const inFlight = new Set();

export async function tick() {
  let task;
  try {
    task = await claimNextTask();
  } catch (err) {
    logger.error(`queue: cannot reach Firestore — ${err.message}`);
    return;
  }

  if (!task || inFlight.has(task.id)) return;

  inFlight.add(task.id);
  try {
    const result = await executeTask(task);
    await writeResult(task.id, result);
    logger.info(`queue: ${task.id} → ${result.status}`);
  } catch (err) {
    logger.error(`queue: ${task.id} failed — ${err.message}`);
    await writeResult(task.id, { status: STATUS.ERROR, summary: err.message }).catch(() => {});
  } finally {
    inFlight.delete(task.id);
  }
}
