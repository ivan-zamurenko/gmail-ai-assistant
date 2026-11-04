/**
 * src/queue/labelScanJob.js
 * =========================
 * The popup's Drive label scan as a stored job (S04-03, G_ARCHITECTURE A).
 * The popup starts and watches it; offscreen runs it in the shared serial queue;
 * background owns chrome.storage and the only copy of the record.
 *
 * Pure functions only: every transition returns a new plain object, so the
 * record can be stored, compared and tested without Chrome APIs.
 */

export const LABEL_SCAN_JOB_KEY = 'labelScanJob';
const VERSION = 1;
const ACTIVE = new Set(['queued', 'running']);
const STAGE = /^[a-z][a-z-]{0,23}$/;
const MAX_COUNT = 100_000;

const bounded = (value, max) => (typeof value === 'string' && value ? value.slice(0, max) : null);
const count = value => Number.isInteger(value) && value >= 0 && value <= MAX_COUNT;

export function createLabelScanJob({ id, dryRun, now }) {
  return {
    version: VERSION, id, dryRun, state: 'queued', stage: 'queued', accepted: false,
    current: 0, total: 0, startedAt: now, updatedAt: now, summary: null, details: null, status: null,
  };
}

/** Offscreen confirmed it owns this job; only from now can a restart lose it. */
export function markAccepted(job, jobId, now) {
  if (!isActive(job) || jobId !== job.id) return job;
  return { ...job, accepted: true, updatedAt: now };
}

export const isActive = job => Boolean(job && job.version === VERSION && ACTIVE.has(job.state));

export function applyProgress(job, { jobId, stage, current, total } = {}, now) {
  if (!isActive(job) || jobId !== job.id || !STAGE.test(stage ?? '')
      || !count(current) || !count(total) || (total > 0 && current > total)) return job;
  return { ...job, state: 'running', stage, current, total, updatedAt: now };
}

export function applyFinish(job, { jobId, status, summary, details } = {}, now) {
  if (!isActive(job) || jobId !== job.id) return job;
  const ok = status === 'done';
  return {
    ...job, state: ok ? 'done' : 'error', status: ok ? 'done' : 'error', updatedAt: now,
    summary: bounded(summary, 1000) ?? (ok ? 'Done' : 'Label scan failed'),
    details: bounded(details, 2000),
  };
}

/**
 * The runner restarted: an accepted job is lost — nothing resumes on its own and
 * nothing is replayed. A job not yet handed over is left for its own start call,
 * unless the caller knows no start call owns it any more (`orphaned`).
 */
export function interruptActive(job, now, { orphaned = false } = {}) {
  if (!isActive(job) || (!job.accepted && !orphaned)) return job;
  const at = job.total > 0 ? ` at ${job.current}/${job.total}` : '';
  return {
    ...job, state: 'interrupted', status: 'error', updatedAt: now,
    summary: `Interrupted${at} — check Drive before starting again; it was not repeated`,
  };
}

export function parseStart(msg) {
  return msg?.type === 'label-scan-start' && typeof msg.dryRun === 'boolean' ? { dryRun: msg.dryRun } : null;
}

/**
 * Browser-provided sender metadata decides who may send what. A depot page
 * (any tab) or another extension can never start a job or drive the runner.
 */
export function authorizeSender(type, sender, { runtimeId, popupUrl, offscreenUrl, workerUrl }) {
  const expected = {
    'label-scan-start': popupUrl,
    'label-scan-progress': offscreenUrl,
    'label-scan-finish': offscreenUrl,
    'label-scan-boot': offscreenUrl,
    'label-scan-run': workerUrl,
  }[type];
  return Boolean(expected && sender && sender.id === runtimeId && sender.tab === undefined && sender.url === expected);
}
