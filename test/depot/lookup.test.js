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
      href: 'http://synthetic.interlink.local/home?session=synthetic&UID=synthetic',
      search: '?session=synthetic&UID=synthetic',
    },
  };
  globalThis.document = {
    getElementById: (id) => id === 'ConQSearchForm'
      ? { action: 'http://synthetic.interlink.local/search' }
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
    getElementById: id => id === 'MAINTABLE' ? {} : null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  globalThis.window = {
    location: {
      href: 'http://synthetic.interlink.local/home?session=synthetic&UID=synthetic',
      search: '?session=synthetic&UID=synthetic',
    },
  };
  globalThis.document = {
    getElementById: (id) => id === 'ConQSearchForm'
      ? { action: 'http://synthetic.interlink.local/search' }
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
    getElementById: id => id === 'MAINTABLE' ? {} : null,
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
    getElementById: id => id === 'MAINTABLE' ? {} : null,
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
    globalThis.DOMParser = class { parseFromString() { return requests.length === 1 ? direct : fixtureDoc({ table: true }); } };
    const [result] = await depotLookup(['123456789']);
    assert.equal(result.reason, 'no scans');
    assert.equal(requests.length, 2);
    assert.match(String(requests[1].url), /woScanningHistoryList\.p/);
  });
});

test('the injected lookup carries no POD credentials or third-party API calls', () => {
  // depotLookup runs in the depot page MAIN world, where page scripts can patch
  // fetch/btoa. Credentials and external API calls must stay in the extension.
  const injected = depotLookup.toString();
  for (const forbidden of ['podAuth', 'Authorization', 'api2.dpd.ie', 'papi.dpd.ie', 'btoa(']) {
    assert.ok(!injected.includes(forbidden), `injected depotLookup contains ${forbidden}`);
  }
});


test('lookup failure excludes raw provider body after injected function serialization', async () => {
  await withLookupDocument({}, async () => {
    globalThis.fetch = async () => { throw new Error('<html>synthetic-secret UID=synthetic-user</html>'); };
    const injected = (0, eval)(`(${depotLookup.toString()})`);
    const result = await injected(['123456789']);
    assert.equal(result[0].ok, false);
    assert.equal(result[0].reason, 'Lookup failed');
  });
});

// Synthetic DOM contract fixtures; no browser HTML parser or live depot data.
function fixtureDoc({ number, id, table = false, links = [], rows = [], login = false, status = 'DELIVERED', refs = [] } = {}) {
  const cell = value => ({ textContent: value, getAttribute: () => null });
  return {
    getElementById: key => ({ hiddenConsBarcodeValue: number ? { value: number } : null,
      hiddenConsIdValue: id ? { value: id } : null, MAINTABLE: table ? {} : null })[key] ?? null,
    querySelector: selector => selector.includes('type="password"') && login ? {} : null,
    querySelectorAll: selector => {
      if (selector === '#MAINTABLE a[href*="woConsignmentDetails.p"]') return links.map(([value, consId]) => ({ textContent: value, getAttribute: () => `/woConsignmentDetails.p?ConsId=${consId}` }));
      if (selector === '#MAINTABLE tbody tr') return rows;
      if (selector === '[href*="ConsId="], [action*="ConsId="]') return [...refs, ...links.map(([, id]) => id)].map(id => ({ getAttribute: key => key === 'href' ? `/detail?ConsId=${id}` : null }));
      if (selector === 'h1 b') return [cell('Consignment'), cell(status)];
      if (selector === 'legend') return [{ textContent: 'Delivery Address', parentElement: { querySelectorAll: () => [{
        querySelector: () => cell('Contact'), cloneNode: () => ({ textContent: 'Synthetic Recipient', querySelectorAll: () => [] }),
      }] } }];
      return [];
    },
  };
}

async function lookupFixtures(docs, options = {}) {
  return withLookupDocument(docs[0], async requests => {
    let parsed = 0;
    globalThis.DOMParser = class { parseFromString() { return docs[parsed++]; } };
    const { runInNewContext } = await import('node:vm');
    const injected = runInNewContext(`(${depotLookup.toString()})`, {
      window: globalThis.window, document: globalThis.document, DOMParser: globalThis.DOMParser,
      fetch: globalThis.fetch, URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams,
    });
    const result = await injected(['123456789'], options);
    return { result: JSON.parse(JSON.stringify(result[0])), count: requests.length };
  });
}

test('serialized lookup separates login, unsupported, empty and ambiguous search responses', async () => {
  for (const identityOnly of [false, true]) {
    for (const [doc, reason] of [
      [fixtureDoc({ login: true }), 'Depot login required'],
      [fixtureDoc(), 'Unsupported depot response'],
      [fixtureDoc({ table: true, rows: [{}] }), 'Unsupported depot response'],
      [fixtureDoc({ table: true }), '0 matches'],
      [fixtureDoc({ table: true, links: [['123456789', '1'], ['123456789', '2']], refs: ['1', '2'] }), '2 matches'],
      [fixtureDoc({ table: true, links: [['123456789', 'invalid']] }), 'Unsupported depot response'],
    ]) {
      const { result, count } = await lookupFixtures([doc], { identityOnly });
      assert.equal(result.ok, false);
      assert.equal(result.reason, reason);
      assert.equal(result.consNumber, undefined);
      assert.equal(count, 1);
      assert.doesNotMatch(result.reason, /synthetic|session|UID|123456789/);
    }
  }
});

test('full lookup rejects foreign identity and malformed detail or scan results before success', async () => {
  for (const [docs, reason, count] of [
    [[fixtureDoc({ number: '987654321', id: '1' })], '0 matches', 1],
    [[fixtureDoc({ table: true, links: [['987654321', '1']] })], '0 matches', 1],
    [[fixtureDoc({ number: '123456789' })], 'Unsupported depot response', 1],
    [[fixtureDoc({ number: '123456789', refs: ['1', '2'] })], 'Unsupported depot response', 1],
    [[fixtureDoc({ table: true, links: [['123456789', '1']] }), fixtureDoc({ number: '987654321', id: '1' })], 'Unsupported depot response', 2],
    [[fixtureDoc({ table: true, links: [['123456789', '1']] }), fixtureDoc({ number: '123456789', id: '2' })], 'Unsupported depot response', 2],
    [[fixtureDoc({ number: '123456789', id: '1' }), fixtureDoc({ login: true })], 'Depot login required', 2],
    [[fixtureDoc({ number: '123456789', id: '1' }), fixtureDoc()], 'Unsupported depot response', 2],
    [[fixtureDoc({ number: '123456789', id: '1' }), fixtureDoc({ table: true, rows: [{ querySelectorAll: () => [] }] })], 'Unsupported depot response', 2],
  ]) {
    const response = await lookupFixtures(docs);
    assert.equal(response.result.reason, reason);
    assert.equal(response.result.ok, false);
    assert.equal(response.result.consNumber, undefined);
    assert.equal(response.count, count);
  }
});

test('serialized successful lookup preserves scan, address, drop and timing fields', async () => {
  const values = ['', 'R1', 'D1', '', '28/10/2026 10:00', '', '', '1', '', '', 'Bay: 3', 'Signed'];
  const row = {
    querySelectorAll: () => values.map((value, index) => ({ textContent: value, innerHTML: '', getAttribute: key => index === 3 && key === 'title' ? 'Delivered' : null })),
    querySelector: () => ({ getAttribute: () => 'https://openstreetmap.org/?mlat=53&mlon=-6' }),
  };
  const { result, count } = await lookupFixtures([
    fixtureDoc({ number: '123456789', refs: ['1', '1'] }), fixtureDoc({ table: true, rows: [row] }),
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.consNumber, '123456789');
  assert.equal(result.consId, '1');
  assert.equal(result.scanCount, 1);
  assert.equal(result.scans[0].parcel, '1');
  assert.equal(result.lastScan.bay, '3');
  assert.deepEqual(result.drop, { lat: 53, lng: -6, type: 'Delivered', date: '28/10/2026', time: '10:00' });
  assert.equal(result.address.contact, 'Synthetic Recipient');
  assert.deepEqual(Object.keys(result.timing), ['search', 'detail', 'scans']);
  assert.equal(count, 2);
});
