// Shared by the test preload and the per-test fake fetch. No side effects here:
// the global guard is installed only by noNetwork.js via `node --test --import`.

export const NETWORK_BLOCKED = 'TEST_NETWORK_BLOCKED';

export function blockedFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  const method = (init.method ?? 'GET').toUpperCase();
  const error = new Error(`network blocked in tests: ${method} ${url}`);
  error.code = NETWORK_BLOCKED;
  return Promise.reject(error);
}
