const UNKNOWN_INDEX = /_unknown-(\d+)/;

/**
 * Resolves root/YYYY/MM and caches the names already stored there.
 * In dry-run, missing folders stay virtual and no create callback is invoked.
 */
export function createMonthFolderResolver({
  rootId,
  dryRun,
  findFolder,
  createFolder,
  listNames,
}) {
  const cache = new Map();

  async function resolveFolder(name, parentId) {
    const existingId = await findFolder(name, parentId);
    if (existingId || dryRun) return existingId;
    return createFolder(name, parentId);
  }

  return async function forDate(date) {
    const year = date.slice(0, 4);
    const month = date.slice(5, 7);
    const key = `${year}/${month}`;
    if (cache.has(key)) return cache.get(key);

    const yearId = await resolveFolder(year, rootId);
    const monthId = yearId ? await resolveFolder(month, yearId) : null;
    const names = monthId ? await listNames(monthId) : [];
    const unknowns = names
      .map((name) => name.match(UNKNOWN_INDEX)?.[1])
      .filter(Boolean)
      .map(Number);

    const entry = {
      id: monthId,
      path: key,
      taken: new Set(names),
      unknown: unknowns.length ? Math.max(...unknowns) : 0,
    };
    cache.set(key, entry);
    return entry;
  };
}
