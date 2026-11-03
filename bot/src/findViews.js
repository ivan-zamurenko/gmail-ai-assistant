/** Short-lived private UI state, independent of acknowledged queue results. */
import { randomUUID } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { findParcelNumbers, findHistoryPages } from './render.js';

const TTL = 14 * 60_000;
const LIMIT = 16;
export function createFindViews({ buildParcelEmbed, apiKey = '', now = Date.now }) {
  const sessions = new Map();
  const drop = id => { clearTimeout(sessions.get(id)?.timer); sessions.delete(id); };
  const sweep = () => { for (const [id, state] of sessions) if (now() >= state.expires) drop(id); };
  async function render(id, state, selected = 'all', page = 0) {
    const parcelNumber = selected === 'all' ? undefined : selected;
    const pages = findHistoryPages(state.parcel, parcelNumber);
    if (page >= pages || (parcelNumber && !state.numbers.includes(parcelNumber))) throw new Error('Invalid view');
    const payload = await buildParcelEmbed(state.parcel, apiKey, { parcelNumber, page });
    if (!payload.embeds?.[1]) return payload;
    const components = [];
    const button = (number, targetPage, label) => new ButtonBuilder().setCustomId(`find:${id}:${number}:${targetPage}`).setLabel(label).setStyle(ButtonStyle.Secondary);
    if (state.numbers.length > 1) {
      const row = new ActionRowBuilder();
      const index = state.numbers.indexOf(selected);
      if (index >= 0) row.addComponents(button('all', 0, 'Overview'));
      if (index > 0) row.addComponents(button(state.numbers[index - 1], 0, `← Parcel ${state.numbers[index - 1]}`));
      if (index + 1 < state.numbers.length) row.addComponents(button(state.numbers[index + 1], 0, `Parcel ${state.numbers[index + 1]} →`));
      components.push(row);
    }
    if (pages > 1) {
      const row = new ActionRowBuilder();
      if (page > 0) row.addComponents(button(selected, page - 1, '← Newer scans'));
      if (page + 1 < pages) row.addComponents(button(selected, page + 1, 'Older scans →'));
      components.push(row);
    }
    return { ...payload, components, attachments: [] };
  }
  return {
    async open(parcel, interaction) {
      if (!Array.isArray(parcel.scans) || parcel.scans.length > 1000) return buildParcelEmbed(parcel, apiKey);
      sweep();
      while (sessions.size >= LIMIT) drop(sessions.keys().next().value);
      const id = randomUUID();
      const created = Number.isFinite(interaction.createdTimestamp) ? interaction.createdTimestamp : now();
      const state = { parcel, numbers: findParcelNumbers(parcel), owner: interaction.user.id, guild: interaction.guildId,
        channel: interaction.channelId, expires: Math.min(now(), created) + TTL, busy: false };
      sessions.set(id, state);
      state.timer = setTimeout(() => drop(id), Math.max(0, state.expires - now()));
      state.timer.unref?.();
      try { return await render(id, state); }
      catch (error) { drop(id); throw error; }
    },
    async handle(interaction) {
      sweep();
      const match = /^find:([a-f0-9-]{36}):(all|[1-9]\d{0,5}):(\d{1,3})$/.exec(interaction.customId || '');
      const state = match && sessions.get(match[1]);
      if (!state || state.owner !== interaction.user.id || state.guild !== interaction.guildId || state.channel !== interaction.channelId) {
        await interaction.reply({ content: 'Find view expired or unavailable. Use /find again.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (state.busy) { await interaction.deferUpdate(); return; }
      state.busy = true;
      try {
        await interaction.deferUpdate();
        const payload = await render(match[1], state, match[2], Number(match[3]));
        if (now() >= state.expires) throw new Error('View expired');
        await interaction.editReply(payload);
      } catch {
        console.warn('[find] VIEW_UPDATE_FAILED');
        try { await interaction.followUp({ content: 'Unable to update find view. Try again or use /find.', flags: MessageFlags.Ephemeral }); }
        catch { console.warn('[find] VIEW_NOTICE_FAILED'); }
      } finally { state.busy = false; }
    },
    close() { for (const id of sessions.keys()) drop(id); },
  };
}
