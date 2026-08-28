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
    + '?size=640x400&scale=2'
    + `&markers=size:${size}|color:red|label:S|${drop.lat},${drop.lng}`
    + `&markers=size:${size}|color:blue|label:D|${addr.lat},${addr.lng}`
    + `&path=color:0x1a73e8ff|weight:4|${drop.lat},${drop.lng}|${addr.lat},${addr.lng}`
    + `&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
