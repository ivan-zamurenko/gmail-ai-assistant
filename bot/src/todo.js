/** Firebase wiring for the bot-only personal checklist; retention is unchanged. */
import { randomUUID } from 'node:crypto';
import { db, admin } from './firebase.js';
import { createTodoService } from './todoService.js';
export { renderList } from './todoService.js';

export const { addTodo, listTodos, markDone, clearDone, rememberTodoList } = createTodoService({
  db, randomId: randomUUID, serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
});
