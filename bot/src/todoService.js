import { createHash } from 'node:crypto';

/** Personal checklist only; no queue, depot or mail imports and no stored TTL. */
const COLLECTION = 'todos';
const MAX_ITEMS = 100;
const SHOWN_ITEMS = 20;
const SNAPSHOT_MS = 10 * 60_000;
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const millis = value => typeof value?.toMillis === 'function' && Number.isFinite(value.toMillis()) ? value.toMillis() : null;
const fingerprint = todo => createHash('sha256').update(JSON.stringify([todo.text, todo.done, todo.createdAt])).digest('hex');
const fail = code => { const error = new Error('Todo operation unavailable'); error.code = code; throw error; };

export function todoErrorMessage(error) {
  const messages = {
    'todo-text-invalid': 'Текст задачі має містити від 1 до 500 символів.',
    'todo-relist': 'Список змінився або застарів. Виконай /todo list і вибери номер ще раз.',
    'todo-limit': 'Забагато задач. Спочатку прибери виконані через /todo clear.',
    'todo-record-invalid': 'Запис задачі має некоректні дані. Зміни не виконані.',
  };
  return Object.hasOwn(messages, error?.code) ? messages[error.code] : null;
}

export function todoDisplayText(text, limit = 500) {
  const value = String(text).replace(/\s+/g, ' ').replace(/([\\`*_~|>])/g, '\\$1');
  if (value.length <= limit) return value;
  return value.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/, '') + '…';
}

export function renderList(todos) {
  if (todos.length === 0) return '📭 Список порожній. Додай задачу: `/todo add`';
  const rows = todos.slice(0, SHOWN_ITEMS).map((todo, index) =>
    `${index + 1}. ${todo.done ? '✅' : '⬜'} ${todoDisplayText(todo.text, 65)}${todo.createdAt === null ? ' (без дати)' : ''}`);
  if (todos.length > SHOWN_ITEMS || todos.hasMore) rows.push(`Показано ${Math.min(todos.length, SHOWN_ITEMS)} із ${todos.length}${todos.hasMore ? '+' : ''}. Прибери виконані через /todo clear.`);
  return rows.join('\n');
}

export function createTodoService({ db, serverTimestamp, randomId, now = Date.now }) {
  const views = new Map();
  const collection = () => db.collection(COLLECTION);
  const checkUser = userId => { if (!identifier(userId)) fail('todo-record-invalid'); };
  const project = (snapshot, userId) => {
    const value = snapshot.data();
    if (!identifier(snapshot.id) || value?.userId !== userId || typeof value.text !== 'string'
        || value.text.length > 10000 || typeof value.done !== 'boolean') fail('todo-record-invalid');
    return { id: snapshot.id, userId, text: value.text, done: value.done, createdAt: millis(value.createdAt) };
  };

  async function listTodos(userId) {
    checkUser(userId);
    const snap = await collection().where('userId', '==', userId).limit(MAX_ITEMS + 1).get();
    const rows = snap.docs.slice(0, MAX_ITEMS).map(doc => project(doc, userId));
    rows.sort((a, b) => (a.createdAt ?? Infinity) - (b.createdAt ?? Infinity) || a.id.localeCompare(b.id));
    if (snap.docs.length > MAX_ITEMS) Object.defineProperty(rows, 'hasMore', { value: true });
    return rows;
  }

  async function addTodo(userId, text) {
    checkUser(userId);
    if (typeof text !== 'string' || !text.trim() || text.length > 500) fail('todo-text-invalid');
    if ((await listTodos(userId)).length >= MAX_ITEMS) fail('todo-limit');
    const id = randomId();
    if (!identifier(id)) fail('todo-record-invalid');
    await collection().doc(id).set({ id, userId, text: text.trim(), done: false, createdAt: serverTimestamp() });
  }

  // Called only after the numbered list was successfully sent to Discord.
  function rememberTodoList(userId, todos) {
    checkUser(userId);
    for (const [key, view] of views) if (now() - view.at >= SNAPSHOT_MS) views.delete(key);
    views.delete(userId);
    if (views.size >= 1000) views.delete(views.keys().next().value);
    views.set(userId, { at: now(), rows: todos.slice(0, SHOWN_ITEMS).map(todo => ({ id: todo.id, fingerprint: fingerprint(todo) })) });
  }

  async function markDone(userId, number) {
    checkUser(userId);
    if (!Number.isSafeInteger(number) || number < 1 || number > SHOWN_ITEMS) return null;
    const view = views.get(userId);
    if (!view || now() - view.at >= SNAPSHOT_MS) fail('todo-relist');
    const selected = view.rows[number - 1];
    if (!selected) return null;
    const ref = collection().doc(selected.id);
    return db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (!current.exists) fail('todo-relist');
      const data = current.data();
      if (data.userId !== userId) fail('todo-relist');
      const todo = project(current, userId);
      if (fingerprint(todo) !== selected.fingerprint) fail('todo-relist');
      if (!data.done) tx.update(ref, { done: true, doneAt: serverTimestamp() });
      return todo;
    });
  }

  async function clearDone(userId) {
    checkUser(userId);
    const todos = await listTodos(userId);
    let removed = 0;
    let failed = 0;
    for (const todo of todos.filter(item => item.done)) {
      try {
        const deleted = await db.runTransaction(async tx => {
          const ref = collection().doc(todo.id);
          const snap = await tx.get(ref);
          if (!snap.exists) return false;
          const current = snap.data();
          if (current.userId !== userId || current.done !== true) return false;
          tx.delete(ref);
          return true;
        });
        if (deleted) removed++;
      } catch { failed++; }
    }
    views.delete(userId);
    return { removed, failed, ...(todos.hasMore ? { hasMore: true } : {}) };
  }
  return { addTodo, listTodos, markDone, clearDone, rememberTodoList };
}
