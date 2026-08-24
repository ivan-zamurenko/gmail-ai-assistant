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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import admin from 'firebase-admin';

import { loadConfig } from '../config/config.js';
import { STATUS, TASKS_COLLECTION } from './contract.js';

const cfg = loadConfig();

const BOT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serviceAccount = JSON.parse(
  readFileSync(resolve(BOT_ROOT, cfg.firebase.serviceAccountPath), 'utf8'),
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId:  cfg.firebase.projectId,
});

const db = admin.firestore();

/**
 * Drops a task on the queue and resolves with the extension's result document.
 * Rejects on timeout so an offline extension never leaves Discord hanging.
 */
export function enqueueAndWait(task, { timeoutMs = 60_000 } = {}) {
  const id  = randomUUID();
  const ref = db.collection(TASKS_COLLECTION).doc(id);

  const record = {
    id,
    command:     task.command,
    args:        task.args ?? {},
    requestedBy: task.requestedBy,
    channelId:   task.channelId,
    status:      STATUS.PENDING,
    createdAt:   admin.firestore.FieldValue.serverTimestamp(),
  };

  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('Розширення не відповіло вчасно — воно запущене й залогінене в депо?'));
    }, timeoutMs);

    const unsubscribe = ref.onSnapshot(
      (snap) => {
        const data = snap.data();
        if (!data || data.status === STATUS.PENDING) return;
        clearTimeout(timer);
        unsubscribe();
        resolvePromise(data);
      },
      (err) => { clearTimeout(timer); reject(err); },
    );

    ref.set(record).catch((err) => {
      clearTimeout(timer);
      unsubscribe();
      reject(err);
    });
  });
}
