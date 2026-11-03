/** Pure, exact report-event selection; provider IDs never leave the extension. */
const unavailable = () => ({ error: 'Delivery event is missing or ambiguous; review Scanning History.' });
const descriptor = ({ parcel, type, date, time }) => ({ parcel: String(Number(parcel)), type, date, time });
const key = event => JSON.stringify(descriptor(event));

function validEvent(scan) {
  if (!/^\d{1,6}$/.test(scan.parcel ?? '') || Number(scan.parcel) < 1) return false;
  const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(scan.date ?? '');
  const time = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(scan.time ?? '');
  if (!date || !time) return false;
  const [, day, month, year] = date.map(Number);
  const [, hour, minute, second = 0] = time.map(value => Number(value ?? 0));
  const checked = new Date(Date.UTC(year, month - 1, day));
  return checked.getUTCFullYear() === year && checked.getUTCMonth() === month - 1
    && checked.getUTCDate() === day && hour < 24 && minute < 60 && second < 60;
}

export function reportSelection(scans, selection) {
  if (!Array.isArray(scans) || scans.length > 1000) return unavailable();
  const events = scans.filter(scan => scan && ['Delivered', 'Carded'].includes(scan.type));
  if (!events.length || events.length > 25 || events.some(scan => !validEvent(scan))) return unavailable();
  if (new Set(events.map(key)).size !== events.length) return unavailable();
  if (selection !== undefined) {
    if (!selection || !['Delivered', 'Carded'].includes(selection.type) || !validEvent(selection)) return unavailable();
    const matches = events.filter(scan => key(scan) === key(selection));
    return matches.length === 1 ? { event: matches[0] } : unavailable();
  }
  return events.length === 1 ? { event: events[0] } : { candidates: events.map(descriptor) };
}
