import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRows, formatSummary } from '../../bot/src/messageFormat.js';
import { createRescheduleViews } from '../../bot/src/rescheduleViews.js';

const SUMMARY = 'Dry run: перевірено 3 серій | Дозволено: 1 | Пропущено: 0 | Перевірка: 1 | Помилки: 1'
  + ' | Дата: 04/11/2026 (Europe/Dublin; IE-BPFI-2026-2027-v1)';
const ROWS = [
  '123456789   ✅ CHANGE_DATE (PENDING) — CAD today; parcel remains in depot',
  '223456789   ⚠️ REVIEW (PENDING) — Unknown latest scan; manual review required',
  '323456789   ❌ ERROR (ERROR) — Scan history unavailable or malformed',
];

test('summary becomes one emoji-labelled line per value', () => {
  assert.equal(formatSummary(SUMMARY), [
    '🔎 **Dry run: перевірено 3 серій**',
    '',
    '🟢 Дозволено: 1',
    '⏭️ Пропущено: 0',
    '⚠️ Перевірка: 1',
    '❌ Помилки: 1',
    '🗓️ Дата: 04/11/2026 (Europe/Dublin; IE-BPFI-2026-2027-v1)',
  ].join('\n'));
  assert.match(formatSummary('Готово — Змінено: 2 | Пропущено: 0 | Перевірка: 0 | Помилки: 0'), /^✅ \*\*Готово — Змінено: 2\*\*\n\n⏭️ Пропущено: 0/);
  assert.equal(formatSummary('Plain message'), '**Plain message**');
});

test('result rows are readable text with a gap, not a sideways-scrolling code block', () => {
  const text = formatRows(ROWS);
  assert.doesNotMatch(text, /```/);
  assert.equal(text.split('\n\u200b\n')[0], '**123456789** ✅ CHANGE_DATE · PENDING\n↳ CAD today; parcel remains in depot');
  assert.match(text, /\*\*223456789\*\* ⚠️ REVIEW · PENDING\n↳ Unknown latest scan; manual review required/);
  // Unrecognised or hostile text is shown literally, never as Discord formatting.
  const hostile = formatRows(['**bold** _x_ [link](https://evil.invalid) @everyone']);
  assert.doesNotMatch(hostile, /(^|[^\\])\*\*bold/);
  assert.match(hostile, /\\\*\\\*bold\\\*\\\*/);
});

test('reschedule pages use the spaced format and stay within the Discord limit', () => {
  const views = createRescheduleViews({ now: () => 1000 });
  const actor = { user: { id: 'owner' }, guildId: 'guild', channelId: 'channel', createdTimestamp: 1000 };
  const lines = Array.from({ length: 40 }, (_, i) => `${String(100000000 + i)}   ⏭️ SKIP (PENDING) — ${'reason '.repeat(12)}`);
  const payload = views.open({ summary: SUMMARY, parcel: { rescheduleResults: { version: 1, lines } } }, actor);
  assert.match(payload.content, /^🔎 \*\*Dry run/);
  assert.match(payload.content, /📄 Сторінка 1\/\d+/);
  assert.doesNotMatch(payload.content, /```/);
  assert.match(payload.content, /\*\*100000000\*\* ⏭️ SKIP · PENDING\n↳ reason/);
  assert.ok(payload.content.length <= 2000);
  views.close();
});

test('plain command replies are spaced, and fall back to the compact block when too long', async () => {
  const { createInteractionHandler } = await import('../../bot/src/interactions.js');
  let result;
  let payload;
  const handler = createInteractionHandler({ cfg: { guildId: 'guild' }, enqueueAndWait: async () => result,
    buildParcelEmbed: () => assert.fail('not a find'), acknowledgeResult: async () => {}, getResult: async () => result });
  const base = { commandName: 'reschedule', user: { id: 'owner' }, guildId: 'guild', channelId: 'channel',
    memberPermissions: { has: () => true }, options: { getSubcommand: () => 'all', getBoolean: () => true },
    isChatInputCommand: () => true, isButton: () => false, deferReply: async () => {}, editReply: async p => { payload = p; } };

  result = { id: 'r1', command: 'reschedule', status: 'done', summary: 'Готово — Змінено: 1 | Пропущено: 0 | Перевірка: 0 | Помилки: 0',
    details: '123456789   ✅ CHANGE_DATE (PENDING) — CAD today; parcel remains in depot' };
  await handler(base);
  const spaced = typeof payload === 'string' ? payload : payload.content;
  assert.match(spaced, /^✅ \*\*Готово — Змінено: 1\*\*\n\n⏭️ Пропущено: 0/);
  assert.match(spaced, /\*\*123456789\*\* ✅ CHANGE_DATE · PENDING\n↳ CAD today/);

  result = { id: 'r2', command: 'reschedule', status: 'error', summary: 'Помилка',
    // Free text full of markdown characters doubles in length once escaped.
    details: Array.from({ length: 25 }, () => '_'.repeat(70)).join('\n') };
  await handler(base);
  const compact = typeof payload === 'string' ? payload : payload.content;
  assert.ok(compact.length <= 2000);
  assert.match(compact, /^❌ Помилка\n```/);
});
