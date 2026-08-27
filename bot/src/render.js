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
  if (s.includes('delivered'))                        return COLOR.delivered;
  if (/card|fail|refus|return|held/.test(s))          return COLOR.problem;
  if (/transit|out for|collect|received|scan/.test(s)) return COLOR.transit;
  return COLOR.other;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** DD/MM/YYYY → "27 Aug". */
function shortDate(date) {
  const [day, month] = (date || '').split('/');
  return day && month ? `${day} ${MONTHS[Number(month) - 1] ?? month}` : (date || '');
}

/** "13:06:54" → "13:06" — seconds add noise. */
const hhmm = (time) => (time || '').slice(0, 5);

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
    const dot = isDelivered(p.lastScan) ? `${GREEN}●` : `${YELLOW}●`;
    return `${dot}${RESET} Parcel ${p.parcel}  ${p.lastScan.type.padEnd(width)}`
      + `  ${CYAN}${hhmm(p.lastScan.time)}${RESET}`;
  });
  return '```ansi\n' + lines.join('\n') + '\n```';
}

/** Newest first: status on the left, the time right-aligned in its own column. */
function historyBlock(scans, showParcel) {
  const rows  = [...scans].reverse().slice(0, MAX_HISTORY);
  const width = rows.length ? Math.max(...rows.map((s) => s.type.length)) : 0;

  const lines = rows.map((s) => {
    const tag   = showParcel ? `P${s.parcel} ` : '';
    const label = s.type.padEnd(width);
    const route = s.route ? `  ${s.route}` : '';
    return `${tag}${label}  ${CYAN}${shortDate(s.date)} ${hhmm(s.time)}${RESET}${route}`;
  });

  const hidden = scans.length - lines.length;
  if (hidden > 0) lines.push(`… +${hidden} earlier`);

  return '```ansi\n' + lines.join('\n') + '\n```';
}

/** Status bold, time yellow — needs an ANSI code block, plain text has no colour. */
function lastEventLine(s) {
  const head = `${BOLD}${s.type}${RESET} at ${YELLOW}${hhmm(s.time)}${RESET}`
    + `${s.route ? ` by route ${s.route}` : ''}`;
  const signed = s.signature ? `\n-> Signed to ${s.signature} <-` : '';
  return '```ansi\n' + head + signed + '\n```';
}

const place = (a) => [...a.lines, a.town, a.county].filter(Boolean).join(', ');

export async function buildParcelEmbed(parcel, apiKey) {
  const a         = parcel.address;
  const consignee = [...new Set([a.contact, a.company].filter(Boolean))].join(', ');
  const s         = parcel.lastScan;

  // Per-parcel view: how many of the consignment's parcels have actually landed.
  const parcels   = byParcel(parcel.scans);
  const delivered = parcels.filter((p) => isDelivered(p.lastScan)).length;
  const multi     = parcels.length > 1;
  const count     = multi ? ` (${delivered}/${parcels.length})` : '';

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

  const fields = [
    { name: 'Consignee', value: consignee || '—', inline: true },
    { name: 'Post code', value: a.postCode || '—', inline: true },
    { name: 'Address',   value: place(a) || '—' },
  ];
  if (multi) {
    fields.push({ name: `Parcels (${delivered}/${parcels.length} delivered)`, value: parcelsBlock(parcels) });
  }
  fields.push(
    { name: '\u200b',    value: '────────────────────' }, // divider before the event
    { name: 'Last event', value: lastEventLine(s) },
  );

  const mainEmbed = new EmbedBuilder()
    .setColor(colorFor(parcel.status))
    .setTitle(`📦 ${parcel.consNumber} — ${parcel.status}${count}`)
    .setDescription(desc.join('\n\n') || null)
    .addFields(...fields)
    .setFooter({ text: `searched as ${parcel.query}` });

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
    .setColor(colorFor(parcel.status))
    .setTitle(`History (${parcel.scanCount})`)
    .setDescription(historyBlock(parcel.scans, multi));

  return { embeds: [mainEmbed, historyEmbed], files };
}
