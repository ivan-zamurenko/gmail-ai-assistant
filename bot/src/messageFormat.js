/**
 * bot/src/messageFormat.js
 * ========================
 * Presentation only: turns the extension's one-line summaries and fixed-width
 * result rows into spaced, emoji-labelled Discord text that reads well on a
 * phone. Never changes counts, statuses or reasons — it only lays them out.
 */
import { escapeMarkdown } from 'discord.js';

const SUMMARY_LABELS = [
  [/^dry run/i, '🔎'], [/^готово/i, '✅'], [/^дозволено/i, '🟢'], [/^змінено/i, '✅'],
  [/^пропущено|^skipped/i, '⏭️'], [/^перевірка|^review/i, '⚠️'], [/^помилки|errors/i, '❌'],
  [/^дата|^date/i, '🗓️'], [/retry/i, '🔁'], [/^фото/i, '📷'], [/^розпізнано/i, '🔍'],
  [/^reschedule/i, '📅'], [/targets/i, '🎯'],
];
const ROW = /^(\d{8,14})\s+(\S+)\s+([A-Z_]+)(?: \(([^)]*)\))?(?: — (.*))?$/u;

/** Literal text: no bold/links/headings/quotes can be injected by data. */
function safe(text) {
  return escapeMarkdown(String(text ?? ''))
    .replace(/[[\]]/g, '\\$&')
    .replace(/^([#>-])/, '\\$1');
}

const emojiFor = segment => SUMMARY_LABELS.find(([pattern]) => pattern.test(segment))?.[1];

/** "A | B: 1 | C: 2" → bold headline, a blank line, then one labelled line per value. */
export function formatSummary(summary) {
  const [head, ...rest] = String(summary ?? '').split(' | ').map(part => part.trim()).filter(Boolean);
  if (!head) return '';
  const headEmoji = emojiFor(head);
  const headline = `${headEmoji ? `${headEmoji} ` : ''}**${safe(head)}**`;
  const lines = rest.map(part => `${emojiFor(part) ? `${emojiFor(part)} ` : ''}${safe(part)}`);
  return lines.length ? `${headline}\n\n${lines.join('\n')}` : headline;
}

/** "123456789   ✅ ACTION (STATUS) — reason" → bold number, action, reason below. */
export function formatRow(line) {
  const match = ROW.exec(String(line ?? '').trim());
  if (!match) return safe(line);
  const [, number, icon, action, status, reason] = match;
  const head = `**${number}** ${icon} ${action}${status && status !== action ? ` · ${safe(status)}` : ''}`;
  return reason ? `${head}\n↳ ${safe(reason)}` : head;
}

/** Rows separated by a zero-width line so each parcel stands apart. */
export function formatRows(lines) {
  return (Array.isArray(lines) ? lines : String(lines ?? '').split('\n'))
    .filter(line => String(line).trim())
    .map(formatRow)
    .join('\n\u200b\n');
}

const GROUPS = [
  ['CHANGE_DATE', '✅', 'Перенесено', 'Буде перенесено'],
  ['REVIEW', '⚠️', 'Перевірка', 'Перевірка'],
  ['ERROR', '❌', 'Помилки', 'Помилки'],
  ['SKIP', '⏭️', 'Пропущено', 'Пропущено'],
];

/**
 * Final reschedule report: only non-zero counts, then parcels grouped by outcome,
 * each group headed by its emoji and count. Lines that are not result rows are
 * listed literally under "Інше".
 */
export function formatReport(summary, lines) {
  const text = String(summary ?? '');
  const dryRun = /^dry run/i.test(text);
  const segments = text.split(' | ').map(part => part.trim()).filter(Boolean);
  const kept = segments.filter((part, index) => index === 0 || !/:\s*0$/.test(part))
    .map(part => (/^(дата|date)\b/i.test(part) ? part.replace(/\s*\([^)]*\)\s*$/, '') : part));
  const head = formatSummary(kept.join(' | '));

  const groups = new Map(GROUPS.map(([action]) => [action, []]));
  const other = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    const match = ROW.exec(String(line ?? '').trim());
    if (!match || !groups.has(match[3])) { if (String(line ?? '').trim()) other.push(safe(line)); continue; }
    const [, number, , , status, reason] = match;
    groups.get(match[3]).push(`**${number}**${status ? ` · ${safe(status)}` : ''}${reason ? `\n↳ ${safe(reason)}` : ''}`);
  }
  const blocks = GROUPS.filter(([action]) => groups.get(action).length).map(([action, emoji, live, dry]) => {
    const rows = groups.get(action);
    return `${emoji} **${dryRun ? dry : live} (${rows.length})**\n${rows.join('\n')}`;
  });
  if (other.length) blocks.push(`📝 **Інше (${other.length})**\n${other.join('\n')}`);
  return blocks.length ? `${head}\n\u200b\n${blocks.join('\n\u200b\n')}` : head;
}

/** Splits a long message at line breaks into Discord-sized parts (no files). */
export function splitMessage(text, limit = 2000) {
  const parts = [];
  let current = '';
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.length > limit ? raw.slice(0, limit) : raw;
    if (current && current.length + 1 + line.length > limit) { parts.push(current); current = ''; }
    current = current ? `${current}\n${line}` : line;
  }
  if (current) parts.push(current);
  return parts;
}
