/** Shared exact-target collector for popup and Discord Drive-label scans. */

export const DEPOT_PROBE = '000000000';
const ANSWERED = /^\d+ matches$/;

function fatal(message) {
  return Object.assign(new Error(message), { fatal: true });
}

export function createLabelVerifier({ lookup, onRejected = () => {} }) {
  const seen = new Map();

  async function verify(number) {
    if (seen.has(number)) return Boolean(seen.get(number).consNumber);

    const result = await lookup(number);
    if (!result?.consNumber && !ANSWERED.test(result?.reason ?? '')) {
      throw fatal(`Depot is not responding — ${result?.reason ?? 'lookup returned nothing'}`);
    }

    const found = Boolean(result.consNumber);
    if (!found && number !== DEPOT_PROBE) onRejected(number, result.reason);
    seen.set(number, result);
    return found;
  }

  function targetsFor(numbers) {
    const targets = [];
    let unresolved = 0;

    for (const number of [...new Set(numbers)]) {
      const result = seen.get(number);
      if (!result?.consNumber || !result.consId) {
        unresolved += 1;
        continue;
      }
      targets.push({ consNumber: number, consId: result.consId, type: 'PopUp' });
    }
    return { targets, unresolved };
  }

  return { verify, targetsFor };
}
