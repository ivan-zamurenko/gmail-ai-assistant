/**
 * src/background/labelScanRoutes.js
 * =================================
 * Background side of the popup label scan job (S04-03). Owns the stored job
 * record: one active job at a time, handed to the offscreen runner, updated only
 * by that runner. All storage writes go through one chain, so concurrent
 * messages cannot lose an update or start two jobs.
 */

import {
  LABEL_SCAN_JOB_KEY, applyFinish, applyItem, applyProgress, createLabelScanJob, interruptActive,
  isActive, markAccepted, parseStart, requestCancel,
} from '../queue/labelScanJob.js';

const UNAVAILABLE = 'Label scan runner unavailable — nothing was changed';

export function createLabelScanRoutes({ storage, ensureOffscreen, sendToRunner, now = Date.now, newId }) {
  let chain = Promise.resolve();
  // Jobs this worker is handing to the runner right now. A restarted worker starts
  // empty, so an unaccepted job it finds was orphaned by a worker that died.
  const starting = new Set();
  const orphaned = job => isActive(job) && !job.accepted && !starting.has(job.id);
  const serial = (step) => {
    const run = chain.then(step);
    chain = run.catch(() => {});
    return run;
  };
  const read = async () => (await storage.get(LABEL_SCAN_JOB_KEY))?.[LABEL_SCAN_JOB_KEY];
  const write = job => storage.set({ [LABEL_SCAN_JOB_KEY]: job });
  const update = transform => serial(async () => {
    const current = await read();
    const next = transform(current);
    if (next !== current) await write(next);
    return next;
  });

  async function start(msg) {
    const parsed = parseStart(msg);
    if (!parsed) return { reason: 'Invalid label scan request' };
    const created = await serial(async () => {
      const current = await read();
      if (isActive(current) && !orphaned(current)) return { busy: current };
      const job = createLabelScanJob({ id: newId(), dryRun: parsed.dryRun, now: now() });
      starting.add(job.id);
      await write(job);
      return { job };
    });
    if (created.busy) return { reason: 'A label scan is already running', jobId: created.busy.id };

    const { job } = created;
    let accepted = false;
    try {
      await ensureOffscreen();
      const response = await sendToRunner({ type: 'label-scan-run', jobId: job.id, dryRun: job.dryRun });
      accepted = response?.accepted === true;
    } catch {
      accepted = false;
    }
    try {
      await update(current => (accepted
        ? markAccepted(current, job.id, now())
        : applyFinish(current, { jobId: job.id, status: 'error', summary: UNAVAILABLE }, now())));
    } finally {
      starting.delete(job.id);
    }
    return accepted ? { jobId: job.id } : { reason: UNAVAILABLE, jobId: job.id };
  }

  return {
    start,
    progress: msg => update(current => applyProgress(current, msg, now())).then(() => ({ ok: true })),
    item: msg => update(current => applyItem(current, msg, now())).then(() => ({ ok: true })),
    // Cancel stops new work only; what was already done stays recorded.
    cancel: async msg => {
      const job = await update(current => requestCancel(current, msg?.jobId, now()));
      if (!job?.cancelRequested || job.id !== msg?.jobId) return { reason: 'No running label scan to cancel' };
      await sendToRunner({ type: 'label-scan-cancel-run', jobId: job.id }).catch(() => {});
      return { ok: true };
    },
    finish: msg => update(current => applyFinish(current, msg, now())).then(() => ({ ok: true })),
    boot: () => update(current => interruptActive(current, now(), { orphaned: orphaned(current) })).then(() => ({ ok: true })),
  };
}
