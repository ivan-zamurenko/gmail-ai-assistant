/**
 * bot/src/render.js
 * =================
 * Turns a raw parcel (from the extension) into Discord embeds: colour = status
 * at a glance, depot details and paged scan history first, then recipient and
 * parcel-bound scan locations. POD belongs only in driver reports.
 */
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { scanMapImage } from './geo.js';

function statusStyle(status) {
  const s = (status || '').toLowerCase();
  if (/^delivered\b/.test(s)) return { color: 0x90ee90, badge: '🟩' };
  if (/goods held/.test(s)) return { color: 0xf1c40f, badge: '🟨' };
  if (/fail|carded|incorrect address|return to depot/.test(s)) return { color: 0xe74c3c, badge: '🟥' };
  if (/pending/.test(s)) return { color: 0xff8fcb, badge: '🩷' };
  return { color: 0x95a5a6, badge: '⬜' };
}
const colorFor = status => statusStyle(status).color;
const badgeFor = status => `${statusStyle(status).badge} **${status}**`;
const validCoords = point => Number.isFinite(point?.lat) && Math.abs(point.lat) <= 90
  && Number.isFinite(point?.lng) && Math.abs(point.lng) <= 180;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** DD/MM/YYYY → "27 Aug". */
function shortDate(date) {
  const [day, month] = (date || '').split('/');
  return day && month ? `${day} ${MONTHS[Number(month) - 1] ?? month}` : (date || '');
}

/** Keep the full clock — seconds tell two scans in the same minute apart. */
const hms = (time) => (time || '').slice(0, 8);
const coord = (value) => Number(value).toFixed(6);

export const MAX_HISTORY = 12;
export function findParcelNumbers(parcel) {
  return [...new Set((Array.isArray(parcel?.scans) ? parcel.scans : []).filter(s => numberedParcel(s?.parcel)).map(s => String(Number(s.parcel))))].sort((a,b) => Number(a)-Number(b));
}

/** DD/MM/YYYY + HH:MM:SS → sortable ms; string dates sort wrong (10/08 vs 07/08). */
function stamp({ date, time }) {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date || '');
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time || '');
  if (!d || !t) return NaN;
  const [, day, month, year] = d.map(Number);
  const [, hour, minute, second = 0] = t.map(value => value === undefined ? 0 : Number(value));
  if (hour > 23 || minute > 59 || second > 59) return NaN;
  const value = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(value);
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1
    && check.getUTCDate() === day ? value : NaN;
}

// Bounds are deliberately below Discord's per-field and aggregate limits.
function clean(value, max = 80) {
  if (typeof value !== 'string') return '';
  const safe = value.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, ' ').replace(/[`*~<>\\[\]()]/g, "'")
    .replace(/@(everyone|here)\b/gi, '＠$1').replace(/\s+/g, ' ').trim();
  // Discord budgets UTF-16 units; never cut an astral character in half.
  let result = '';
  for (const char of safe) {
    if (result.length + char.length > max) break;
    result += char;
  }
  return result;
}

const unknownScan = () => ({ type: 'Latest status unconfirmed', date: '', time: '', route: '' });
const numberedParcel = value => /^\d{1,6}$/.test(value || '') && Number(value) > 0;
function normalize(parcel) {
  const source = parcel && typeof parcel === 'object' ? parcel : {};
  const address = source.address && typeof source.address === 'object' ? source.address : {};
  const a = Object.fromEntries(['contact', 'company', 'town', 'county', 'postCode', 'depot', 'mobile', 'email']
    .map(key => [key, clean(address[key], 100)]));
  a.lines = (Array.isArray(address.lines) ? address.lines : []).slice(0, 5).map(value => clean(value, 100)).filter(Boolean);
  const scans = (Array.isArray(source.scans) ? source.scans : []).map(value => {
    const scan = value && typeof value === 'object' ? value : {};
    const validTime = Number.isFinite(stamp(scan));
    return {
      parcel: typeof scan.parcel === 'string' && /^\d{1,6}$/.test(scan.parcel) ? scan.parcel : '', type: clean(scan.type, 48) || 'Unknown status',
      date: validTime ? scan.date : '', time: validTime ? scan.time : '', route: clean(scan.route, 16),
      signature: clean(scan.signature, 80),
      coords: ['Delivered', 'Carded', 'Failed Delivery', 'Incorrect Address'].includes(scan.type) && numberedParcel(scan.parcel) && validCoords(scan.coords) ? { lat: scan.coords.lat, lng: scan.coords.lng } : null,
      bay: clean(scan.bay || /Bay:\s*([^,|]+)/i.exec(typeof scan.notes === 'string' ? scan.notes : '')?.[1], 12),
      sequence: clean(scan.sequence || /Sequence:\s*([^,|]+)/i.exec(typeof scan.notes === 'string' ? scan.notes : '')?.[1], 12),
      onwardBc: clean(onwardBc(scan), 20),
    };
  });
  return { consNumber: clean(source.consNumber, 20) || 'Unknown consignment',
    query: clean(source.query, 20) || '—', arrangedDate: clean(source.arrangedDate, 24), address: a, scans };
}


/** A redirected parcel gets a new onward barcode, tucked in the scan's notes tooltip. */
function onwardBc(scan) {
  if (scan?.onwardBc) return scan.onwardBc;
  const m = /Onward BC:\s*([^/\s]+)/i.exec(scan?.notes || '');
  return m ? m[1] : null;
}

/** CAD location: bay plus its physical sequence within that bay. */
function cadLocation(scan) {
  const notes = scan?.notes || ''; // compatibility with tasks created before structured fields
  const bay = scan?.bay || /Bay:\s*([^,|]+)/i.exec(notes)?.[1]?.trim();
  const sequence = scan?.sequence || /Sequence:\s*([^,|]+)/i.exec(notes)?.[1]?.trim();
  return [bay && `Bay:${bay}`, sequence && `Seq:${sequence}`].filter(Boolean).join(' ');
}

/** One consignment holds several parcels — return each parcel's latest scan, ordered 1..n. */
function byParcel(scans) {
  const latest = new Map();
  for (const s of scans) {
    if (!numberedParcel(s.parcel)) continue;
    const key = String(Number(s.parcel));
    const prev = latest.get(key);
    if (!prev || !Number.isFinite(stamp(s)) || (Number.isFinite(stamp(prev)) && stamp(s) >= stamp(prev))) latest.set(key, s);
  }
  return [...latest.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([parcel, lastScan]) => ({ parcel, lastScan: Number.isFinite(stamp(lastScan)) ? lastScan : unknownScan() }));
}

/** Route names like NearRoute are internal and should be hidden from operator-facing logs. */
function displayRoute(route) {
  return (route || '').toLowerCase() === 'nearroute' ? '' : (route || '');
}

/** Compact per-parcel statuses, without desktop-only ANSI tables. */
function parcelsBlock(parcels) {
  const lines = parcels.slice(0, 6).map(p => {
    const bc = onwardBc(p.lastScan);
    return `**Parcel ${p.parcel}** · ${badgeFor(p.lastScan.type)}\n${hms(p.lastScan.time) || 'Unknown time'}${bc ? ` · Onward ${bc}` : ''}`;
  });
  if (parcels.length > lines.length) lines.push(`… +${parcels.length - lines.length} parcels not shown`);
  return lines.join('\n\n');
}

const isNearestRoute = (scan) => /nearest route assigned/i.test(scan?.type || '');
function visibleScans(scans) {
  const relevant = scans.filter(scan => !isNearestRoute(scan));
  return relevant.some(scan => numberedParcel(scan.parcel)) ? relevant.filter(scan => !/^0+$/.test(scan.parcel)) : relevant;
}
export function findHistoryPages(parcel, parcelNumber) {
  const numbers = findParcelNumbers(parcel);
  if (!parcelNumber && numbers.length === 1) parcelNumber = numbers[0];
  if (!parcelNumber && numbers.length > 1) return 1;
  const scans = normalize(parcel).scans.filter(scan => !parcelNumber || String(Number(scan.parcel)) === parcelNumber);
  return Math.max(1, Math.ceil(visibleScans(scans).length / MAX_HISTORY));
}


/** Newest first with one aligned line per visible scan. */
function historyBlock(scans, showParcel, page = 0) {
  const rows = scans.map((scan, index) => ({ scan, index })).sort((a, b) => {
    const difference = (Number.isFinite(stamp(b.scan)) ? stamp(b.scan) : -Infinity)
      - (Number.isFinite(stamp(a.scan)) ? stamp(a.scan) : -Infinity);
    return difference || b.index - a.index;
  }).map(item => item.scan).filter((s) => !isNearestRoute(s)).slice(page * MAX_HISTORY, (page + 1) * MAX_HISTORY);
  const lines = rows.map(s => {
    const route = displayRoute(s.route);
    const location = cadLocation(s);
    const identity = showParcel ? (numberedParcel(s.parcel) ? `P${s.parcel}` : 'Unassigned') : '';
    const bc = onwardBc(s);
    const dateTime = Number.isFinite(stamp(s)) ? `${shortDate(s.date)} ${hms(s.time)}` : 'Unknown time';
    const context = [identity, route && `Route ${route}`, location, bc && `Onward ${bc}`].filter(Boolean).join(' · ');
    return `**${dateTime}** · ${badgeFor(s.type)}${context ? `\n${context}` : ''}`;
  });

  const hidden = Math.max(0, scans.filter((s) => !isNearestRoute(s)).length - (page * MAX_HISTORY + lines.length));
  if (hidden > 0) lines.push(`… +${hidden} ${scans.some(scan => !Number.isFinite(stamp(scan))) ? 'not shown' : 'earlier'}`);

  return lines.join('\n\n') || 'No scan history.';
}

/** The headline already carries status; this field gives its time and context. */
function lastEventLine(s) {
  const route = displayRoute(s.route);
  const bc = onwardBc(s);
  return [
    Number.isFinite(stamp(s)) ? `${shortDate(s.date)} ${hms(s.time)}` : 'Time unavailable',
    route && `Route ${route}`,
    s.signature && `Signed for by: ${s.signature}`,
    bc && `Onward barcode: ${bc}`,
    cadLocation(s),
  ].filter(Boolean).join('\n');
}

export async function buildParcelEmbed(parcel, apiKey, { parcelNumber, page = 0 } = {}) {
  if (Array.isArray(parcel?.scans) && parcel.scans.length > 1000) {
    return { embeds: [new EmbedBuilder().setTitle('Parcel data unavailable').setDescription('Scan limit exceeded; history was not truncated.')], files: [], allowedMentions: { parse: [] } };
  }
  const allParcelNumbers = findParcelNumbers(parcel);
  if (!parcelNumber && allParcelNumbers.length === 1) parcelNumber = allParcelNumbers[0];
  const overview = !parcelNumber && allParcelNumbers.length > 1;
  const unresolvedIdentity = visibleScans(normalize(parcel).scans).some(scan => !numberedParcel(scan.parcel) && !/^0+$/.test(scan.parcel));
  const selected = typeof parcelNumber === 'string' && allParcelNumbers.includes(parcelNumber);
  if (parcelNumber && !selected) throw new Error('Parcel selection unavailable');
  if (selected) parcel = { ...parcel, scans: parcel.scans.filter(scan => String(Number(scan?.parcel)) === parcelNumber) };
  parcel = normalize(parcel);
  const a = parcel.address;
  const consignee = [...new Set([a.contact, a.company].filter(Boolean))].join(', ');

  const scans = visibleScans(parcel.scans);
  const unknownIdentity = unresolvedIdentity || scans.some(sc => !numberedParcel(sc.parcel) && !/^0+$/.test(sc.parcel));
  // The honest current status is the latest real scan — the detail page goes stale
  // (still says "Delivered" after a later redirect).
  const invalidTime = scans.some(scan => !Number.isFinite(stamp(scan)));
  const s = !scans.length ? { ...unknownScan(), type: 'No scan history' }
    : invalidTime || unknownIdentity ? unknownScan() : scans.reduce((x, y) => (stamp(y) >= stamp(x) ? y : x));

  // Per-parcel view: how many parcels share the headline status (Delivered 1/2,
  // Redirected 2/2 …) — that count is what makes multi-parcel tracking honest.
  const parcels  = byParcel(scans);
  const multi    = parcels.length > 1;
  const matching = parcels.filter((p) => p.lastScan.type === s.type).length;
  const count    = multi && !invalidTime && !unknownIdentity ? ` (${matching}/${parcels.length})` : '';

  const desc = overview ? ['Select a parcel below to view its scan history.'] : [badgeFor(s.type)];
  if (unknownIdentity) desc.push('Some scans have an unassigned parcel identity; latest status cannot be confirmed.');
  if (invalidTime) desc.push('Some scan timestamps are invalid or missing; latest status cannot be confirmed.');

  const fields = overview ? [] : [{ name: 'Latest event', value: `${lastEventLine(s)}${cadLocation(s) ? '' : '\nDepot position: not recorded in latest scan'}` }];
  const details = [selected ? `Selected parcel: ${parcelNumber}` : `Parcels in scan history: ${allParcelNumbers.length || 'unknown'}`,
    parcel.arrangedDate && `Planned delivery: ${parcel.arrangedDate}`, a.depot && `Delivery depot: ${a.depot}`].filter(Boolean);
  fields.push({ name: 'Parcel details', value: details.join('\n') });
  if (multi) fields.push({ name: 'Parcels', value: parcelsBlock(parcels) });
  const recipientFields = [];

  const addressParts = [...new Set([...(a.lines ?? []), a.town, a.county].filter(Boolean))];
  recipientFields.push({ name: 'Delivery address', value: [consignee, ...addressParts, a.postCode].filter(Boolean).join('\n') || 'Address unavailable' });
  const contact = [a.mobile && `Phone: ${a.mobile}`, a.email].filter(Boolean);
  if (contact.length) recipientFields.push({ name: 'Contact', value: contact.join('\n') });
  const pageCount = Math.max(1, Math.ceil(scans.length / MAX_HISTORY));
  page = Math.min(Math.max(0, Number.isSafeInteger(page) ? page : 0), pageCount - 1);
  const historyStr = historyBlock(scans, multi || unknownIdentity, page);

  const mainEmbed = new EmbedBuilder()
    .setColor(overview ? 0x95a5a6 : colorFor(s.type))
    .setTitle(overview ? `📦 ${parcel.consNumber} · OVERVIEW` : `📦 ${parcel.consNumber}${selected ? ` · Parcel ${parcelNumber}` : ''} — ${s.type}${count}`)
    .setDescription(desc.join('\n\n') || null)
    .addFields(...fields);
  const notes = [];
  if (selected && allParcelNumbers.length > 1) desc.push(`Showing only Parcel ${parcelNumber}.`);
  mainEmbed.setDescription(desc.join('\n\n') || null);
  if (parcel.query !== '—' && parcel.query !== parcel.consNumber) notes.push(`Searched as ${parcel.query}`);
  if (notes.length) mainEmbed.setFooter({ text: notes.join(' · ') });

  const files = [];
  const locationEmbeds = [];
  // Never fall back to the unbound consignment-level drop. Invalid timestamps
  // make choosing a latest location unsafe, so keep the map unavailable.
  const located = !overview && selected && !invalidTime && !unknownIdentity
    ? scans.filter(scan => scan.coords) : [];
  let latestLocation = located.length ? located.reduce((x,y) => stamp(y) >= stamp(x) ? y : x) : null;
  if (latestLocation && located.some(scan => stamp(scan) === stamp(latestLocation)
    && (scan.type !== latestLocation.type || scan.coords.lat !== latestLocation.coords.lat || scan.coords.lng !== latestLocation.coords.lng))) latestLocation = null;
  if (latestLocation) {
    const point = latestLocation.coords;
    const location = new EmbedBuilder().setColor(colorFor(latestLocation.type))
      .setTitle(`📍 SCAN LOCATION — PARCEL ${parcelNumber}`)
      .setDescription(`${badgeFor(latestLocation.type)} · ${shortDate(latestLocation.date)} ${hms(latestLocation.time)}\n`
        + `${coord(point.lat)}, ${coord(point.lng)}\n\n`
        + `👉 [Open scan location](https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng})`)
      .setFooter({ text: latestLocation.type !== 'Delivered' ? 'Attempted delivery — parcel not confirmed at this point.' : 'Historical delivery scan — not a confirmed current location.' });
    const png = await scanMapImage(point, apiKey);
    if (png) {
      files.push(new AttachmentBuilder(png, { name: 'scan-location.png' }));
      location.setImage('attachment://scan-location.png');
    } else if (typeof apiKey === 'string' && apiKey.trim()) {
      location.setFooter({ text: `${location.data.footer.text} Map preview unavailable; navigation link still available.` });
    }
    locationEmbeds.push(location);
  }
  // History stays above recipient and optional media.
  const historyEmbed = new EmbedBuilder()
    .setColor(colorFor(s.type))
    .setTitle(selected ? `🕒 SCAN HISTORY — PARCEL ${parcelNumber}` : '🕒 UNASSIGNED SCANS')
    .setDescription(historyStr)
    .setFooter({ text: `Page ${page + 1} of ${pageCount} · ${scans.length} scans · newest first` });

  const recipientEmbed = new EmbedBuilder().setColor(overview ? 0x95a5a6 : colorFor(s.type)).setTitle('👤 Recipient').addFields(...recipientFields);
  const embeds = [mainEmbed, ...(!overview ? [historyEmbed] : []), ...locationEmbeds, recipientEmbed];
  const size = embeds.reduce((sum, embed) => {
    const data = embed.toJSON();
    return sum + (data.title?.length ?? 0) + (data.description?.length ?? 0)
      + (data.footer?.text.length ?? 0)
      + (data.fields ?? []).reduce((total, field) => total + field.name.length + field.value.length, 0);
  }, 0);
  if (size > 6000) {
    return { embeds: [new EmbedBuilder().setTitle('Parcel data unavailable').setDescription('Card display limit exceeded; request manual review.')], files: [], allowedMentions: { parse: [] } };
  }
  return { embeds, files, allowedMentions: { parse: [] } };
}
