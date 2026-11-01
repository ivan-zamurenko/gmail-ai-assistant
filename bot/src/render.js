/**
 * bot/src/render.js
 * =================
 * Turns a raw parcel (from the extension) into Discord embeds: colour = status
 * at a glance, distance + map on the main card, and the full scan history in a
 * second embed underneath (an embed pins its image to the bottom, so history
 * lives in its own embed to sit below the map).
 */
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { fileURLToPath, URL } from 'node:url';

import { normEircode, geocode, reverseGeocode, haversineKm, mapImage } from './geo.js';

const POD_PLACEHOLDER = fileURLToPath(new URL('../assets/pod-unavailable.png', import.meta.url));

const COLOR = {
  delivered: 0x2ecc71, // green
  problem:   0xe67e22, // orange — carded, failed, returned
  transit:   0x3498db, // blue — moving through the network
  other:     0x95a5a6, // grey
};

function colorFor(status) {
  const s = (status || '').toLowerCase();
  if (/^delivered\b/.test(s))                          return COLOR.delivered;
  if (/card|fail|refus|return|held|redirect/.test(s))   return COLOR.problem;
  if (/transit|out for|collect|received|scan/.test(s))  return COLOR.transit;
  return COLOR.other;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** DD/MM/YYYY → "27 Aug". */
function shortDate(date) {
  const [day, month] = (date || '').split('/');
  return day && month ? `${day} ${MONTHS[Number(month) - 1] ?? month}` : (date || '');
}

/** Keep the full clock — seconds tell two scans in the same minute apart. */
const hms = (time) => (time || '').slice(0, 8);
const coord = (value) => Number(value).toFixed(6);

const MAX_HISTORY = 12;

// ANSI colours only render inside an ```ansi code block (desktop + newer mobile).
const CYAN   = '\u001b[0;36m';
const YELLOW = '\u001b[0;33m';
const GREEN  = '\u001b[0;32m';
const BOLD   = '\u001b[1m';
const RESET  = '\u001b[0m';

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

// Never navigate to a truncated display address. Unsupported targets have no route link.
function routeTarget(address) {
  if (!address || typeof address !== 'object' || address.truncated === true) return null;
  const parts = [...(Array.isArray(address.lines) ? address.lines : []), address.town, address.county]
    .filter(value => value !== undefined && value !== null && value !== '');
  if (!parts.length || parts.length > 7 || parts.some(value => typeof value !== 'string' || value.length > 800)) return null;
  const target = parts.map(value => value.trim()).filter(Boolean).join(', ');
  if (!target) return null;
  try {
    const encoded = encodeURIComponent(target);
    return encoded.length <= 800 ? encoded : null;
  } catch { return null; }
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
      bay: clean(scan.bay || /Bay:\s*([^,|]+)/i.exec(typeof scan.notes === 'string' ? scan.notes : '')?.[1], 12),
      sequence: clean(scan.sequence || /Sequence:\s*([^,|]+)/i.exec(typeof scan.notes === 'string' ? scan.notes : '')?.[1], 12),
      onwardBc: clean(onwardBc(scan), 20),
    };
  });
  const drop = source.drop;
  const validDrop = drop && Number.isFinite(drop.lat) && Math.abs(drop.lat) <= 90
    && Number.isFinite(drop.lng) && Math.abs(drop.lng) <= 180;
  return { ...source, consNumber: clean(source.consNumber, 20) || 'Unknown consignment',
    query: clean(source.query, 20) || '—', arrangedDate: clean(source.arrangedDate, 24),
    address: a, scans, drop: validDrop ? { lat: drop.lat, lng: drop.lng } : null };
}

const isDelivered = (s) => /^delivered\b/i.test(s?.type || '');

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

/** A green dot for a delivered parcel, amber for one still in the network. */
function parcelsBlock(parcels) {
  const width = Math.max(...parcels.map((p) => p.lastScan.type.length));
  const lines = parcels.slice(0, 6).map((p) => {
    const dot    = isDelivered(p.lastScan) ? `${GREEN}●` : `${YELLOW}●`;
    const bc     = onwardBc(p.lastScan);
    const onward = bc ? `  →${bc}` : '';
    return `${dot}${RESET} Parcel ${p.parcel}  ${p.lastScan.type.padEnd(width)}`
      + `  ${CYAN}${hms(p.lastScan.time)}${RESET}${onward}`;
  });
  if (parcels.length > lines.length) lines.push(`… +${parcels.length - lines.length} parcels not shown`);
  return '```ansi\n' + lines.join('\n') + '\n```';
}

const isNearestRoute = (scan) => /nearest route assigned/i.test(scan?.type || '');

/** Newest first with one aligned line per visible scan. */
function historyBlock(scans, showParcel) {
  const rows = scans.map((scan, index) => ({ scan, index })).sort((a, b) => {
    const difference = (Number.isFinite(stamp(b.scan)) ? stamp(b.scan) : -Infinity)
      - (Number.isFinite(stamp(a.scan)) ? stamp(a.scan) : -Infinity);
    return difference || b.index - a.index;
  }).map(item => item.scan).filter((s) => !isNearestRoute(s)).slice(0, MAX_HISTORY);
  const statusWidth = rows.length ? Math.max(...rows.map((s) => s.type.length)) : 0;
  const routeWidth = rows.length ? Math.max(...rows.map((s) => displayRoute(s.route).length)) : 0;
  const lines = rows.map((s) => {
    const route = displayRoute(s.route);
    const location = cadLocation(s);
    const prefix = showParcel ? `${numberedParcel(s.parcel) ? `P${s.parcel}` : 'Unassigned'}  ` : '';
    const bc = onwardBc(s);
    const onward = bc ? `  →${bc}` : '';
    const dateTime = Number.isFinite(stamp(s)) ? `${shortDate(s.date)} ${hms(s.time)}` : 'Unknown time';
    return `${prefix}${s.type.padEnd(statusWidth)}  ${CYAN}${dateTime}${RESET}`
      + `  ${route.padEnd(routeWidth)}${location ? `  ${location}` : ''}${onward}`;
  });

  const hidden = scans.filter((s) => !isNearestRoute(s)).length - lines.length;
  if (hidden > 0) lines.push(`… +${hidden} ${scans.some(scan => !Number.isFinite(stamp(scan))) ? 'not shown' : 'earlier'}`);

  return '```ansi\n' + lines.join('\n') + '\n```';
}

/** Status bold, time yellow — needs an ANSI code block, plain text has no colour. */
function lastEventLine(s, minWidth = 0) {
  const route = displayRoute(s.route);
  const head = `${BOLD}${s.type}${RESET} at ${YELLOW}${hms(s.time) || 'Unknown time'}${RESET}`
    + `${route ? ` by route ${route}` : ''}`;
  const bc    = onwardBc(s);
  const signed = s.signature ? `\n-> Signed to ${s.signature} <-` : '';
  const onward = bc ? `\n-> Onward BC ${bc} <-` : '';
  // Pad the last line to the history width so the main card matches the taller one.
  const lines = (head + signed + onward).split('\n');
  const last  = lines[lines.length - 1].replace(/\u001b\[[0-9;]*m/g, '').length;
  lines[lines.length - 1] += ' '.repeat(Math.max(0, minWidth - last));
  return '```ansi\n' + lines.join('\n') + '\n```';
}

const place = (a) => [...(a.lines ?? []), a.town, a.county].filter(Boolean).join(', ');

/** Visible width of a code block's widest line, ignoring fences and ANSI colours. */
function blockWidth(block) {
  return Math.max(0, ...block.split('\n')
    .filter((l) => !l.startsWith('```'))
    .map((l) => l.replace(/\u001b\[[0-9;]*m/g, '').length));
}

export async function buildParcelEmbed(parcel, apiKey) {
  if (Array.isArray(parcel?.scans) && parcel.scans.length > 1000) {
    return { embeds: [new EmbedBuilder().setTitle('Parcel data unavailable').setDescription('Scan limit exceeded; history was not truncated.')], files: [], allowedMentions: { parse: [] } };
  }
  const originalTarget = routeTarget(parcel?.address);
  parcel = normalize(parcel);
  const a = parcel.address;
  const consignee = [...new Set([a.contact, a.company].filter(Boolean))].join(', ');

  const relevantScans = parcel.scans.filter((scan) => !isNearestRoute(scan));
  // Parcel "0" is a consignment-level event (order received), not a physical box.
  const numbered  = relevantScans.filter((sc) => numberedParcel(sc.parcel));
  const scans     = numbered.length ? relevantScans.filter(sc => !/^0+$/.test(sc.parcel)) : relevantScans;
  const unknownIdentity = scans.some(sc => !numberedParcel(sc.parcel) && !/^0+$/.test(sc.parcel));
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

  // Resolve the Eircode once — the same point feeds both the distance and the map.
  const eircode = normEircode(a.postCode);
  const addr    = parcel.drop && eircode ? await geocode(eircode, apiKey) : null;

  const desc = [];
  if (unknownIdentity) desc.push('Some scans have an unassigned parcel identity; latest status cannot be confirmed.');
  if (invalidTime) desc.push('Some scan timestamps are invalid or missing; latest status cannot be confirmed.');
  if (parcel.drop || parcel.pod?.body) desc.push('Photo and location are consignment-level evidence; they may refer to different parcels or events.');
  if (parcel.drop) {
    // Where the parcel actually landed — the whole point when it went to the wrong door.
    const dropEircode = await reverseGeocode(parcel.drop, apiKey);
    const dropPoint = `${coord(parcel.drop.lat)}, ${coord(parcel.drop.lng)}`;
    const landed = dropEircode ? ` — dropped ≈ ${dropEircode}` : ` — 🔴 S: ${dropPoint}`;
    if (!eircode)     desc.push(`📍 distance unavailable — no valid Eircode${landed}`);
    else if (!addr)   desc.push(`📍 distance unavailable — Eircode not resolved${landed}`);
    else {
      const km    = haversineKm(parcel.drop, addr);
      const shown = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
      // 🔴/🔵 mirror the red S / blue D markers drawn on the map below.
      desc.push(`📍 **≈ ${shown}** off target`
        + `\n${dropEircode ? `🔴 S · Dropped Eircode: ${dropEircode}` : `🔴 S: ${dropPoint}`}`
        + `\n🔵 D · target ${eircode}`);
    }
    const destination = eircode ?? originalTarget;
    desc.push(`[🗺 Open scan location in Google Maps](https://www.google.com/maps/search/?api=1`
      + `&query=${parcel.drop.lat},${parcel.drop.lng})`
      + (destination ? ` · [Open route to target](https://www.google.com/maps/dir/?api=1`
      + `&origin=${parcel.drop.lat},${parcel.drop.lng}&destination=${destination})` : ' · Target route unavailable'));
  }

  // Match the two cards: stretch the main card's Last event to the history width.
  const historyStr = historyBlock(scans, multi || unknownIdentity);

  const fields = [
    { name: 'Recipient', value: consignee || '—' },
    { name: 'Mobile',    value: a.mobile || '—', inline: true },
    { name: 'Eircode',   value: a.postCode || '—', inline: true },
    { name: 'Address',   value: place(a) || '—' },
  ];
  if (a.email) fields.push({ name: 'Email', value: a.email });
  if (a.depot || parcel.arrangedDate) {
    fields.push(
      { name: 'Delivery depot', value: a.depot || '—', inline: true },
      { name: 'Arranged date', value: parcel.arrangedDate || '—', inline: true },
    );
  }
  if (multi) {
    fields.push({ name: 'Parcels', value: parcelsBlock(parcels) });
  }
  fields.push(
    { name: 'Last event', value: lastEventLine(s, blockWidth(historyStr)) },
  );

  const mainEmbed = new EmbedBuilder()
    .setColor(colorFor(s.type))
    .setTitle(`📦 ${parcel.consNumber} — ${s.type}${count}`)
    .setDescription(desc.join('\n\n') || null)
    .addFields(...fields)
    .setFooter({ text: `searched as ${parcel.query}` });

  // A picture of how far the scan (S) sits from the address (D).
  const files = [];
  const extraEmbeds = [];
  if (typeof parcel.pod?.body === 'string' && parcel.pod.body.length <= 700000 && /^[A-Za-z0-9+/=]+$/.test(parcel.pod.body)) {
    const pod = Buffer.from(parcel.pod.body, 'base64');
    files.push(new AttachmentBuilder(pod, { name: 'pod.jpg' }));
    extraEmbeds.push(new EmbedBuilder()
      .setColor(colorFor(s.type))
      .setTitle('POD photo')
      .setImage('attachment://pod.jpg'));
  } else {
    files.push(new AttachmentBuilder(POD_PLACEHOLDER, { name: 'pod-unavailable.png' }));
    extraEmbeds.push(new EmbedBuilder()
      .setColor(COLOR.other)
      .setTitle('Delivery photo unavailable')
      .setImage('attachment://pod-unavailable.png'));
  }
  if (addr) {
    const png = await mapImage(parcel.drop, addr, apiKey);
    if (png) {
      mainEmbed.setImage('attachment://route.png');
      files.push(new AttachmentBuilder(png, { name: 'route.png' }));
    }
  }

  // Its own embed so it renders below the map image.
  const historyEmbed = new EmbedBuilder()
    .setColor(colorFor(s.type))
    .setTitle(`History (${scans.length})`)
    .setDescription(historyStr);

  const embeds = [mainEmbed, historyEmbed, ...extraEmbeds];
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
