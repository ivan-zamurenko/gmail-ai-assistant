import { RESCHEDULE_RESULT_VERSION } from './contract.js';
/** Private snapshot navigation only; this module has no queue/depot port. */
import { randomUUID } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { formatRow, formatSummary } from './messageFormat.js';

export function rescheduleLines(result) {
  const report = result.parcel?.rescheduleResults;
  if (report?.version !== RESCHEDULE_RESULT_VERSION || !Array.isArray(report.lines) || report.lines.length > 4001
      || report.lines.some(line => typeof line !== 'string' || line.length > 600)
      || Buffer.byteLength(JSON.stringify(report)) > 850000) return null;
  return report.lines.map(line => line.replace(/[\s`]/g, ' ').split('').map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char).join(''));
}

export function createRescheduleViews({ now = Date.now } = {}) {
  const sessions = new Map();
  const drop = id => { clearTimeout(sessions.get(id)?.timer); sessions.delete(id); };
  const sweep = () => { for (const [id, state] of sessions) if (state.expires <= now()) drop(id); };
  function render(id, state, page) {
    const row = new ActionRowBuilder();
    const button = (target, label) => new ButtonBuilder().setCustomId(`reschedule:${id}:${target}`).setLabel(label).setStyle(ButtonStyle.Secondary);
    if (page > 0) row.addComponents(button(page - 1, '← Назад'));
    if (page + 1 < state.pages.length) row.addComponents(button(page + 1, 'Далі →'));
    return { content: `${state.summary}\n\n📄 Сторінка ${page + 1}/${state.pages.length}\n\u200b\n${state.pages[page]}`,
      components: row.components.length ? [row] : [], allowedMentions: { parse: [] } };
  }
  return {
    open(result, actor) {
      const lines = rescheduleLines(result);
      if (!lines?.length) return null;
      sweep();
      while (sessions.size >= 16) drop(sessions.keys().next().value);
      const summary = formatSummary(String(result.summary ?? 'Результат reschedule').slice(0, 500));
      // Leave room for the summary and page line inside Discord's 2000 characters.
      const budget = Math.max(600, 1900 - summary.length - 40);
      const pages = []; let current = '';
      for (const line of lines) {
        const row = formatRow(line).slice(0, budget);
        const gap = current ? '\n\u200b\n' : '';
        if (current && current.length + gap.length + row.length > budget) { pages.push(current); current = ''; }
        current += (current ? '\n\u200b\n' : '') + row;
      }
      if (current) pages.push(current);
      const id = randomUUID();
      const state = { pages, summary, owner: actor.user.id,
        guild: actor.guildId, channel: actor.channelId, expires: Math.min(now(), actor.createdTimestamp ?? now()) + 14 * 60_000, busy: false };
      sessions.set(id, state);
      state.timer = setTimeout(() => drop(id), Math.max(0, state.expires - now())); state.timer.unref?.();
      return render(id, state, 0);
    },
    async handle(interaction) {
      sweep();
      const match = /^reschedule:([a-f0-9-]{36}):(\d{1,4})$/.exec(interaction.customId ?? '');
      const state = match && sessions.get(match[1]);
      const page = Number(match?.[2]);
      if (!state || state.owner !== interaction.user.id || state.guild !== interaction.guildId
          || state.channel !== interaction.channelId || page >= state.pages.length) {
        await interaction.reply({ content: 'Перегляд недоступний або прострочений. Відкрий збережений результат через /result.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (state.busy) { await interaction.deferUpdate(); return; }
      state.busy = true;
      try {
        await interaction.deferUpdate();
        if (now() < state.expires) await interaction.editReply(render(match[1], state, page));
      } catch { console.warn('[reschedule] VIEW_UPDATE_FAILED'); }
      finally { state.busy = false; }
    },
    close() { for (const id of sessions.keys()) drop(id); },
  };
}
