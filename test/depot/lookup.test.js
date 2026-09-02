import test from 'node:test';
import assert from 'node:assert/strict';

import { depotLookup } from '../../src/depot/lookup.js';

async function withLookupDocument(doc, run) {
  const original = new Map();
  for (const key of ['window', 'document', 'DOMParser', 'fetch']) {
    original.set(key, { exists: Object.hasOwn(globalThis, key), value: globalThis[key] });
  }
  const requests = [];
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
  globalThis.DOMParser = class { parseFromString() { return doc; } };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, text: async () => 'synthetic-result' };
  };

  try {
    return await run(requests);
  } finally {
    for (const [key, state] of original) {
      if (state.exists) globalThis[key] = state.value;
      else delete globalThis[key];
    }
  }
}

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

test('identity-only lookup returns exact direct and list targets without loading scan history', async () => {
  const direct = {
    getElementById: (id) => ({
      hiddenConsBarcodeValue: { value: '123456789' },
      hiddenConsIdValue: { value: '7654321' },
    })[id] ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  await withLookupDocument(direct, async (requests) => {
    assert.deepEqual(await depotLookup(['123456789'], { identityOnly: true }), [{
      query: '123456789', ok: true, consNumber: '123456789', consId: '7654321',
    }]);
    assert.equal(requests.length, 1);
  });

  const exactLink = {
    textContent: '123456789',
    getAttribute: () => '/woConsignmentDetails.p?ConsId=7654321',
  };
  const list = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (selector) => selector.startsWith('#MAINTABLE') ? [exactLink] : [],
  };

  await withLookupDocument(list, async (requests) => {
    assert.deepEqual(await depotLookup(['123456789'], { identityOnly: true }), [{
      query: '123456789', ok: true, consId: '7654321', consNumber: '123456789',
    }]);
    assert.equal(requests.length, 1);
  });
});

test('identity-only lookup rejects a lone substring hit', async () => {
  const substringLink = {
    textContent: '912345678',
    getAttribute: () => '/woConsignmentDetails.p?ConsId=7654321',
  };
  const list = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (selector) => selector.startsWith('#MAINTABLE') ? [substringLink] : [],
  };

  await withLookupDocument(list, async (requests) => {
    assert.deepEqual(await depotLookup(['123456789'], { identityOnly: true }), [{
      query: '123456789', ok: false, reason: '0 matches',
    }]);
    assert.equal(requests.length, 1);
  });
});

test('full lookup still loads Scanning History', async () => {
  const direct = {
    getElementById: (id) => ({
      hiddenConsBarcodeValue: { value: '123456789' },
      hiddenConsIdValue: { value: '7654321' },
    })[id] ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  await withLookupDocument(direct, async (requests) => {
    const [result] = await depotLookup(['123456789']);
    assert.equal(result.reason, 'no scans');
    assert.equal(requests.length, 2);
    assert.match(String(requests[1].url), /woScanningHistoryList\.p/);
  });
});
