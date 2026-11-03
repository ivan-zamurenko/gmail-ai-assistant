import { STATUS, TASKS_COLLECTION } from './contract.js';
import { buildPendingTask } from './pendingTask.js';
import { safeErrorMessage } from './errors.js';

/** Queue control flow with explicit infrastructure ports; importing never starts Firebase. */
export function createQueueService({
  db, executorUid, guildId, serverTimestamp, timestampFromMillis, randomId,
  now = Date.now, scheduleTimeout = setTimeout, cancelTimeout = clearTimeout,
}) {
  const TERMINAL = new Set([STATUS.DONE, STATUS.ERROR, STATUS.CANCELLED]);

  const RETENTION_MS = 24 * 60 * 60_000;
  const CLOCK_SKEW_MS = 5 * 60_000; // Bounded tolerance for server timestamp vs Mac clock.
  const tasks = () => db.collection(TASKS_COLLECTION);
  const millis = value => typeof value?.toMillis === 'function' ? value.toMillis() : NaN;
  const owned = (data, actor) => data?.executorUid === executorUid
    && data?.delivery?.version === 1 && data.delivery.guildId === guildId
    && actor?.guildId === guildId && data.requestedBy === actor.requestedBy;
  const available = data => TERMINAL.has(data?.status) && !data.delivery?.deliveredAt
    && Number.isFinite(millis(data.completedAt))
    && millis(data.completedAt) <= now() + CLOCK_SKEW_MS && now() - millis(data.completedAt) < RETENTION_MS;

  async function getResult(id, actor) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) return null;
    const snapshot = await tasks().doc(id).get();
    const data = snapshot.exists ? snapshot.data() : null;
    return owned(data, actor) && available(data) ? { ...data, id: snapshot.id } : null;
  }

  async function listResults(actor, consignment) {
    if (actor?.guildId !== guildId || typeof actor.requestedBy !== 'string') return [];
    if (consignment !== undefined && !/^(?:\d{9}|\d{14})$/.test(consignment)) return [];
    const snapshots = await tasks().where('requestedBy', '==', actor.requestedBy).get();
    return snapshots.docs.map(snap => ({ ...snap.data(), id: snap.id }))
      .filter(data => owned(data, actor) && available(data)
        && (consignment === undefined || data.args?.conId === consignment || data.parcel?.consNumber === consignment))
      .sort((a, b) => millis(b.completedAt) - millis(a.completedAt));
  }

  async function acknowledgeResult(id, actor) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) return false;
    const ref = tasks().doc(id);
    const marked = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const data = snapshot.exists ? snapshot.data() : null;
      if (!owned(data, actor) || !TERMINAL.has(data.status)) return false;
      tx.update(ref, { delivery: { ...data.delivery, deliveredAt: serverTimestamp() } });
      return true;
    });
    if (marked) await ref.delete();
    return marked;
  }

  async function sweepResults() {
    const snapshots = await tasks().where('executorUid', '==', executorUid).get();
    for (const snapshot of snapshots.docs) {
      const ref = tasks().doc(snapshot.id);
      // Recheck transactionally: a stale query must never delete active work.
      await db.runTransaction(async tx => {
        const current = await tx.get(ref);
        if (!current.exists) return;
        const data = current.data();
        if (data.executorUid !== executorUid || !TERMINAL.has(data.status)) return;
        if (data.delivery?.guildId && data.delivery.guildId !== guildId) return;
        if (data.delivery?.deliveredAt || !Number.isFinite(millis(data.completedAt))
            || millis(data.completedAt) > now() + CLOCK_SKEW_MS
            || now() - millis(data.completedAt) >= RETENTION_MS) tx.delete(ref);
      });
    }
  }

  /**
   * Drops a task on the queue and resolves with the extension's result document.
   * Timeout cancels pending work; claimed work rejects as uncertain without replay.
   */
  function enqueueAndWait(task, {
    timeoutMs = 5 * 60_000,
    claimWindowMs = 60_000,
    onProgress,
  } = {}) {
    const id  = randomId();
    const ref = db.collection(TASKS_COLLECTION).doc(id);

    const record = buildPendingTask(task, {
      id,
      executorUid: executorUid,
      createdAt: serverTimestamp(),
      expiresAt: timestampFromMillis(now() + claimWindowMs),
    });

    record.delivery = { version: 1, guildId };

    return new Promise((resolvePromise, reject) => {
      let settled = false;
      let unsubscribe = () => {};
      let lastProgress = '';

      const cleanup = () => {
        cancelTimeout(timer);
        unsubscribe();
      };
      const finishWithResult = (data) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolvePromise({ ...data, id });
      };
      const finishWithError = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const timer = scheduleTimeout(async () => {
        try {
          const data = await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) return null;
            const current = snap.data();
            if (current.status === STATUS.PENDING) {
              const cancelled = {
                ...current,
                status: STATUS.CANCELLED,
                summary: 'Задача прострочена до початку виконання',
              };
              tx.update(ref, {
                status:      STATUS.CANCELLED,
                summary:     cancelled.summary,
                completedAt: serverTimestamp(),
              });
              return cancelled;
            }
            return current;
          });

          if (data && TERMINAL.has(data.status)) finishWithResult(data);
          else finishWithError(new Error(
            data?.status === STATUS.CLAIMED
              ? 'Розширення почало виконання, але результат не підтверджено. Не повторюй live-команду автоматично.'
              : 'Розширення не відповіло вчасно — перевір його стан і depot session.',
          ));
        } catch (err) {
          finishWithError(new Error(safeErrorMessage(err)));
        }
      }, timeoutMs);

      unsubscribe = ref.onSnapshot(
        (snap) => {
          const data = snap.data();
          if (!data) return;
          if (data.status === STATUS.CLAIMED && typeof onProgress === 'function') {
            const progress = {
              stage: data.progressStage,
              current: data.progressCurrent,
              total: data.progressTotal,
              elapsedMs: data.progressMs,
            };
            const key = JSON.stringify(progress);
            if (typeof progress.stage === 'string' && key !== lastProgress) {
              lastProgress = key;
              try { onProgress(progress); } catch { /* UI diagnostics must not stop work */ }
            }
          }
          if (!TERMINAL.has(data.status)) return;
          finishWithResult(data);
        },
        // Do not reject early: the extension may already have claimed/executed the
        // task. The timeout transaction will determine pending vs claimed safely.
        (err) => console.error('Queue listener error:', safeErrorMessage(err)),
      );

      ref.set(record).catch((err) => {
        finishWithError(new Error(safeErrorMessage(err)));
      });
    });
  }

  return { enqueueAndWait, getResult, listResults, acknowledgeResult, sweepResults };
}
