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

/** Display name only ("Jane <j@x>" → "Jane"); the address shows when expanded. */
export function senderName(from) {
  const value = line(from);
  const name = value.replace(/<[^>]*>/g, '').replace(/^"|"$/g, '').trim();
  return name || value || '—';
}

/** First sentences without quoted history or links. */
export function preview(text, max = 220) {
  const body = String(text ?? '').split('\n').filter(row => !/^\s*>/.test(row) && !/^On .+wrote:$/.test(row.trim()))
    .join(' ').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  if (!body) return '';
  const sentences = body.match(/[^.!?]+[.!?]+/g) ?? [body];
  let out = '';
  for (const sentence of sentences) { if ((out + sentence).length > max) break; out += sentence; }
  out = (out || body.slice(0, max)).trim();
  return out.length < body.length ? `${out.replace(/[.!?]*$/, '')}…` : out;
}

/** Removes the bot message from the channel only; Gmail is untouched. */
export function hideButton(id = '-') {
  return new ButtonBuilder().setCustomId(`mail:hide:${id}`).setEmoji('🗑️').setStyle(ButtonStyle.Secondary);
}

/** Service notice with its own hide button. */
export function renderNotice(content) {
  return { content, components: [new ActionRowBuilder().addComponents(hideButton())] };
}

export function renderMailCard(entry, { handled = null, expanded = false } = {}) {
  const numbers = consignmentsIn(entry);
  const head = `📨 **${senderName(entry.from)}** · <t:${Math.floor((entry.date || entry.seenAt) / 1000)}:R>`;
  const subject = `**${line(entry.subject) || '(без теми)'}**${numbers.length ? ` · 📦 ${numbers.join(', ')}` : ''}`;
  const body = expanded
    ? [`✉️ ${line(entry.from)}`, '', String(entry.text ?? '').trim().slice(0, 1600) || '_(текст лише в HTML — відкрийте в Gmail)_'].join('\n')
    : `> ${preview(entry.text) || '_(текст лише в HTML — відкрийте в Gmail)_'}`;
  const content = [head, subject, body, ...(handled ? [`✅ Оброблено · ${stamp(handled)}`] : [])].join('\n').slice(0, 1990);
  const toggle = new ButtonBuilder().setCustomId(`mail:${expanded ? 'less' : 'more'}:${entry.id}`)
    .setLabel(expanded ? 'Згорнути' : 'Розгорнути').setEmoji(expanded ? '🔼' : '📖').setStyle(ButtonStyle.Secondary);
  if (handled) return { content, components: [new ActionRowBuilder().addComponents(toggle, hideButton(entry.id))] };
  const row = new ActionRowBuilder().addComponents(
    toggle,
    new ButtonBuilder().setCustomId(`mail:reply:${entry.id}`).setLabel('AI-відповідь').setEmoji('✉️').setStyle(ButtonStyle.Primary)
      .setDisabled(numbers.length !== 1),
    new ButtonBuilder().setCustomId(`mail:done:${entry.id}`).setLabel('Оброблено').setEmoji('✅').setStyle(ButtonStyle.Success),
    hideButton(entry.id),
  );
  return { content, components: [row] };
}

export function createMailViews({ store, enqueueAndWait, acknowledge, propose, renderReply, poll, guildId, channelId }) {
  async function handle(interaction) {
    const [, action, id] = interaction.customId.split(':');
    if (action === 'hide') {
      if (ID.test(id ?? '')) store.update(id, { hidden: true });
      await interaction.deferUpdate().catch(() => {});
      await interaction.message?.delete().catch(() => {});
      return;
    }
    const entry = ID.test(id ?? '') ? store.get(id) : null;
    if (!entry) {
      await interaction.reply({ content: '⚠️ Лист уже не в кеші (зберігається 7 днів). Відкрийте його в Gmail.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'more' || action === 'less') {
      await interaction.update(renderMailCard(entry, { handled: entry.handled ?? null, expanded: action === 'more' }));
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
    const rows = open.map(entry => `• **${senderName(entry.from).slice(0, 40)}** — ${line(entry.subject).slice(0, 70) || '(без теми)'}`
      + (entry.postedId ? ` · [↗](https://discord.com/channels/${guildId}/${channelId}/${entry.postedId})` : ''));
    await interaction.editReply([`📬 **Необроблені листи: ${store.open().length}**`, '', ...rows].join('\n').slice(0, 1990));
  }

  return { handle, command };
}
