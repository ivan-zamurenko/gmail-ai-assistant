// Explicit Emulator suite; deliberately outside the ordinary *.test.* glob.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, updateDoc, Timestamp, serverTimestamp, collection, query, where, getDocs, setLogLevel } from 'firebase/firestore';
import { createRulesEnvironment, emulatorConfig } from '../helpers/firestore-emulator.mjs';

setLogLevel('silent'); // Expected rule denials are assertions, not application errors.
const alice = 'synthetic-executor-a';
const bob = 'synthetic-executor-b';
const future = () => Timestamp.fromMillis(Date.now() + 120_000);
const pending = () => ({ schemaVersion: 2, command: 'find', args: { conId: '123456789' }, requestedBy: 'synthetic-owner', executorUid: alice, status: 'pending', createdAt: serverTimestamp(), expiresAt: future() });
async function seed(env, id, fields = {}, collectionName = 'tasks') {
  await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), collectionName, id), { ...pending(), ...fields }));
  return doc(env.authenticatedContext(alice).firestore(), collectionName, id);
}
async function cleanup(env) { try { await env.clearFirestore(); } finally { await env.cleanup(); } }

// Keep tests serial: use separate project namespace per group and clean only that namespace.
test('Firestore rules enforce assigned identity, immutable fields and claim/expiry transitions', async () => {
  for (const environment of [{}, { FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443', DPD_RULES_PROJECT: 'demo-dpd-rules-test' },
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080', DPD_RULES_PROJECT: 'real-project' },
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:99999', DPD_RULES_PROJECT: 'demo-dpd-rules-test' }]) {
    assert.throws(() => emulatorConfig(environment), /explicit loopback/);
  }
  const env = await createRulesEnvironment({ suffix: '-access' });
  try {
    const ref = await seed(env, 'identity');
    const aDb = env.authenticatedContext(alice).firestore();
    const bDb = env.authenticatedContext(bob, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    const noAuth = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(ref));
    for (const deniedDb of [bDb, noAuth]) {
      const deniedRef = doc(deniedDb, 'tasks', 'identity');
      await assertFails(getDoc(deniedRef));
      await assertFails(updateDoc(deniedRef, { status: 'claimed', claimedAt: serverTimestamp() }));
    }
    await assertSucceeds(getDocs(query(collection(aDb, 'tasks'), where('executorUid', '==', alice))));
    await assertFails(getDocs(collection(aDb, 'tasks')));
    await assertFails(setDoc(doc(aDb, 'tasks', 'browser-created'), pending()));
    await assertFails(deleteDoc(ref));
    await seed(env, 'private-todo', {}, 'todos');
    const todo = doc(aDb, 'todos', 'private-todo');
    await assertFails(getDoc(todo));
    await assertFails(setDoc(todo, { text: 'synthetic' }));
    await assertFails(deleteDoc(todo));
    for (const patch of [{ command: 'reschedule' }, { args: { mode: 'all', dryRun: false } }, { requestedBy: bob }, { executorUid: bob }]) {
      await assertFails(updateDoc(ref, { status: 'claimed', claimedAt: serverTimestamp(), ...patch }));
    }
    await assertFails(updateDoc(ref, { status: 'cancelled', summary: 'too early', completedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { status: 'claimed', claimedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { status: 'claimed', claimedAt: serverTimestamp() }));
    for (const patch of [{ command: 'reschedule' }, { args: {} }, { requestedBy: bob }, { executorUid: bob }]) {
      await assertFails(updateDoc(ref, { status: 'done', summary: '', completedAt: serverTimestamp(), ...patch }));
    }
    await assertSucceeds(updateDoc(ref, { status: 'done', summary: 'complete', completedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { status: 'error', summary: 'rewrite', completedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { status: 'pending' }));

    // Server-generated deadline has been reached by the following request; no sleeps/client-clock boundary guess.
    const reached = await seed(env, 'reached-deadline', { expiresAt: serverTimestamp() });
    await assertFails(updateDoc(reached, { status: 'claimed', claimedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(reached, { status: 'cancelled', summary: 'expired', completedAt: serverTimestamp() }));
    await assertFails(updateDoc(reached, { status: 'claimed', claimedAt: serverTimestamp() }));
  } finally { await cleanup(env); }

  // Sensitivity control in a separate throwaway project: a permissive rule is detected by the denial assertion.
  const permissive = await createRulesEnvironment({ suffix: '-control', rules: "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{path=**} { allow read, write: if true; } } }" });
  try {
    await seed(permissive, 'control');
    await assert.rejects(assertFails(getDoc(doc(permissive.authenticatedContext(bob).firestore(), 'tasks', 'control'))), /Expected request to fail/);
  } finally { await cleanup(permissive); }
});

test('Firestore terminal payload bounds reject malformed results and cancellation summaries', async () => {
  const env = await createRulesEnvironment({ suffix: '-bounds' });
  let index = 0;
  const complete = patch => ({ status: 'done', summary: '', completedAt: serverTimestamp(), ...patch });
  try {
    for (const patch of [{ summary: 'x'.repeat(501) }, { summary: 1 }, { details: 'x'.repeat(2001) }, { details: [] },
      { execMs: -1 }, { execMs: 0.5 }, { execMs: 7200001 }, { execMs: '10' }, { parcel: [] }, { parcel: 'not-map' }, { parcel: null }]) {
      const ref = await seed(env, `invalid-${index++}`, { status: 'claimed', claimedAt: serverTimestamp() });
      await assertFails(updateDoc(ref, complete(patch)));
    }
    for (const execMs of [0, 7200000]) {
      const ref = await seed(env, `valid-${index++}`, { status: 'claimed', claimedAt: serverTimestamp() });
      await assertSucceeds(updateDoc(ref, complete({ summary: 'x'.repeat(500), details: 'x'.repeat(2000), execMs, parcel: {} })));
    }
    // Document the current boundary honestly: nested parcel fields are not a rules schema.
    const nested = await seed(env, 'nested-map', { status: 'claimed', claimedAt: serverTimestamp() });
    await assertSucceeds(updateDoc(nested, complete({ parcel: { syntheticUnknownField: true } })));
    for (const summary of ['x'.repeat(501), 1]) {
      const ref = await seed(env, `cancel-${index++}`, { expiresAt: serverTimestamp() });
      await assertFails(updateDoc(ref, { status: 'cancelled', summary, completedAt: serverTimestamp() }));
    }
  } finally { await cleanup(env); }
});
