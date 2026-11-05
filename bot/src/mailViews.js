/**
 * Mail channel (owner decision MAIL-IN-DISCORD 2026-11-05): cards for new
 * depot22 mail, read/reply/handled buttons and /mail. Nothing here sends email.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { COMMANDS } from './contract.js';
import { safeErrorMessage } from './errors.js';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const stamp = ms => `<t:${Math.floor(ms / 1000)}:f>`;
const line = value => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Distinct 9/14-digit consignment candidates in subject + text. */
export function consignmentsIn(entry) {
  return [...new Set(`${entry.subject ?? ''}\n${entry.text ?? ''}`.match(/\b(?:\d{14}|\d{9})\b/g) ?? [])];
}

function quote(text, max) {
  const body = String(text ?? '').trim();
  if (!body) return '> _(текст лише в HTML — відкрийте в Gmail)_';
  const cut = body.length > max ? `${body.slice(0, max).trimEnd()}…` : body;
  return cut.split('\n').slice(0, 12).map(row => `> ${row}`).join('\n');
}

export function renderMailCard(entry, { handled = null } = {}) {
  const numbers = consignmentsIn(entry);
  const content = [
    `📨 **Новий лист** · ${stamp(entry.date || entry.seenAt)}`,
    `👤 **Від:** ${line(entry.from) || '—'}`,
    `📝 **Тема:** ${line(entry.subject) || '—'}`,
    `📦 **Номер:** ${numbers.length ? numbers.join(', ') : '❔ не знайдено'}`,
    '',
    quote(entry.text, 500),
    ...(handled ? ['', `✅ **Оброблено** · ${stamp(handled)}`] : []),
  ].join('\n').slice(0, 1990);
  if (handled) return { content, components: [] };
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mail:read:${entry.id}`).setLabel('Читати').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mail:reply:${entry.id}`).setLabel('AI-відповідь').setEmoji('✉️').setStyle(ButtonStyle.Primary)
      .setDisabled(numbers.length !== 1),
    new ButtonBuilder().setCustomId(`mail:done:${entry.id}`).setLabel('Оброблено').setEmoji('✅').setStyle(ButtonStyle.Success),
  );
  return { content, components: [row] };
}

function chunks(text, size = 1900) {
  const out = [];
  for (let i = 0; i < text.length && out.length < 3; i += size) out.push(text.slice(i, i + size));
  return out;
}

export function createMailViews({ store, enqueueAndWait, acknowledge, propose, renderReply, poll, guildId, channelId }) {
  async function handle(interaction) {
    const [, action, id] = interaction.customId.split(':');
    const entry = ID.test(id ?? '') ? store.get(id) : null;
    if (!entry) {
      await interaction.reply({ content: '⚠️ Лист уже не в кеші (зберігається 7 днів). Відкрийте його в Gmail.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'read') {
      const full = [`👤 ${line(entry.from)}`, `📝 ${line(entry.subject)}`, '', entry.text?.trim() || '_(текст лише в HTML — відкрийте в Gmail)_'].join('\n');
      const [first, ...rest] = chunks(full);
      await interaction.reply({ content: first, flags: MessageFlags.Ephemeral });
      for (const part of rest) await interaction.followUp({ content: part, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      if (action === 'reply') {
        const numbers = consignmentsIn(entry);
        if (numbers.length !== 1) { await interaction.editReply('⚠️ Потрібен рівно один номер посилки — використайте `/reply`.'); return; }
        const result = await enqueueAndWait({ command: COMMANDS.FIND, args: { conId: numbers[0] }, requestedBy: interaction.user.id });
        await acknowledge(interaction, result);
        if (!result.parcel) { await interaction.editReply(`⚠️ ${result.summary || 'Посилку не знайдено'}`); return; }
        await interaction.editReply(renderReply(await propose({ parcel: result.parcel, query: numbers[0], text: entry.text ?? '' }), result.parcel));
        return;
      }
      if (action === 'done') {
        const result = await enqueueAndWait({ command: COMMANDS.MAIL_MARK, args: { messageId: entry.id }, requestedBy: interaction.user.id },
          { timeoutMs: 90_000 });
        await acknowledge(interaction, result);
        if (result.status !== 'done') { await interaction.editReply(`⚠️ ${result.summary || 'Мітку не додано'}`); return; }
        const handled = Date.now();
        store.update(entry.id, { handled });
        await interaction.message?.edit(renderMailCard(entry, { handled })).catch(() => {});
        await interaction.editReply('✅ Позначено міткою **AI-Read** у Gmail.');
      }
    } catch (err) {
      await interaction.editReply(`⚠️ ${safeErrorMessage(err, 'Операцію не виконано')}`).catch(() => {});
    }
  }

  async function command(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await poll().catch(() => {});
    const open = store.open().slice(0, 10);
    if (!open.length) { await interaction.editReply('📭 Необроблених листів немає.'); return; }
    const rows = open.map(entry => `• ${stamp(entry.date || entry.seenAt)} · 👤 ${line(entry.from).slice(0, 60)} — 📝 ${line(entry.subject).slice(0, 80) || '—'}`
      + (entry.postedId ? ` → [відкрити](https://discord.com/channels/${guildId}/${channelId}/${entry.postedId})` : ''));
    await interaction.editReply([`📬 **Необроблені листи: ${store.open().length}**`, '', ...rows].join('\n').slice(0, 1990));
  }

  return { handle, command };
}
