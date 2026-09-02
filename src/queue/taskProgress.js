const REMOTE_STAGES = new Set([
  'depot-probe',
  'depot-ready',
  'drive-auth',
  'drive-ready',
  'listing',
  'done',
  'reschedule',
]);

function boundedInteger(value, maximum) {
  return Math.max(0, Math.min(maximum, Math.floor(Number(value) || 0)));
}

/** Coalesces progress writes so diagnostics never become the batch bottleneck. */
export function createTaskProgressReporter(write) {
  let pending = null;
  let inFlight = null;

  const pump = () => {
    if (inFlight || !pending) return;
    const next = pending;
    pending = null;
    inFlight = Promise.resolve(write(next))
      .catch(() => {})
      .finally(() => {
        inFlight = null;
        pump();
      });
  };

  return {
    push(current, total, stage, elapsedMs) {
      if (!REMOTE_STAGES.has(stage)) return;
      const safeTotal = boundedInteger(total, 10_000);
      pending = {
        stage,
        current: Math.min(boundedInteger(current, 10_000), safeTotal || 10_000),
        total: safeTotal,
        elapsedMs: boundedInteger(elapsedMs, 7_200_000),
      };
      pump();
    },
    async flush() {
      while (inFlight || pending) {
        pump();
        if (inFlight) await inFlight;
      }
    },
  };
}
