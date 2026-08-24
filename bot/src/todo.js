/**
 * bot/src/todo.js
 * ===============
 * Personal daily to-do list backed by a separate Firestore collection.
 *
 * Bot-only feature: it never touches the extension or the depot — just the bot
 * and Firestore. Each task is scoped to the Discord user who created it, so two
 * people sharing the bot never see each other's list.
 *
 * Ordering is done in memory (by createdAt) on purpose: a Firestore
 * `where + orderBy` on different fields would demand a manual composite index,
 * and a personal list is far too small for that to matter.
 */
import { randomUUID } from 'node:crypto';

import { db, admin } from './firebase.js';

const COLLECTION = 'todos';

/** Adds a new open task for the given user. */
export async function addTodo(userId, text) {
  const id = randomUUID();
  await db.collection(COLLECTION).doc(id).set({
    id,
    userId,
    text,
    done:      false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/** Returns the user's tasks, oldest first. */
export async function listTodos(userId) {
  const snap = await db.collection(COLLECTION).where('userId', '==', userId).get();
  return snap.docs
    .map((doc) => doc.data())
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
}

/**
 * Marks the task at 1-based list position `number` as done.
 * Returns the task, or null if that position does not exist.
 */
export async function markDone(userId, number) {
  const todos = await listTodos(userId);
  const todo = todos[number - 1];
  if (!todo) return null;

  await db.collection(COLLECTION).doc(todo.id).update({
    done:   true,
    doneAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return todo;
}

/** Deletes every done task for the user. Returns how many were removed. */
export async function clearDone(userId) {
  const done = (await listTodos(userId)).filter((t) => t.done);
  await Promise.all(done.map((t) => db.collection(COLLECTION).doc(t.id).delete()));
  return done.length;
}

/** Renders a compact checklist for Discord. */
export function renderList(todos) {
  if (todos.length === 0) return '📭 Список порожній. Додай задачу: `/todo add`';
  return todos
    .map((t, i) => `${i + 1}. ${t.done ? '✅' : '⬜'} ${t.text}`)
    .join('\n');
}
