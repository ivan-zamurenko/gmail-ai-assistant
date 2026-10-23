// Minimal per-test fakes for the extension's external boundaries: fetch and the
// chrome.storage / chrome.identity APIs. Each helper registers its own restore
// with t.after, so nothing leaks into the next test.

import { blockedFetch } from './networkGuard.js';

/**
 * Allows only the listed requests. Each route is consumed once; anything else
 * rejects like the global guard and is recorded as unexpected.
 *
 * @param {import('node:test').TestContext} t
 * @param {{ method?: string, url: string, status?: number, json?: unknown }[]} routes
 */
export function useFetch(t, routes) {
  const pending = routes.map((route) => ({ method: 'GET', status: 200, ...route }));
  const calls = [];
  const unexpected = [];
  const previous = globalThis.fetch;

  globalThis.fetch = async (url, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const index = pending.findIndex((r) => r.url === url && r.method === method);
    if (index === -1) {
      unexpected.push({ method, url });
      return blockedFetch(url, init);
    }
    const [route] = pending.splice(index, 1);
    calls.push({
      method,
      url,
      headers: { ...init.headers },
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    });
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      statusText: `synthetic ${route.status}`,
      json: async () => globalThis.structuredClone(route.json ?? {}),
    };
  };
  t.after(() => { globalThis.fetch = previous; });

  return { calls, unexpected, unused: () => pending.map(({ method, url }) => ({ method, url })) };
}

/**
 * Fresh chrome.storage.local and chrome.identity for one test.
 *
 * @param {import('node:test').TestContext} t
 * @param {{ storage?: Record<string, unknown>, token?: string, tokenError?: string }} [options]
 */
export function useChrome(t, { storage = {}, token = 'synthetic-token', tokenError } = {}) {
  const data = globalThis.structuredClone(storage);
  const tokenRequests = [];
  const runtime = { lastError: undefined };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'chrome');

  globalThis.chrome = {
    runtime,
    storage: {
      local: {
        async get(keys) {
          if (keys == null) return globalThis.structuredClone(data);
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, globalThis.structuredClone(data[k])]));
        },
        async set(items) { Object.assign(data, globalThis.structuredClone(items)); },
        async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
      },
    },
    identity: {
      getAuthToken(options, callback) {
        tokenRequests.push(options);
        runtime.lastError = tokenError ? { message: tokenError } : undefined;
        callback(tokenError ? undefined : token);
        runtime.lastError = undefined;
      },
    },
  };
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'chrome', previous);
    else delete globalThis.chrome;
  });

  return { data, tokenRequests };
}
