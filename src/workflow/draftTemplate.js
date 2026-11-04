/**
 * src/workflow/draftTemplate.js
 * =============================
 * English reply text from depot facts only (G_GMAIL_POLICY): latest scan and the
 * delivery date already in the depot. No promises, compensation or invented facts;
 * a missing fact is simply not mentioned. The operator edits and sends it.
 */
const stamp = scan => {
  const [d, m, y] = String(scan.date).split('/');
  return `${y}-${m}-${d}T${scan.time}`;
};

/**
 * @param {{ consignments: Array<{ consNumber: string, scans?: Array<{type,date,time}>, plannedDate?: string }>,
 *           signature?: string }} input
 */
export function buildDraftText({ consignments, signature = 'DPD' }) {
  const lines = ['Hello,', '', 'Thank you for your message.'];
  for (const item of consignments) {
    const latest = [...(item.scans ?? [])].filter(s => s?.type && s.date && s.time)
      .sort((a, b) => stamp(a).localeCompare(stamp(b))).at(-1);
    lines.push('', `Parcel ${item.consNumber}:`);
    if (latest) lines.push(`- Latest update: ${latest.type} on ${latest.date} at ${latest.time.slice(0, 5)}.`);
    if (item.plannedDate) lines.push(`- Scheduled delivery date: ${item.plannedDate}.`);
    if (!latest && !item.plannedDate) lines.push('- We are checking the latest information and will update you.');
  }
  lines.push('', 'Kind regards,', signature);
  return lines.join('\n');
}
