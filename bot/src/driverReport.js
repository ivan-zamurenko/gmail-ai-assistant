/** Driver-facing presentation; pure text with optional bounded Maps enrichment. */
import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { fileURLToPath, URL, URLSearchParams } from 'node:url';
import { normEircode, geocode, mapImage } from './geo.js';

const PLACEHOLDER = fileURLToPath(new URL('../assets/pod-unavailable.png', import.meta.url));
const clean = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ')
  .replace(/[`*~<>[\]\\]/g, "'").replace(/@(everyone|here)\b/gi, '＠$1').trim() : '';
const point = value => value && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90
  && Number.isFinite(value.lng) && Math.abs(value.lng) <= 180 ? `${value.lat},${value.lng}` : null;
const maps = (path, args) => `https://www.google.com/maps/${path}/?${new URLSearchParams({ api: '1', ...args })}`;
const button = (id, label) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Secondary);

export async function renderDriverReport(parcel, { resultId, offset = 0, eircode, apiKey } = {}) {
  const report = parcel?.report;
  if (report?.version !== 1) throw new Error('Unsupported driver report');
  const common = { allowedMentions: { parse: [] }, flags: MessageFlags.SuppressEmbeds };
  if (report.state === 'choose') {
    if (!/^[A-Za-z0-9-]{1,80}$/.test(resultId ?? '') || !Array.isArray(report.candidates)
        || report.candidates.length > 25 || !report.candidates.length) throw new Error('Report selection unavailable');
    offset = Math.max(0, Math.min(Math.floor(offset / 4) * 4, Math.floor((report.candidates.length - 1) / 4) * 4));
    const components = report.candidates.slice(offset, offset + 4).map((event, index) => new ActionRowBuilder().addComponents(
      button(`report:select:${resultId}:${offset + index}`, `Parcel ${clean(event.parcel)} · ${clean(event.type)} · ${clean(event.date)} ${clean(event.time)}`.slice(0, 80)),
    ));
    const nav = new ActionRowBuilder();
    if (offset > 0) nav.addComponents(button(`report:page:${resultId}:${offset - 4}`, 'Previous'));
    if (offset + 4 < report.candidates.length) nav.addComponents(button(`report:page:${resultId}:${offset + 4}`, 'Next'));
    if (nav.components.length) components.push(nav);
    return { ...common, content: 'Choose the parcel and recorded delivery event for the driver report.', components };
  }
  if (report.state !== 'ready') throw new Error('Driver report unavailable');
  const destination = effectiveEircode(report, eircode);
  if (!destination) return { ...common,
    content: `Destination Eircode is missing or invalid. Run /report con_id:${clean(report.consNumber)} eircode:<correct Eircode>.`, components: [] };
  const text = buildDriverReportText(report, { eircode });
  const operatorNote = eircode === undefined ? '' : 'Operator note: Manual destination Eircode. Check it matches the depot address before forwarding.\n\n';
  const body = parcel.pod?.body;
  const files = typeof body === 'string' && body.length <= 700000 && /^[A-Za-z0-9+/=]+$/.test(body)
    ? [new AttachmentBuilder(Buffer.from(body, 'base64'), { name: 'pod.jpg' })]
    : [new AttachmentBuilder(PLACEHOLDER, { name: 'pod-unavailable.png' })];
  let mapNote = '\n\nMap preview unavailable; use navigation links.';
  if (point(report.event?.coords) && typeof apiKey === 'string' && apiKey.trim()) {
    try {
      const target = await geocode(destination, apiKey);
      const png = target ? await mapImage(report.event.coords, target, apiKey) : null;
      if (png) {
        files.unshift(new AttachmentBuilder(png, { name: 'delivery-map.png' }));
        mapNote = '\n\nMap: 🔴 recorded point · 🔵 delivery address.';
      }
    } catch { console.warn('[report] MAP_UNAVAILABLE'); }
  }
  const content = operatorNote + text + mapNote;
  if (content.length > 1900) files.push(new AttachmentBuilder(Buffer.from(text), { name: 'driver-report.txt' }));
  return { ...common, content: content.length <= 1900 ? content : operatorNote + 'Driver report attached as text to preserve the complete address and links.' + mapNote, files, components: [] };
}

/** A manual value wins; invalid explicit input never silently falls back. */
export function effectiveEircode(report, override) {
  return normEircode(override === undefined ? report?.address?.postCode : override);
}

/** Pure driver text, without operator-only notes or provider state. */
export function buildDriverReportText(report, { eircode } = {}) {
  if (report.state !== 'ready') throw new Error('Driver report unavailable');
  const event = report.event ?? {};
  if (!['Delivered', 'Carded'].includes(event.type)) throw new Error('Unsupported report event');
  const destination = effectiveEircode(report, eircode);
  if (!destination) throw new Error('Correct destination Eircode required');
  const a = report.address ?? {};
  const attempted = event.type === 'Carded';
  const gps = point(event.coords);
  const address = [...(Array.isArray(a.lines) ? a.lines : []), a.town, a.county].filter(value => typeof value === 'string' && value.trim());
  const navigate = destination => maps('dir', { destination, travelmode: 'driving', dir_action: 'navigate' });
  const lines = [
    'Parcel recovery & redelivery',
    `Consignment: ${clean(report.consNumber)} · Parcel ${clean(event.parcel)}`, '',
    attempted ? '📦 Attempted delivery' : '📦 Delivery recorded',
    `${attempted ? 'Attempted' : 'Delivered'}: ${clean(event.date)} ${clean(event.time)}`,
    ...(!attempted && event.signature ? [`Signed for by: ${clean(event.signature)}`] : []),
    attempted ? 'Parcel not confirmed at this location.' : 'Recorded location; confirm the parcel is still there.',
    ...(gps ? ['', `👉 Navigate to ${attempted ? 'attempted delivery' : 'collection'} point:`, navigate(gps)] : ['Location unavailable']), '',
    '🏠 Deliver to',
    ...[...new Set([a.contact, a.company].filter(Boolean)), ...address].filter(Boolean).map(clean),
    `Eircode: ${destination}`,
    ...(a.mobile ? [`Phone: ${clean(a.mobile)}`] : []),
    ...(a.truncated ? ['Address incomplete; verify before redelivery.'] : []),
    '', '👉 Navigate to delivery address:', navigate(destination),
  ];
  return lines.join('\n');
}
