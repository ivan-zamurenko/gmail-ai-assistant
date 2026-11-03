import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { reverseGeocode, geocode, mapImage, haversineKm } from '../../bot/src/geo.js';

async function withFetch(response, run) {
  const original = { exists: Object.hasOwn(globalThis, 'fetch'), value: globalThis.fetch };
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new globalThis.Response(JSON.stringify({ status: 'OK', ...response.body }), { status: response.ok === false ? 503 : 200, headers: { 'content-type': 'application/json' } });
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


test('optional Maps bounds failures, body timeouts, coordinates and image bytes without leaking keys', async (t) => {
  const key = 'SYNTHETIC_MAP_SECRET';
  const warnings = [];
  t.mock.method(globalThis.console, 'warn', (...args) => warnings.push(args));
  const point = { lat: 53, lng: -6 };
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  const json = body => new globalThis.Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  for (const fetcher of [
    async () => { throw new Error(key); },
    async () => new globalThis.Response('', { status: 503 }),
    async () => new globalThis.Response('{', { headers: { 'content-type': 'application/json' } }),
    async () => json({ status: 'REQUEST_DENIED', results: [{ geometry: { location: point } }] }),
    async () => json({ status: 'ZERO_RESULTS', results: [{ geometry: { location: point } }] }),
    async () => json({ status: 'OK', results: [{ geometry: { location: { lat: 100, lng: -6 } } }] }),
  ]) {
    globalThis.fetch = async (...args) => { calls++; return fetcher(...args); };
    assert.equal(await geocode('D02AF30', key), null);
  }
  let signal;
  globalThis.fetch = async (_url, options) => { signal = options.signal; return new Promise(() => {}); };
  assert.equal(await geocode('D02AF30', key, { timeoutMs: 5 }), null);
  assert.equal(signal.aborted, true);
  globalThis.fetch = async (_url, options) => { signal = options.signal; return new globalThis.Response(new globalThis.ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } }); };
  assert.equal(await geocode('D02AF30', key, { timeoutMs: 5 }), null);
  assert.equal(signal.aborted, true);
  calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error(key); };
  assert.equal(await reverseGeocode(point, key), null);
  assert.equal(calls, 1, 'provider failure must not trigger three variants');
  calls = 0;
  assert.equal(await geocode('invalid', key), null);
  assert.equal(await mapImage({ lat: 91, lng: 0 }, point, key), null);
  assert.equal(await reverseGeocode({ lat: 0, lng: 181 }, key), null);
  assert.equal(calls, 0);
  for (const [bytes, mime] of [[Buffer.from('not image'), 'image/png'], [Buffer.alloc(2_000_001), 'image/png'], [Buffer.from('error'), 'text/html']]) {
    globalThis.fetch = async () => new globalThis.Response(bytes, { headers: { 'content-type': mime } });
    assert.equal(await mapImage(point, { lat: 54, lng: -7 }, key), null);
  }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=', 'base64');
  globalThis.fetch = async () => new globalThis.Response(png, { headers: { 'content-type': 'image/png' } });
  assert.deepEqual(await mapImage(point, { lat: 54, lng: -7 }, key), png);
  assert.equal(haversineKm(point, point), 0);
  assert.ok(Math.abs(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111.195) < 0.01);
  assert.ok(Number.isFinite(haversineKm({ lat: 90, lng: 0 }, { lat: -90, lng: 180 })));
  assert.ok(warnings.length);
  assert.doesNotMatch(JSON.stringify(warnings), /SYNTHETIC_MAP_SECRET|https:|53|longitude/);
});
