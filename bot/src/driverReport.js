/** Driver-facing presentation; deterministic and independent of Maps providers. */
import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { fileURLToPath, URL, URLSearchParams } from 'node:url';
import { normEircode } from './geo.js';

const PLACEHOLDER = fileURLToPath(new URL('../assets/pod-unavailable.png', import.meta.url));
const clean = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ')
  .replace(/[`*~<>[\]\\]/g, "'").replace(/@(everyone|here)\b/gi, '＠$1').trim() : '';
const point = value => value && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90
  && Number.isFinite(value.lng) && Math.abs(value.lng) <= 180 ? `${value.lat},${value.lng}` : null;
const maps = (path, args) => `https://www.google.com/maps/${path}/?${new URLSearchParams({ api: '1', ...args })}`;
const button = (id, label) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Secondary);

export function renderDriverReport(parcel, { resultId, offset = 0 } = {}) {
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
  const text = buildDriverReportText(report);
  const body = parcel.pod?.body;
  const files = typeof body === 'string' && body.length <= 700000 && /^[A-Za-z0-9+/=]+$/.test(body)
    ? [new AttachmentBuilder(Buffer.from(body, 'base64'), { name: 'pod.jpg' })]
    : [new AttachmentBuilder(PLACEHOLDER, { name: 'pod-unavailable.png' })];
  if (text.length > 1900) files.push(new AttachmentBuilder(Buffer.from(text), { name: 'driver-report.txt' }));
  return { ...common, content: text.length <= 1900 ? text : 'Driver report attached as text to preserve the complete address and links.', files, components: [] };
}

/** Pure reusable text model, also suitable for manual WhatsApp copy. */
export function buildDriverReportText(report) {
  if (report.state !== 'ready') throw new Error('Driver report unavailable');
  const event = report.event ?? {};
  if (!['Delivered', 'Carded'].includes(event.type)) throw new Error('Unsupported report event');
  const a = report.address ?? {};
  const attempted = event.type === 'Carded';
  const gps = point(event.coords);
  const address = [...(Array.isArray(a.lines) ? a.lines : []), a.town, a.county].filter(value => typeof value === 'string' && value.trim());
  const eircode = normEircode(typeof a.postCode === 'string' ? a.postCode : '');
  const target = eircode || (!a.truncated && address.length ? address.join(', ') : null);
  const lines = [
    'Parcel recovery & redelivery',
    `Consignment: ${clean(report.consNumber)} · Parcel ${clean(event.parcel)}`, '',
    attempted ? 'Attempted delivery point' : 'Delivery point — recorded scan location',
    gps || 'Location unavailable',
    `${attempted ? 'Attempted' : 'Delivered'}: ${clean(event.date)} ${clean(event.time)}`,
    ...(event.signature ? [`Signed for by: ${clean(event.signature)}`] : []),
    attempted ? 'Parcel not confirmed at this location.' : 'Scan location does not confirm the parcel is still here.', '',
    'Deliver to',
    ...[...new Set([a.contact, a.company].filter(Boolean)), ...address, a.postCode].filter(Boolean).map(clean),
    ...(a.mobile ? [`Phone: ${clean(a.mobile)}`] : []),
  ];
  if (!address.length && !eircode) lines.push('Correct delivery address unavailable.');
  if (a.truncated) lines.push('Address incomplete; verify before redelivery.');
  if (gps) lines.push('', `Open ${attempted ? 'attempted delivery' : 'delivery'} point:`, maps('search', { query: gps }));
  if (gps && target && !attempted) {
    const route = maps('dir', { origin: gps, destination: target, travelmode: 'driving' });
    if (route.length <= 2048) lines.push('', 'Route to correct address:', route);
    else lines.push('', 'Route unavailable; verify the destination address.');
  }
  return lines.join('\n');
}
