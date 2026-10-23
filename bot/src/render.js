/**
 * bot/src/render.js
 * =================
 * Turns a raw parcel (from the extension) into Discord embeds: colour = status
 * at a glance, distance + map on the main card, and the full scan history in a
 * second embed underneath (an embed pins its image to the bottom, so history
 * lives in its own embed to sit below the map).
 */
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';

import { normEircode, geocode, reverseGeocode, haversineKm, mapImage } from './geo.js';

const COLOR = {
  delivered: 0x2ecc71, // green
  problem:   0xe67e22, // orange — carded, failed, returned
  transit:   0x3498db, // blue — moving through the network
  other:     0x95a5a6, // grey
};

function colorFor(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('delivered'))                          return COLOR.delivered;
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
  const [d, m, y] = (date || '').split('/');
  return new Date(`${y}-${m}-${d}T${time || '00:00:00'}`).getTime();
}

const isDelivered = (s) => /delivered/i.test(s?.type || '');

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
    const key  = s.parcel || '1';
    const prev = latest.get(key);
    if (!prev || stamp(s) >= stamp(prev)) latest.set(key, s);
  }
  return [...latest.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([parcel, lastScan]) => ({ parcel, lastScan }));
}

/** Route names like NearRoute are internal and should be hidden from operator-facing logs. */
function displayRoute(route) {
  return (route || '').toLowerCase() === 'nearroute' ? '' : (route || '');
}

/** A green dot for a delivered parcel, amber for one still in the network. */
function parcelsBlock(parcels) {
  const width = Math.max(...parcels.map((p) => p.lastScan.type.length));
  const lines = parcels.map((p) => {
    const dot    = isDelivered(p.lastScan) ? `${GREEN}●` : `${YELLOW}●`;
    const bc     = onwardBc(p.lastScan);
    const onward = bc ? `  →${bc}` : '';
    return `${dot}${RESET} Parcel ${p.parcel}  ${p.lastScan.type.padEnd(width)}`
      + `  ${CYAN}${hms(p.lastScan.time)}${RESET}${onward}`;
  });
  return '```ansi\n' + lines.join('\n') + '\n```';
}

const isNearestRoute = (scan) => /nearest route assigned/i.test(scan?.type || '');

/** Newest first with one aligned line per visible scan. */
function historyBlock(scans, showParcel) {
  const rows = [...scans].reverse().filter((s) => !isNearestRoute(s)).slice(0, MAX_HISTORY);
  const statusWidth = rows.length ? Math.max(...rows.map((s) => s.type.length)) : 0;
  const routeWidth = rows.length ? Math.max(...rows.map((s) => displayRoute(s.route).length)) : 0;
  const lines = rows.map((s) => {
    const route = displayRoute(s.route);
    const location = cadLocation(s);
    const prefix = showParcel ? `P${s.parcel}  ` : '';
    const bc = onwardBc(s);
    const onward = bc ? `  →${bc}` : '';
    const dateTime = `${shortDate(s.date)} ${hms(s.time)}`;
    return `${prefix}${s.type.padEnd(statusWidth)}  ${CYAN}${dateTime}${RESET}`
      + `  ${route.padEnd(routeWidth)}${location ? `  ${location}` : ''}${onward}`;
  });

  const hidden = scans.filter((s) => !isNearestRoute(s)).length - lines.length;
  if (hidden > 0) lines.push(`… +${hidden} earlier`);

  return '```ansi\n' + lines.join('\n') + '\n```';
}

/** Status bold, time yellow — needs an ANSI code block, plain text has no colour. */
function lastEventLine(s, minWidth = 0) {
  const route = displayRoute(s.route);
  const head = `${BOLD}${s.type}${RESET} at ${YELLOW}${hms(s.time)}${RESET}`
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
  const a = parcel.address;
  const consignee = [...new Set([a.contact, a.company].filter(Boolean))].join(', ');

  const relevantScans = parcel.scans.filter((scan) => !isNearestRoute(scan));
  // Parcel "0" is a consignment-level event (order received), not a physical box.
  const numbered  = relevantScans.filter((sc) => Number(sc.parcel) >= 1);
  const scans     = numbered.length ? numbered : relevantScans;
  // The honest current status is the latest real scan — the detail page goes stale
  // (still says "Delivered" after a later redirect).
  const s         = scans.reduce((x, y) => (stamp(y) >= stamp(x) ? y : x));

  // Per-parcel view: how many parcels share the headline status (Delivered 1/2,
  // Redirected 2/2 …) — that count is what makes multi-parcel tracking honest.
  const parcels  = byParcel(scans);
  const multi    = parcels.length > 1;
  const matching = parcels.filter((p) => p.lastScan.type === s.type).length;
  const count    = multi ? ` (${matching}/${parcels.length})` : '';

  // Resolve the Eircode once — the same point feeds both the distance and the map.
  const eircode = normEircode(a.postCode);
  const addr    = parcel.drop && eircode ? await geocode(eircode, apiKey) : null;

  const desc = [];
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
    const destination = eircode ?? encodeURIComponent(place(a));
    desc.push(`[🗺 Open scan location in Google Maps](https://www.google.com/maps/search/?api=1`
      + `&query=${parcel.drop.lat},${parcel.drop.lng})`
      + ` · [Open route to target](https://www.google.com/maps/dir/?api=1`
      + `&origin=${parcel.drop.lat},${parcel.drop.lng}&destination=${destination})`);
  }

  // Match the two cards: stretch the main card's Last event to the history width.
  const historyStr = historyBlock(scans, multi);

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
  if (parcel.pod?.body) {
    const pod = Buffer.from(parcel.pod.body, 'base64');
    files.push(new AttachmentBuilder(pod, { name: 'pod.jpg' }));
    extraEmbeds.push(new EmbedBuilder()
      .setColor(colorFor(s.type))
      .setTitle('POD photo')
      .setImage('attachment://pod.jpg'));
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

  return { embeds: [mainEmbed, historyEmbed, ...extraEmbeds], files };
}
