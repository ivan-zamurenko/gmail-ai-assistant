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
  const s = (postCode || '').replace(/\s+/g, '').toUpperCase();
  return EIRCODE.test(s) ? s : null;
}

/** Resolves a query (Eircode) to a point via Google, or null when unavailable. */
export async function geocode(query, apiKey) {
  if (!apiKey || !query) return null;

  const url = 'https://maps.googleapis.com/maps/api/geocode/json'
    + `?components=country:IE&address=${encodeURIComponent(query)}&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const loc = data.results?.[0]?.geometry?.location;
  return loc ? { lat: loc.lat, lng: loc.lng } : null;
}

/**
 * The Eircode nearest a point, or null. Eircodes are per-address, so a scan's
 * GPS can land on a neighbour: treat the answer as "roughly here", not exact.
 */
export async function reverseGeocode(point, apiKey) {
  if (!apiKey || !point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;

  const baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json'
    + `?latlng=${point.lat},${point.lng}&region=ie&key=${apiKey}`;

  const urls = [
    baseUrl,
    baseUrl + '&result_type=street_address|premise|subpremise|route',
    baseUrl + '&result_type=postal_code',
  ];

  const candidates = [];
  let fallback = null;
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) continue;

    const data = await res.json();
    for (const result of data.results ?? []) {
      const values = [
        ...(result.address_components ?? [])
          .filter((component) => component.types?.includes('postal_code'))
          .flatMap((component) => [component.long_name, component.short_name]),
        result.formatted_address,
      ];
      const eircode = values.flatMap((value) => [
        normEircode(value),
        ...(String(value ?? '').match(/[A-Z0-9]{3}\s?[A-Z0-9]{4}/gi) ?? []).map(normEircode),
      ]).find(Boolean);
      if (eircode && !fallback) fallback = eircode;
      const location = result.geometry?.location;
      if (eircode && Number.isFinite(location?.lat) && Number.isFinite(location?.lng)) {
        candidates.push({ eircode, distance: haversineKm(point, location) });
      }
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
  return R * 2 * Math.asin(Math.sqrt(h));
}

/**
 * PNG of the two points joined by a line, fetched server-side so the key never
 * reaches Discord. Needs the Maps Static API enabled. Returns a Buffer or null.
 * `drop` is the scan (red S), `addr` is the delivery address (blue D).
 */
export async function mapImage(drop, addr, apiKey) {
  if (!apiKey || !drop || !addr) return null;

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
    + `&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
