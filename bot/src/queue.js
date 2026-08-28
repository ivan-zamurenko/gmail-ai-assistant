/**
 * bot/src/queue.js
 * ================
 * The bot's half of the shared task queue (Firebase Firestore).
 *
 * Flow: the bot drops a task document, the Chrome extension (running in a live
 * depot tab) picks it up, executes it, and writes the result back onto the same
 * document. onSnapshot lets the bot react the instant that happens — no polling.
 *
 * The bot authenticates with a Firebase service account (full trust). The
 * extension side will use its own scoped credentials.
 */
import { randomUUID } from 'node:crypto';

import { db, admin } from './firebase.js';
import { loadConfig } from '../config/config.js';
import { STATUS, TASKS_COLLECTION, TASK_SCHEMA_VERSION } from './contract.js';
import { safeErrorMessage } from './errors.js';

const cfg = loadConfig();
const TERMINAL = new Set([STATUS.DONE, STATUS.ERROR, STATUS.CANCELLED]);

/**
 * Drops a task on the queue and resolves with the extension's result document.
 * Rejects on timeout so an offline extension never leaves Discord hanging.
 */
export function enqueueAndWait(task, { timeoutMs = 5 * 60_000, claimWindowMs = 60_000 } = {}) {
  const id  = randomUUID();
  const ref = db.collection(TASKS_COLLECTION).doc(id);

  const record = {
    id,
    schemaVersion: TASK_SCHEMA_VERSION,
    command:     task.command,
    args:        task.args ?? {},
    requestedBy: task.requestedBy,
    executorUid: cfg.firebase.executorUid,
    status:      STATUS.PENDING,
    createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    expiresAt:   admin.firestore.Timestamp.fromMillis(Date.now() + claimWindowMs),
  };

  return new Promise((resolvePromise, reject) => {
    let settled = false;
    let unsubscribe = () => {};

    const cleanup = () => {
      clearTimeout(timer);
      unsubscribe();
    };
    const removeTask = () => ref.delete().catch((err) => {
      console.error('Queue cleanup failed:', safeErrorMessage(err));
    });
    const finishWithResult = (data) => {
      if (settled) return;
      settled = true;
      cleanup();
      removeTask();
      if (data.status === STATUS.CANCELLED) reject(new Error(data.summary || 'Задачу скасовано'));
      else resolvePromise(data);
    };
    const finishWithError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const timer = setTimeout(async () => {
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
              completedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        if (!data || !TERMINAL.has(data.status)) return;
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
