/** Recovery displays retained results only: there is deliberately no enqueue port. */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { validateConsignmentNumber } from './validation.js';
import { safeErrorMessage } from './errors.js';

const PAGE_SIZE = 4;
const button = (id, label) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Secondary);

export function createResultRecovery({ listResults, getResult, acknowledgeResult, buildParcelEmbed, resultMessage, cfg }) {
  return async function recover(interaction) {
    const actor = { requestedBy: interaction.user.id, guildId: interaction.guildId };
    let id;
    let offset = 0;
    let consignment;
    try {
      if (interaction.isButton?.()) {
        const show = /^result:show:([a-zA-Z0-9-]{1,80})$/.exec(interaction.customId);
        const page = /^result:page:(\d{1,8}):(\d{9}|\d{14})?$/.exec(interaction.customId);
        if (show) id = show[1];
        else if (page) { offset = Number(page[1]); consignment = page[2]; }
        else throw new Error('Invalid recovery request');
      } else {
        consignment = interaction.options.getString('con_id') ?? undefined;
        if (consignment !== undefined && (typeof consignment !== 'string' || validateConsignmentNumber(consignment))) throw new Error('Invalid recovery request');
      }
    } catch {
      await interaction.reply({ content: '⚠️ Некоректний запит результату.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      let result;
      if (id) result = await getResult(id, actor);
      else {
        const matches = await listResults(actor, consignment);
        if (consignment && matches.length === 1) result = matches[0];
        else if (matches.length) {
          offset = Math.min(Math.floor(offset / PAGE_SIZE) * PAGE_SIZE, Math.floor((matches.length - 1) / PAGE_SIZE) * PAGE_SIZE);
          const components = matches.slice(offset, offset + PAGE_SIZE).map(record => {
            const number = record.args?.conId ?? record.parcel?.consNumber ?? '';
            const mode = record.command === 'reschedule' ? `${record.args?.mode ?? ''} ${record.args?.dryRun === false ? 'LIVE' : 'preview'}` : '';
            const label = `${record.command} ${mode} ${number} · ${new Date(record.completedAt.toMillis()).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
            return new ActionRowBuilder().addComponents(button(`result:show:${record.id}`, label.slice(0, 80)));
          });
          const navigation = new ActionRowBuilder();
          if (offset > 0) navigation.addComponents(button(`result:page:${offset - PAGE_SIZE}:${consignment ?? ''}`, 'Назад'));
          if (offset + PAGE_SIZE < matches.length) navigation.addComponents(button(`result:page:${offset + PAGE_SIZE}:${consignment ?? ''}`, 'Далі'));
          if (navigation.components.length) components.push(navigation);
          await interaction.editReply({ content: `Збережені результати ${offset + 1}–${Math.min(offset + PAGE_SIZE, matches.length)} з ${matches.length}. Обери результат:`, components });
          return;
        }
      }
      if (!result) {
        await interaction.editReply('Збереженого результату немає або минуло 24 години. Depot-команду не повторено.');
        return;
      }
      const payload = result.parcel ? await buildParcelEmbed(result.parcel, cfg.googleMapsApiKey) : resultMessage(result);
      await interaction.editReply(payload);
      // A failed ACK must not overwrite the successfully delivered card.
      try { await acknowledgeResult(result.id, actor); }
      catch (err) { console.error('Recovery acknowledgement failed:', safeErrorMessage(err, 'Queue acknowledgement failed')); }
    } catch (err) {
      try { await interaction.editReply(`⚠️ ${safeErrorMessage(err, 'Result recovery failed')}. Результат не підтверджено як доставлений; depot-команду не повторено.`); }
      catch (failure) { console.error('Recovery delivery failed:', safeErrorMessage(failure, 'Discord operation failed')); }
    }
  };
}
