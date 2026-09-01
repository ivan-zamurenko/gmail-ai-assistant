import test from 'node:test';
import assert from 'node:assert/strict';

import { depotLookup } from '../../src/depot/lookup.js';

test('lookup requires the zero marker before searching a legacy eight-digit number', async () => {
  const original = new Map();
  for (const key of ['window', 'document', 'DOMParser', 'fetch']) {
    original.set(key, {
      exists: Object.hasOwn(globalThis, key),
      value: globalThis[key],
    });
  }
  const requests = [];
  const emptyResults = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  globalThis.window = {
    location: {
      href: 'https://depot.invalid/home?session=synthetic&UID=synthetic',
      search: '?session=synthetic&UID=synthetic',
    },
  };
  globalThis.document = {
    getElementById: (id) => id === 'ConQSearchForm'
      ? { action: 'https://depot.invalid/search' }
      : null,
  };
  globalThis.DOMParser = class {
    parseFromString() {
      return emptyResults;
    }
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, text: async () => 'synthetic-empty-results' };
  };

  try {
    const results = await depotLookup(['12345678', '012345678']);

    assert.deepEqual(results[0], {
      query: '12345678',
      ok: false,
      reason: '8-digit numbers require a leading zero marker',
    });
    assert.equal(requests.length, 1);
    const body = new globalThis.URLSearchParams(requests[0].options.body);
    assert.equal(body.get('con-quick-search'), '12345678');
    assert.deepEqual(results[1], {
      query: '12345678',
      ok: false,
      reason: '0 matches',
    });
  } finally {
    for (const [key, state] of original) {
      if (state.exists) globalThis[key] = state.value;
      else delete globalThis[key];
    }
  }
});
