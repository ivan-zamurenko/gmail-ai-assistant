import test from 'node:test';
import assert from 'node:assert/strict';

import { reverseGeocode } from '../../bot/src/geo.js';

async function withFetch(response, run) {
  const original = { exists: Object.hasOwn(globalThis, 'fetch'), value: globalThis.fetch };
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return { ok: response.ok ?? true, json: async () => response.body };
  };
  try {
    return await run(calls);
  } finally {
    if (original.exists) globalThis.fetch = original.value;
    else delete globalThis.fetch;
  }
}

test('reverseGeocode returns the first valid Eircode near a point', async () => {
  const body = {
    results: [
      { address_components: [{ long_name: 'Ireland', types: ['country'] }] },
      { address_components: [{ long_name: 'D02AF30', types: ['postal_code'] }] },
    ],
  };
  await withFetch({ body }, async (calls) => {
    const eircode = await reverseGeocode({ lat: 53.34, lng: -6.26 }, 'key');
    assert.equal(eircode, 'D02AF30');
    assert.match(calls[0], /latlng=53\.34,-6\.26/);
  });
});

test('reverseGeocode retries address results when the nearest result has no postal code', async () => {
  const body = {
    results: [{ formatted_address: 'Unnamed road, Ireland', address_components: [] }],
  };
  await withFetch({ body }, async (calls) => {
    const eircode = await reverseGeocode({ lat: 52.037612, lng: -9.994881 }, 'key');
    assert.equal(eircode, null);
    assert.equal(calls.length, 3);
    assert.match(calls[1], /result_type=street_address\|premise\|subpremise\|route/);
    assert.match(calls[2], /result_type=postal_code/);
  });
});

test('reverseGeocode can read an Eircode embedded in a formatted address', async () => {
  const body = {
    results: [{ formatted_address: 'Example House, V93 AE38, Ireland', address_components: [] }],
  };
  await withFetch({ body }, async () => {
    assert.equal(await reverseGeocode({ lat: 52.04, lng: -9.99 }, 'key'), 'V93AE38');
  });
});

test('reverseGeocode chooses the closest Eircode candidate', async () => {
  const body = {
    results: [
      { formatted_address: 'Far House, V93 AE38, Ireland', geometry: { location: { lat: 52.05, lng: -9.99 } } },
      { formatted_address: 'Near House, V93 AE39, Ireland', geometry: { location: { lat: 52.0401, lng: -9.9901 } } },
    ],
  };
  await withFetch({ body }, async () => {
    assert.equal(await reverseGeocode({ lat: 52.04, lng: -9.99 }, 'key'), 'V93AE39');
  });
});

test('reverseGeocode ignores non-Eircode postal codes', async () => {
  const body = { results: [{ address_components: [{ long_name: 'ZZZZ', types: ['postal_code'] }] }] };
  await withFetch({ body }, async () => {
    assert.equal(await reverseGeocode({ lat: 0, lng: 0 }, 'key'), null);
  });
});

test('reverseGeocode makes no request without a key or point', async () => {
  await withFetch({ body: {} }, async (calls) => {
    assert.equal(await reverseGeocode({ lat: 1, lng: 1 }, ''), null);
    assert.equal(await reverseGeocode(null, 'key'), null);
    assert.equal(calls.length, 0);
  });
});
