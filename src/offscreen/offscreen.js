/**
 * src/offscreen/offscreen.js — offscreen document
 * ===============================================
 * Holds the one thing a Manifest V3 service worker cannot: a live Firestore
 * listener. The worker sleeps after ~30s and would drop the stream, so the
 * realtime half of the queue lives here, in a context that stays awake.
 *
 * Responsibility split:
 *   offscreen — watch Firestore (onSnapshot) and write the result back (SDK).
 *   worker    — inject depotMain into the depot tab (chrome.scripting).
 * They talk over a single runtime message: { type: 'execute', task }.
 *
 * The Firebase SDK owns anonymous auth and its own streaming transport, so this
 * side carries no token handling — the SDK refreshes and attaches it for us.
 */

import { initializeApp }              from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, query, where,
  onSnapshot, doc, runTransaction, serverTimestamp,
} from 'firebase/firestore';

import { loadConfig }               from '../config/config.js';
import { STATUS, TASKS_COLLECTION } from '../queue/contract.js';
import { safeErrorMessage }         from '../utils/errors.js';

// One browser profile is the executor. Queue work is deliberately serial because
// depot writes are not idempotent and concurrent tasks would race the same tab.
const scheduled = new Set();
let serial = Promise.resolve();

async function writeResult(db, id, { status, summary, details, parcel, execMs }) {
  const fields = { status, summary: summary ?? '', completedAt: serverTimestamp() };
  if (details) fields.details = details;
  if (parcel)  fields.parcel  = parcel;
  if (execMs != null) fields.execMs = execMs; // depot work only — lets the bot split total time
  await runTransaction(db, async (tx) => {
    const ref = doc(db, TASKS_COLLECTION, id);
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().status !== STATUS.CLAIMED) return;
    tx.update(ref, fields);
  });
}

async function claimTask(db, id) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, TASKS_COLLECTION, id);
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;

    const task = snap.data();
    if (task.status !== STATUS.PENDING) return null;
    const expiresAt = task.expiresAt?.toMillis?.() ?? 0;
    if (!expiresAt || expiresAt <= Date.now()) {
      tx.update(ref, {
        status:      STATUS.CANCELLED,
        summary:     'Задача прострочена до початку виконання',
        completedAt: serverTimestamp(),
      });
      return null;
    }

    tx.update(ref, { status: STATUS.CLAIMED, claimedAt: serverTimestamp() });
    return task;
  });
}

async function handle(db, id) {
  const started = Date.now();
  try {
    const task = await claimTask(db, id);
    if (!task) return;
    const result = await chrome.runtime.sendMessage({ type: 'execute', task });
    await writeResult(db, id, { ...result, execMs: Date.now() - started });
  } catch (err) {
    await writeResult(db, id, {
      status: STATUS.ERROR,
      summary: safeErrorMessage(err),
    }).catch(() => {});
  } finally {
    scheduled.delete(id);
  }
}

function schedule(db, id) {
  if (scheduled.has(id)) return;
  scheduled.add(id);
  serial = serial.then(() => handle(db, id)).catch((err) => {
    scheduled.delete(id);
    console.error('[offscreen] queue error:', safeErrorMessage(err));
  });
}

async function main() {
  const { firebase } = loadConfig();
  const app = initializeApp({ apiKey: firebase.apiKey, projectId: firebase.projectId });
  const credential = await signInAnonymously(getAuth(app));
  const executorUid = credential.user.uid;
  console.info(`[offscreen] Firebase executor UID: ${executorUid}`);
  const db = getFirestore(app);

  // Query by identity so Firestore rules can prove every returned document belongs
  // to this executor. Rules are not filters; a status-only query cannot do that.
  const assigned = query(
    collection(db, TASKS_COLLECTION),
    where('executorUid', '==', executorUid),
  );
  onSnapshot(
    assigned,
    (snap) => snap.forEach((d) => {
      if (d.data().status === STATUS.PENDING) schedule(db, d.id);
    }),
    (err) => console.error('[offscreen] snapshot error:', safeErrorMessage(err)),
  );

  // A reclaimed listener is why a task could sit ~30s before being noticed. Ping
  // the worker so both this document and the worker stay awake between tasks.
  setInterval(() => chrome.runtime.sendMessage({ type: 'keepalive' }).catch(() => {}), 20_000);
}

main().catch((err) => console.error('[offscreen] fatal:', safeErrorMessage(err)));
