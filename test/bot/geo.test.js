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
