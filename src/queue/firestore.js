/**
 * src/queue/firestore.js
 * ======================
 * The extension's half of the shared task queue — the mirror of bot/src/queue.js.
 *
 * The bot side runs firebase-admin with a service account (full trust, Node only).
 * A shipped extension can carry neither, so this side talks to the Firestore REST
 * API and authenticates as an anonymous Firebase user. The web apiKey is a public
 * project identifier, not a secret; the tasks collection is fenced off by Firebase
 * security rules, not by hiding the key.
 *
 * This module is the only place that knows Firestore's wire format. Everything
 * above it works with plain task objects.
 */

import { loadConfig }      from '../config/config.js';
import { TASKS_COLLECTION } from './contract.js';
import { logger }          from '../utils/logger.js';

const IDENTITY_BASE = 'https://identitytoolkit.googleapis.com/v1';
const TOKEN_BASE    = 'https://securetoken.googleapis.com/v1';
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1';

// chrome.storage key for the anonymous user's refresh token. Persisting it means
// we reuse one anonymous identity across service-worker restarts instead of
// minting a fresh Firebase user on every cold start.
const REFRESH_KEY = 'queue_refresh_token';

// In-memory ID token, valid ~1h. Never persisted — it is re-derived from the
// refresh token whenever the service worker wakes cold.
let idToken = null;
let idTokenExpiry = 0;

function firebase() {
  const { firebase: fb } = loadConfig();
  if (!fb?.apiKey || !fb?.projectId) {
    throw new Error('Firebase не налаштовано — заповни firebase.apiKey і firebase.projectId у local.js');
  }
  return fb;
}

function documentsUrl(projectId) {
  return `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents`;
}

// ── Authentication ────────────────────────────────────────────────────────────

async function signInAnonymously(apiKey) {
  const res = await fetch(`${IDENTITY_BASE}/accounts:signUp?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`Анонімний вхід не вдався (HTTP ${res.status})`);
  const data = await res.json();
  await chrome.storage.local.set({ [REFRESH_KEY]: data.refreshToken });
  return data;
}

async function refreshIdToken(apiKey, refreshToken) {
  const res = await fetch(`${TOKEN_BASE}/token?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`refresh`); // caller falls back to a fresh sign-in
  const data = await res.json();
  return { idToken: data.id_token, expiresIn: data.expires_in };
}

/** Returns a valid ID token, reusing the cached one until it is close to expiry. */
async function getToken() {
  if (idToken && Date.now() < idTokenExpiry - 60_000) return idToken;

  const { apiKey } = firebase();
  const stored = (await chrome.storage.local.get(REFRESH_KEY))[REFRESH_KEY];

  let token, expiresIn;
  if (stored) {
    try {
      ({ idToken: token, expiresIn } = await refreshIdToken(apiKey, stored));
    } catch {
      logger.warn('queue: refresh token rejected, signing in fresh');
    }
  }
  if (!token) {
    const data = await signInAnonymously(apiKey);
    token = data.idToken;
    expiresIn = data.expiresIn;
  }

  idToken = token;
  idTokenExpiry = Date.now() + Number(expiresIn) * 1000;
  return idToken;
}

async function authed(url, options = {}) {
  const token = await getToken();
  return fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
}

// ── Firestore value codec (only the types this queue uses) ──────────────────────

function decodeValue(value) {
  if ('stringValue'    in value) return value.stringValue;
  if ('integerValue'   in value) return Number(value.integerValue);
  if ('doubleValue'    in value) return value.doubleValue;
  if ('booleanValue'   in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue'      in value) return null;
  if ('mapValue'       in value) return decodeFields(value.mapValue.fields ?? {});
  if ('arrayValue'     in value) return (value.arrayValue.values ?? []).map(decodeValue);
  return undefined;
}

function decodeFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) out[key] = decodeValue(value);
  return out;
}

const stringField    = (s) => ({ stringValue: String(s) });
const timestampField = (d) => ({ timestampValue: d });

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the oldest pending task, or null when the queue is empty.
 * Decoded into a plain object: { id, command, args, ... }.
 */
export async function claimNextTask() {
  const { projectId } = firebase();

  const res = await authed(`${documentsUrl(projectId)}:runQuery`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from:  [{ collectionId: TASKS_COLLECTION }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op:    'EQUAL',
            value: stringField('pending'),
          },
        },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }],
        limit:   1,
      },
    }),
  });
  if (!res.ok) throw new Error(`Firestore query HTTP ${res.status}`);

  const rows = await res.json();
  const doc  = rows.find((row) => row.document)?.document;
  if (!doc) return null;

  return {
    id: doc.name.split('/').pop(),
    ...decodeFields(doc.fields ?? {}),
  };
}

/**
 * Writes the outcome back onto the task document. The bot's onSnapshot treats
 * any non-pending status as final, so this is what ends the round-trip.
 */
export async function writeResult(id, { status, summary, details }) {
  const { projectId } = firebase();

  const fields = {
    status:      stringField(status),
    summary:     stringField(summary ?? ''),
    completedAt: timestampField(new Date().toISOString()),
  };
  const mask = ['status', 'summary', 'completedAt'];
  if (details) {
    fields.details = stringField(details);
    mask.push('details');
  }

  const url = `${documentsUrl(projectId)}/${TASKS_COLLECTION}/${id}?` +
    mask.map((f) => `updateMask.fieldPaths=${f}`).join('&');

  const res = await authed(url, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore write HTTP ${res.status}`);
}
