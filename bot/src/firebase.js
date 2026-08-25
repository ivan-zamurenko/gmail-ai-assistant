/**
 * bot/src/firebase.js
 * ===================
 * Single Firebase Admin initialization shared by every module that touches
 * Firestore. initializeApp() throws if called twice, so it must live in one place.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import admin from 'firebase-admin';

import { loadConfig } from '../config/config.js';

const cfg = loadConfig();

const BOT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serviceAccount = JSON.parse(
  readFileSync(resolve(BOT_ROOT, cfg.firebase.serviceAccountPath), 'utf8'),
);

// projectId is read from serviceAccount.json by cert() — no need to repeat it.
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export const db = admin.firestore();
export { admin };
