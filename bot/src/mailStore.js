/** Local cache of mail shown in Discord (bot Mac only, gitignored, 7-day retention). */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const MAIL_RETENTION_MS = 7 * 24 * 60 * 60_000;

export function createMailStore({ path, now = Date.now, read = readFileSync, write = writeFileSync } = {}) {
  let entries = {};
  try { entries = path ? JSON.parse(read(path, 'utf8')) : {}; } catch { entries = {}; }
  const save = () => {
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true });
    write(path, JSON.stringify(entries), { mode: 0o600 });
  };
  return {
    has: id => Object.hasOwn(entries, id),
    get: id => (Object.hasOwn(entries, id) ? entries[id] : null),
    put(entry) { entries[entry.id] = entry; save(); },
    update(id, fields) { if (Object.hasOwn(entries, id)) { entries[id] = { ...entries[id], ...fields }; save(); } },
    open: () => Object.values(entries).filter(entry => !entry.handled && !entry.hidden).sort((a, b) => b.seenAt - a.seenAt),
    prune() {
      const before = Object.keys(entries).length;
      entries = Object.fromEntries(Object.entries(entries).filter(([, entry]) => now() - entry.seenAt < MAIL_RETENTION_MS));
      if (Object.keys(entries).length !== before) save();
    },
  };
}
