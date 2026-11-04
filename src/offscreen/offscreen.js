/**
 * src/offscreen/offscreen.js — offscreen document
 * ===============================================
 * Holds the one thing a Manifest V3 service worker cannot: a live Firestore
 * listener. The worker sleeps after ~30s and would drop the stream, so the
 * realtime half of the queue lives here, in a context that stays awake.
 *
 * Responsibility split:
 *   offscreen — watch Firestore, run DOM/canvas Drive scans, write results.
 *   worker    — inject lookup/reschedule functions into authenticated depot tabs.
 * They communicate through narrow runtime messages.
 *
 * Firebase owns anonymous queue auth. Google OAuth is requested by background
 * and passed only over the internal runtime bridge for `/reschedule barcodes`.
 */

import { initializeApp }              from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, query, where,
  onSnapshot, doc, runTransaction, serverTimestamp, updateDoc,
} from 'firebase/firestore';

import { loadConfig }         from '../config/config.js';
import {
  COMMANDS, RESCHEDULE_MODE, STATUS, TASKS_COLLECTION, TASK_SCHEMA_VERSION,
} from '../queue/contract.js';
import { authorizeSender }   from '../queue/labelScanJob.js';
import { executeBarcodeTask } from '../queue/barcodeExecutor.js';
import { createRuntimeStorage } from '../queue/runtimeStorage.js';
import { createTaskProgressReporter } from '../queue/taskProgress.js';
import { safeErrorMessage }   from '../utils/errors.js';

// One browser profile is the executor. Queue work is deliberately serial because
// depot writes are not idempotent and concurrent tasks would race the same tab.
const scheduled = new Set();
let serial = Promise.resolve();
let executorUid = null;
let auth = null;
let acceptingTasks = false;
let heartbeatTimer = null;
let unsubscribeSnapshot = () => {};
let unsubscribeAuth = () => {};
let heartbeatInFlight = false;
let heartbeatFailed = false;

function currentExecutor() {
  return acceptingTasks && auth?.currentUser?.uid === executorUid;
}

function stopListener(code) {
  if (!acceptingTasks) return;
  acceptingTasks = false;
  unsubscribeSnapshot();
  unsubscribeAuth();
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  console.warn(`[offscreen] ${code}`);
}

async function heartbeat() {
  if (!currentExecutor() || heartbeatInFlight) return;
  heartbeatInFlight = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'keepalive' });
    if (!response?.ok) throw new Error('Worker did not acknowledge heartbeat');
    heartbeatFailed = false;
  } catch {
    if (!heartbeatFailed) console.warn('[offscreen] WORKER_UNAVAILABLE');
    heartbeatFailed = true;
  } finally {
    heartbeatInFlight = false;
  }
}

async function writeResult(db, id, { status, summary, details, parcel, execMs }) {
  const fields = { status, summary: summary ?? '', completedAt: serverTimestamp() };
  if (details) fields.details = details;
  if (parcel)  fields.parcel  = parcel;
  if (execMs != null) fields.execMs = execMs; // depot work only — lets the bot split total time
  await runTransaction(db, async (tx) => {
    const ref = doc(db, TASKS_COLLECTION, id);
    const snap = await tx.get(ref);
    if (!currentExecutor() || !snap.exists() || snap.data().executorUid !== executorUid
        || snap.data().status !== STATUS.CLAIMED) return;
    tx.update(ref, fields);
  });
}

async function claimTask(db, id) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, TASKS_COLLECTION, id);
    const snap = await tx.get(ref);
    if (!currentExecutor() || !snap.exists()) return null;

    const task = snap.data();
    if (task.executorUid !== executorUid || task.status !== STATUS.PENDING) return null;
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

// The ports shared by Discord barcodes and the popup label scan job.
function barcodePorts(onProgress) {
  return {
    lookup: (number) => chrome.runtime.sendMessage({ type: 'label-lookup', number }),
    reschedule: (options) => chrome.runtime.sendMessage({ type: 'label-reschedule', options }),
    getAuthToken: async () => {
      const response = await chrome.runtime.sendMessage({ type: 'drive-auth-token' });
      if (response?.reason) throw new Error(response.reason);
      return response?.token;
    },
    removeCachedAuthToken: (token) => chrome.runtime.sendMessage({
      type: 'drive-remove-token', token,
    }),
    storage: createRuntimeStorage((message) => chrome.runtime.sendMessage(message)),
    onProgress,
  };
}

async function handle(db, id) {
  const started = Date.now();
  const progress = createTaskProgressReporter((value) => updateDoc(
    doc(db, TASKS_COLLECTION, id),
    {
      progressStage: value.stage,
      progressCurrent: value.current,
      progressTotal: value.total,
      progressMs: value.elapsedMs,
      progressAt: serverTimestamp(),
    },
  ));
  try {
    const task = await claimTask(db, id);
    if (!task || !currentExecutor()) return;
    const isBarcodeTask = task.command === COMMANDS.RESCHEDULE
      && task.args?.mode === RESCHEDULE_MODE.BARCODES;
    const result = isBarcodeTask
      ? await executeBarcodeTask(task, barcodePorts((current, total, stage) => {
        const elapsedMs = Date.now() - started;
        const count = total > 0 ? ` | ${current}/${total}` : '';
        console.log(`[barcode] ${stage}${count} | ${elapsedMs}ms`);
        progress.push(current, total, stage, elapsedMs);
      }))
      : await chrome.runtime.sendMessage({ type: 'execute', task });
    if (isBarcodeTask) await progress.flush();
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

// ── Popup label scan job (S04-03) ──────────────────────────────────────────────
// Same executor and same serial queue as Discord, so the two never run at once.
async function runLabelScan(jobId, dryRun) {
  const started = Date.now();
  const send = (message) => chrome.runtime.sendMessage({ ...message, jobId }).catch(() => {});
  const progress = createTaskProgressReporter((value) => send({
    type: 'label-scan-progress', stage: value.stage, current: value.current, total: value.total,
  }));
  try {
    const result = await executeBarcodeTask({
      schemaVersion: TASK_SCHEMA_VERSION,
      command: COMMANDS.RESCHEDULE,
      args: { mode: RESCHEDULE_MODE.BARCODES, dryRun },
    }, barcodePorts((current, total, stage) => progress.push(current, total, stage, Date.now() - started)));
    await progress.flush();
    await send({ type: 'label-scan-finish', status: result.status, summary: result.summary, details: result.details });
  } catch (err) {
    await progress.flush().catch(() => {});
    await send({ type: 'label-scan-finish', status: STATUS.ERROR, summary: safeErrorMessage(err, 'Label scan failed') });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'label-scan-run') return;
  const context = {
    runtimeId: chrome.runtime.id,
    workerUrl: chrome.runtime.getURL('src/background/background.js'),
  };
  if (!authorizeSender(msg.type, sender, context) || typeof msg.jobId !== 'string'
      || !/^[A-Za-z0-9-]{1,64}$/.test(msg.jobId) || typeof msg.dryRun !== 'boolean') {
    sendResponse({ accepted: false });
    return;
  }
  serial = serial.then(() => runLabelScan(msg.jobId, msg.dryRun)).catch((err) => {
    console.error('[offscreen] label scan error:', safeErrorMessage(err));
  });
  sendResponse({ accepted: true });
});

// A fresh offscreen document means any job a previous one accepted is lost.
chrome.runtime.sendMessage({ type: 'label-scan-boot' }).catch(() => {});

function schedule(db, id) {
  if (!currentExecutor() || scheduled.has(id)) return;
  scheduled.add(id);
  serial = serial.then(() => handle(db, id)).catch((err) => {
    scheduled.delete(id);
    console.error('[offscreen] queue error:', safeErrorMessage(err));
  });
}

async function main() {
  const { firebase } = loadConfig();
  const app = initializeApp({ apiKey: firebase.apiKey, projectId: firebase.projectId });
  auth = getAuth(app);
  const credential = await signInAnonymously(auth);
  executorUid = credential.user?.uid;
  if (typeof executorUid !== 'string' || !executorUid) throw new Error('Missing executor identity');
  acceptingTasks = true;
  console.info(`[offscreen] Firebase executor UID: ${executorUid}`);
  const db = getFirestore(app);

  // Query by identity so Firestore rules can prove every returned document belongs
  // to this executor. Rules are not filters; a status-only query cannot do that.
  const assigned = query(
    collection(db, TASKS_COLLECTION),
    where('executorUid', '==', executorUid),
  );
  unsubscribeSnapshot = onSnapshot(
    assigned,
    (snap) => snap.forEach((d) => {
      if (currentExecutor() && d.data().executorUid === executorUid
          && d.data().status === STATUS.PENDING) schedule(db, d.id);
    }),
    (err) => {
      console.error('[offscreen] snapshot error:', safeErrorMessage(err));
      stopListener('LISTENER_UNAVAILABLE');
    },
  );

  // A reclaimed listener is why a task could sit ~30s before being noticed. Ping
  // the worker so both this document and the worker stay awake between tasks.
  heartbeatTimer = setInterval(heartbeat, 20_000);
  unsubscribeAuth = onAuthStateChanged(auth, user => {
    if (user?.uid !== executorUid) stopListener('IDENTITY_CHANGED');
  }, () => stopListener('IDENTITY_UNAVAILABLE'));
  // Also handle an identity change during listener setup, before its callback arrives.
  if (!currentExecutor()) stopListener('IDENTITY_CHANGED');
}

main().catch((err) => {
  stopListener('LISTENER_UNAVAILABLE');
  console.error('[offscreen] fatal:', safeErrorMessage(err));
});
