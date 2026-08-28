/**
 * bot/src/render.js
 * =================
 * Turns a raw parcel (from the extension) into Discord embeds: colour = status
 * at a glance, distance + map on the main card, and the full scan history in a
 * second embed underneath (an embed pins its image to the bottom, so history
 * lives in its own embed to sit below the map).
 */
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';

import { normEircode, geocode, haversineKm, mapImage } from './geo.js';

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
  return [bay && `B${bay}`, sequence && `#${sequence}`].filter(Boolean).join('/');
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

/** Newest first: CAD bay/sequence, parcel, status, date/time, then route. */
function historyBlock(scans, showParcel) {
  const rows = [...scans].reverse().slice(0, MAX_HISTORY);
  const sw = rows.length ? Math.max(...rows.map((s) => s.type.length)) : 0;
  const rw = rows.length ? Math.max(...rows.map((s) => (s.route || '').length)) : 0;
  const lw = rows.length ? Math.max(...rows.map((s) => cadLocation(s).length)) : 0;

  const lines = rows.map((s) => {
    const location = lw ? `${cadLocation(s).padEnd(lw)}  ` : '';
    const tag    = showParcel ? `P${s.parcel} ` : '';
    const label  = s.type.padEnd(sw);
    const route  = (s.route || '').padEnd(rw);
    const bc     = onwardBc(s);
    const onward = bc ? `  →${bc}` : '';
    return `${location}${tag}${label}  ${CYAN}${shortDate(s.date)} ${hms(s.time)}${RESET}  ${route}${onward}`;
  });

  const hidden = scans.length - lines.length;
  if (hidden > 0) lines.push(`… +${hidden} earlier`);

  return '```ansi\n' + lines.join('\n') + '\n```';
}

/** Status bold, time yellow — needs an ANSI code block, plain text has no colour. */
function lastEventLine(s, minWidth = 0) {
  const head = `${BOLD}${s.type}${RESET} at ${YELLOW}${hms(s.time)}${RESET}`
    + `${s.route ? ` by route ${s.route}` : ''}`;
  const bc    = onwardBc(s);
  const extra = bc ? `\n-> Onward BC ${bc} <-` : '';
  // Pad the last line to the history width so the main card matches the taller one.
  const lines = (head + extra).split('\n');
  const last  = lines[lines.length - 1].replace(/\u001b\[[0-9;]*m/g, '').length;
  lines[lines.length - 1] += ' '.repeat(Math.max(0, minWidth - last));
  return '```ansi\n' + lines.join('\n') + '\n```';
}

const place = (a) => [a.town, a.county].filter(Boolean).join(', ');

/** Visible width of a code block's widest line, ignoring fences and ANSI colours. */
function blockWidth(block) {
  return Math.max(0, ...block.split('\n')
    .filter((l) => !l.startsWith('```'))
    .map((l) => l.replace(/\u001b\[[0-9;]*m/g, '').length));
}

export async function buildParcelEmbed(parcel, apiKey) {
  const a = parcel.address;

  // Parcel "0" is a consignment-level event (order received), not a physical box.
  const numbered  = parcel.scans.filter((sc) => Number(sc.parcel) >= 1);
  const scans     = numbered.length ? numbered : parcel.scans;
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
    if (!eircode)     desc.push('📍 distance unavailable — no valid Eircode');
    else if (!addr)   desc.push('📍 distance unavailable — Eircode not resolved');
    else {
      const km    = haversineKm(parcel.drop, addr);
      const shown = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
      desc.push(`📍 **≈ ${shown}** from Eircode ${eircode}`);
    }
    const dest = eircode ?? encodeURIComponent(place(a));
    desc.push(`[🗺 Open route in Google Maps](https://www.google.com/maps/dir/?api=1`
      + `&origin=${parcel.drop.lat},${parcel.drop.lng}&destination=${dest})`);
  }

  // Match the two cards: stretch the main card's Last event to the history width.
  const historyStr = historyBlock(scans, multi);

  const fields = [
    { name: 'Post code', value: a.postCode || '—', inline: true },
    { name: 'Area',      value: place(a) || '—', inline: true },
  ];
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
    .setFooter({ text: `searched as …${String(parcel.query).slice(-4)}` });

  // A picture of how far the scan (S) sits from the address (D).
  const files = [];
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

  return { embeds: [mainEmbed, historyEmbed], files };
}
