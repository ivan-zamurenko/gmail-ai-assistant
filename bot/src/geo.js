/**
 * bot/src/geo.js
 * ==============
 * The bot's geo helpers: validate an Eircode, resolve it to a point, and
 * measure the straight-line gap to the scan's drop location.
 *
 * Only Google Geocoding knows Eircodes (OpenStreetMap/Nominatim does not), so
 * geocode() needs a Google Maps key. Swapping providers touches only this file.
 */

// Eircode: 3-char routing key + 4-char unique id. The unique id never uses
// B G I J L O Q S U Z, so placeholders like ZZZZ fail this on their own.
const EIRCODE = /^[AC-FHKNPRTV-Y][0-9][0-9W][0-9AC-FHKNPRTV-Y]{4}$/;

export function normEircode(postCode) {
  const s = (typeof postCode === 'string' ? postCode : '').replace(/\s+/g, '').toUpperCase();
  return EIRCODE.test(s) ? s : null;
}

const validPoint = point => point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
  && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
const validKey = key => typeof key === 'string' && key.trim().length > 0;
const fail = code => { const error = new Error('Optional Maps unavailable'); error.code = code; throw error; };
const FAILURE_CODES = new Set(['TIMEOUT', 'HTTP', 'INVALID_RESPONSE', 'SIZE_LIMIT', 'NO_RESULT']);

/** One attempt; deadline includes response-body reads even if a provider ignores abort. */
async function request(url, kind, { timeoutMs = 1000 } = {}) {
  const controller = new globalThis.AbortController();
  const limit = kind === 'image' ? 2_000_000 : 256_000;
  let timer;
  let reader;
  try {
    const work = (async () => {
      const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
      if (controller.signal.aborted) {
        if (response.body) void response.body.cancel().catch(() => {});
        fail('TIMEOUT');
      }
      if (!response.ok) fail('HTTP');
      const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (mime !== (kind === 'image' ? 'image/png' : 'application/json')) fail('INVALID_RESPONSE');
      const declared = Number(response.headers.get('content-length'));
      if (declared > limit) fail('SIZE_LIMIT');
      if (!response.body) fail('INVALID_RESPONSE');
      reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) fail('SIZE_LIMIT');
        chunks.push(Buffer.from(value));
      }
      const bytes = Buffer.concat(chunks);
      if (kind === 'image') {
        const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature)
            || bytes.toString('ascii', 12, 16) !== 'IHDR'
            || bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND') fail('INVALID_RESPONSE');
        return bytes;
      }
      let data;
      try { data = JSON.parse(bytes.toString('utf8')); } catch { fail('INVALID_RESPONSE'); }
      if (!data || !['OK', 'ZERO_RESULTS'].includes(data.status) || !Array.isArray(data.results)
          || (data.status === 'ZERO_RESULTS' && data.results.length !== 0)
          || data.results.length > 100 || data.results.some(value => !value || typeof value !== 'object')) fail('INVALID_RESPONSE');
      return data;
    })();
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        const error = new Error('Optional Maps timeout'); error.code = 'TIMEOUT'; reject(error);
      }, Number.isFinite(timeoutMs) ? Math.max(1, Math.min(1000, timeoutMs)) : 1000);
    });
    return await Promise.race([work, deadline]);
  } catch (error) {
    console.warn('[maps] UNAVAILABLE', FAILURE_CODES.has(error?.code) ? error.code : 'REQUEST_FAILED');
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}

/** Resolves a validated Eircode, or null when optional Maps is unavailable. */
export async function geocode(query, apiKey, options) {
  const eircode = normEircode(query);
  if (!validKey(apiKey) || !eircode) return null;
  const url = 'https://maps.googleapis.com/maps/api/geocode/json'
    + `?components=country:IE&address=${encodeURIComponent(eircode)}&key=${encodeURIComponent(apiKey)}`;
  const data = await request(url, 'json', options);
  if (!data) return null;
  const loc = data.results[0]?.geometry?.location;
  if (!validPoint(loc)) {
    console.warn('[maps] UNAVAILABLE', 'NO_RESULT');
    return null;
  }
  return { lat: loc.lat, lng: loc.lng };
}

/** Nearest approximate Eircode; three query variants, never retry provider failure. */
export async function reverseGeocode(point, apiKey, options) {
  if (!validKey(apiKey) || !validPoint(point)) return null;
  const baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json'
    + `?latlng=${point.lat},${point.lng}&region=ie&key=${encodeURIComponent(apiKey)}`;
  const urls = [baseUrl, baseUrl + '&result_type=street_address|premise|subpremise|route', baseUrl + '&result_type=postal_code'];
  const candidates = [];
  let fallback = null;
  for (const url of urls) {
    const data = await request(url, 'json', options);
    if (!data) break;
    for (const result of data.results) {
      const components = Array.isArray(result.address_components) ? result.address_components : [];
      const values = [
        ...components.filter(component => Array.isArray(component?.types) && component.types.includes('postal_code'))
          .flatMap(component => [component.long_name, component.short_name]),
        result.formatted_address,
      ].filter(value => typeof value === 'string');
      const eircode = values.flatMap(value => [normEircode(value), ...(value.match(/[A-Z0-9]{3}\s?[A-Z0-9]{4}/gi) ?? []).map(normEircode)]).find(Boolean);
      if (eircode && !fallback) fallback = eircode;
      const location = result.geometry?.location;
      if (eircode && validPoint(location)) candidates.push({ eircode, distance: haversineKm(point, location) });
    }
  }
  return candidates.sort((a, b) => a.distance - b.distance)[0]?.eircode ?? fallback;
}

/** Great-circle distance in km — one formula, no library needed. */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

/**
 * PNG of the two points joined by a line, fetched server-side so the key never
 * reaches Discord. Needs the Maps Static API enabled. Returns a Buffer or null.
 * `drop` is the scan (red S), `addr` is the delivery address (blue D).
 */
export async function mapImage(drop, addr, apiKey, options) {
  if (!validKey(apiKey) || !validPoint(drop) || !validPoint(addr)) return null;

  // Under 300 m the two pins overlap and hide the whole map — shrink them.
  const size = haversineKm(drop, addr) < 0.3 ? 'small' : 'mid';

  const url = 'https://maps.googleapis.com/maps/api/staticmap'
    + '?size=640x400&scale=2&format=png32'
    // Drop POI/transit clutter so the two points and the road between them read clearly.
    + '&style=feature:poi|visibility:off'
    + '&style=feature:transit|visibility:off'
    + `&markers=size:${size}|color:red|label:S|${drop.lat},${drop.lng}`
    + `&markers=size:${size}|color:blue|label:D|${addr.lat},${addr.lng}`
    + `&path=color:0x1a73e8ff|weight:4|${drop.lat},${drop.lng}|${addr.lat},${addr.lng}`
    + `&key=${encodeURIComponent(apiKey)}`;

  return request(url, 'image', options);
}
