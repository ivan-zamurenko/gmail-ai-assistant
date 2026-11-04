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
  [/^дата/i, '🗓️'], [/retry/i, '🔁'], [/^фото/i, '📷'], [/^розпізнано/i, '🔍'],
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
