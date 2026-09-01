/**
 * Persistent recovery queue for Drive-label reschedules.
 *
 * Photos are filed before the depot batch runs, so exact targets must survive
 * a popup close, expired depot session, or total batch failure. Only confirmed
 * CHANGE_DATE and intentional SKIP results leave the queue; errors and missing
 * results remain available for an operator-confirmed retry.
 */

export const LABEL_RESCHEDULE_RECOVERY_KEY = 'label_reschedule_recovery_v1';

function normalizeTargets(targets) {
  const unique = new Map();

  for (const target of Array.isArray(targets) ? targets : []) {
    const consNumber = String(target?.consNumber ?? '').trim();
    const consId = String(target?.consId ?? '').trim();
    if (!/^\d{9}$/.test(consNumber) || !/^\d+$/.test(consId)) continue;
    unique.set(consId, { consNumber, consId, type: 'PopUp' });
  }

  return [...unique.values()];
}

export function remainingRecoveryTargets(targets, result) {
  const completed = new Set(
    (Array.isArray(result?.results) ? result.results : [])
      .filter(entry => entry?.action === 'CHANGE_DATE' || entry?.action === 'SKIP')
      .map(entry => String(entry.consId ?? '').trim())
      .filter(consId => /^\d+$/.test(consId)),
  );

  return normalizeTargets(targets).filter(target => !completed.has(target.consId));
}

export async function loadRecoveryTargets(storage) {
  const stored = await storage.get(LABEL_RESCHEDULE_RECOVERY_KEY);
  const batch = stored?.[LABEL_RESCHEDULE_RECOVERY_KEY];
  return batch?.version === 1 ? normalizeTargets(batch.targets) : [];
}

async function replaceRecoveryTargets(storage, targets) {
  const normalized = normalizeTargets(targets);
  if (normalized.length === 0) {
    await storage.remove(LABEL_RESCHEDULE_RECOVERY_KEY);
    return [];
  }

  await storage.set({
    [LABEL_RESCHEDULE_RECOVERY_KEY]: {
      version: 1,
      updatedAt: new Date().toISOString(),
      targets: normalized,
    },
  });
  return normalized;
}

export async function addRecoveryTargets(storage, targets) {
  const existing = await loadRecoveryTargets(storage);
  return replaceRecoveryTargets(storage, [...existing, ...normalizeTargets(targets)]);
}

export async function applyRecoveryResult(storage, result) {
  const existing = await loadRecoveryTargets(storage);
  return replaceRecoveryTargets(storage, remainingRecoveryTargets(existing, result));
}
