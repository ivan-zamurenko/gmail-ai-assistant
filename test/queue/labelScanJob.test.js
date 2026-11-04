import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LABEL_SCAN_JOB_KEY, applyFinish, applyProgress, authorizeSender, createLabelScanJob,
  applyItem, interruptActive, isActive, markAccepted, parseStart, requestCancel,
} from '../../src/queue/labelScanJob.js';

const ctx = {
  runtimeId: 'ext-id',
  popupUrl: 'chrome-extension://ext-id/src/popup/popup.html',
  offscreenUrl: 'chrome-extension://ext-id/src/offscreen/offscreen.html',
  workerUrl: 'chrome-extension://ext-id/src/background/background.js',
};
const T0 = Date.UTC(2026, 10, 4, 12);

test('a job is created once per start and survives as plain storage data', () => {
  assert.equal(LABEL_SCAN_JOB_KEY, 'labelScanJob');
  const job = createLabelScanJob({ id: 'job-1', dryRun: true, now: T0 });
  assert.deepEqual(job, {
    version: 1, id: 'job-1', dryRun: true, state: 'queued', stage: 'queued', accepted: false,
    current: 0, total: 0, startedAt: T0, updatedAt: T0, summary: null, details: null, status: null,
    cancelRequested: false, items: [],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(job)), job);
  assert.equal(isActive(job), true);
});

test('progress and finish apply only to the same active job and are bounded', () => {
  const job = createLabelScanJob({ id: 'job-1', dryRun: false, now: T0 });
  const running = applyProgress(job, { jobId: 'job-1', stage: 'reading', current: 3, total: 12 }, T0 + 1000);
  assert.equal(running.state, 'running');
  assert.deepEqual([running.stage, running.current, running.total, running.updatedAt], ['reading', 3, 12, T0 + 1000]);

  assert.equal(applyProgress(running, { jobId: 'other', stage: 'reading', current: 4, total: 12 }, T0), running);
  for (const bad of [{ stage: 'x'.repeat(40) }, { stage: 'Reading <b>' }, { current: -1 }, { total: 1.5 }, { current: 5, total: 2 }]) {
    assert.equal(applyProgress(running, { jobId: 'job-1', stage: 'reading', current: 1, total: 2, ...bad }, T0), running, JSON.stringify(bad));
  }

  const done = applyFinish(running, { jobId: 'job-1', status: 'done', summary: 's'.repeat(5000), details: 'd'.repeat(5000) }, T0 + 2000);
  assert.equal(done.state, 'done');
  assert.equal(done.status, 'done');
  assert.ok(done.summary.length <= 1000 && done.details.length <= 2000);
  assert.equal(isActive(done), false);
  assert.equal(applyProgress(done, { jobId: 'job-1', stage: 'reading', current: 5, total: 12 }, T0), done, 'finished jobs never move again');
  assert.equal(applyFinish(running, { jobId: 'job-1', status: 'surprise', summary: 'x' }, T0).state, 'error');
});

test('an active job found after the runner restarts is interrupted, never resumed', () => {
  const queued = createLabelScanJob({ id: 'job-1', dryRun: false, now: T0 });
  assert.equal(interruptActive(queued, T0), queued, 'a job not yet handed to the runner is not interrupted by its boot');
  assert.equal(markAccepted(queued, 'other', T0), queued);
  const accepted = markAccepted(queued, 'job-1', T0);
  assert.equal(accepted.accepted, true);
  const running = applyProgress(accepted, { jobId: 'job-1', stage: 'filing', current: 5, total: 9 }, T0);
  const interrupted = interruptActive(running, T0 + 5000);
  assert.equal(interrupted.state, 'interrupted');
  assert.equal(interrupted.status, 'error');
  assert.match(interrupted.summary, /Interrupted at 5\/9.*check Drive.*not repeated/);
  assert.equal(isActive(interrupted), false);
  const done = applyFinish(running, { jobId: 'job-1', status: 'done', summary: 'ok' }, T0);
  assert.equal(interruptActive(done, T0), done);
  assert.equal(interruptActive(undefined, T0), undefined);
});

test('start accepts only an explicit boolean dryRun', () => {
  assert.deepEqual(parseStart({ type: 'label-scan-start', dryRun: true }), { dryRun: true });
  assert.deepEqual(parseStart({ type: 'label-scan-start', dryRun: false }), { dryRun: false });
  for (const msg of [{ type: 'label-scan-start' }, { type: 'label-scan-start', dryRun: 'false' }, { type: 'other', dryRun: true }, null]) {
    assert.equal(parseStart(msg), null, JSON.stringify(msg));
  }
});

test('each message type is accepted only from its own extension context', () => {
  const popup = { id: 'ext-id', url: ctx.popupUrl };
  const offscreen = { id: 'ext-id', url: ctx.offscreenUrl };
  const worker = { id: 'ext-id', url: ctx.workerUrl };
  const depotPage = { id: 'ext-id', url: 'http://synthetic.interlink.local/home', tab: { id: 7 } };
  const otherExtension = { id: 'evil', url: ctx.popupUrl };
  const table = {
    'label-scan-start': popup,
    'label-scan-cancel': popup,
    'label-scan-item': offscreen,
    'label-scan-cancel-run': worker,
    'label-scan-progress': offscreen,
    'label-scan-finish': offscreen,
    'label-scan-boot': offscreen,
    'label-scan-run': worker,
  };
  for (const [type, allowed] of Object.entries(table)) {
    assert.equal(authorizeSender(type, allowed, ctx), true, type);
    for (const sender of [popup, offscreen, worker, depotPage, otherExtension, { ...allowed, tab: { id: 1 } }, undefined]) {
      if (sender === allowed) continue;
      assert.equal(authorizeSender(type, sender, ctx), false, `${type} from ${sender?.url}`);
    }
  }
  assert.equal(authorizeSender('drive-auth-token', popup, ctx), false, 'unknown types are not authorised here');
});

test('journal keeps the last state per file; an interrupted in-flight move becomes uncertain; cancel is a flag', () => {
  let job = markAccepted(createLabelScanJob({ id: 'job-1', dryRun: false, now: T0 }), 'job-1', T0);
  job = applyItem(job, { jobId: 'job-1', fileId: 'f1', to: '2026/11/a.jpg', state: 'applying' }, T0);
  job = applyItem(job, { jobId: 'job-1', fileId: 'f1', to: '2026/11/a.jpg', state: 'applied' }, T0);
  job = applyItem(job, { jobId: 'job-1', fileId: 'f2', to: '2026/11/b.jpg', state: 'applying' }, T0);
  assert.equal(applyItem(job, { jobId: 'job-1', fileId: 'f3', to: 'x', state: 'done', token: 'secret' }, T0), job);
  assert.deepEqual(job.items, [{ fileId: 'f1', to: '2026/11/a.jpg', state: 'applied' }, { fileId: 'f2', to: '2026/11/b.jpg', state: 'applying' }]);
  const cancelled = requestCancel(job, 'job-1', T0);
  assert.equal(cancelled.cancelRequested, true);
  assert.equal(isActive(cancelled), true, 'cancel only stops new work; the runner finishes the job');
  const interrupted = interruptActive(cancelled, T0);
  assert.deepEqual(interrupted.items.map(i => i.state), ['applied', 'uncertain']);
  assert.match(interrupted.summary, /Uncertain moves: 1/);
});
