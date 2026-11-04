import { RESCHEDULE_RESULT_VERSION } from './contract.js';
/** Keep operator details below the shared 2000-character result contract. */
export function resultDetails(lines) {
  const shown = [];
  let size = 0;
  for (const line of lines) {
    const bounded = line.length > 1800 ? `${line.slice(0, 1799)}…` : line;
    const nextSize = size + bounded.length + (shown.length ? 1 : 0);
    if (shown.length === 25 || nextSize > 1800) break;
    shown.push(bounded);
    size = nextSize;
  }
  if (shown.length < lines.length) shown.push(`… ще ${lines.length - shown.length}`);
  return shown.length ? shown.join('\n') : undefined;
}

/** Additive v1 private result envelope; legacy summary remains bounded. */
export function resultReport(lines) {
  const bounded = [];
  let bytes = 128;
  for (const line of lines) {
    const text = String(line).replace(/[\s`]/g, ' ').split('').map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char).join('').slice(0, 600);
    bytes += new TextEncoder().encode(JSON.stringify(text)).length + 1;
    if (bounded.length >= 4000 || bytes > 750000) break;
    bounded.push(text);
  }
  if (bounded.length < lines.length) bounded.push(`… omitted ${lines.length - bounded.length} rows (result size limit)`);
  return { details: resultDetails(lines), ...(bounded.length ? { parcel: { rescheduleResults: { version: RESCHEDULE_RESULT_VERSION, lines: bounded } } } : {}) };
}
