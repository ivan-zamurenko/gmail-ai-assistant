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
  onSnapshot, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';

import { loadConfig }               from '../config/config.js';
import { STATUS, TASKS_COLLECTION } from '../queue/contract.js';

// Tasks already handed to the worker — stops a second snapshot from running one
// twice while its result is still being written.
const inFlight = new Set();

async function writeResult(db, id, { status, summary, details }) {
  const fields = { status, summary: summary ?? '', completedAt: serverTimestamp() };
  if (details) fields.details = details;
  await updateDoc(doc(db, TASKS_COLLECTION, id), fields);
}

async function handle(db, id, task) {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  try {
    const result = await chrome.runtime.sendMessage({ type: 'execute', task });
    await writeResult(db, id, result);
  } catch (err) {
    await writeResult(db, id, { status: STATUS.ERROR, summary: err.message }).catch(() => {});
  } finally {
    inFlight.delete(id);
  }
}

async function main() {
  const { firebase } = loadConfig();
  const app = initializeApp({ apiKey: firebase.apiKey, projectId: firebase.projectId });
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);

  const pending = query(collection(db, TASKS_COLLECTION), where('status', '==', STATUS.PENDING));
  onSnapshot(
    pending,
    (snap) => snap.forEach((d) => handle(db, d.id, d.data())),
    (err) => console.error('[offscreen] snapshot error:', err.message),
  );
}

main().catch((err) => console.error('[offscreen] fatal:', err));
