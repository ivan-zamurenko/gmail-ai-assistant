/**
 * bot/src/commands.js
 * ===================
 * Slash-command definitions. Kept separate from the runtime so the register
 * script and the bot share one source of truth for names and options.
 */
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const dryRunOption = (o) =>
  o.setName('dry_run')
   .setDescription('true = лише перегляд; false = LIVE-перенос (за замовч. true)');

export const commands = [
  new SlashCommandBuilder()
    .setName('reschedule')
    .setDescription('Перенести посилки на майбутню дату')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s =>
      s.setName('all')
       .setDescription('Перевірити список depot і перенести серії за сканами та Notes')
       .addBooleanOption(dryRunOption))
    .addSubcommand(s =>
      s.setName('parcel')
       .setDescription('Перенести одну посилку на задану дату')
       .addStringOption(o =>
         o.setName('con_id')
          .setDescription('Номер посилки (consignment)')
          .setRequired(true))
       .addStringOption(o =>
         o.setName('new_date')
          .setDescription('Дата YYYY-MM-DD — майбутній робочий день за календарем Ірландії')
          .setRequired(true))
       .addBooleanOption(dryRunOption))
    .addSubcommand(s =>
      s.setName('barcodes')
       .setDescription('Зчитати лейбли з Drive і перенести знайдені посилки')
       .addBooleanOption(dryRunOption))
    .addSubcommand(s =>
      s.setName('retry')
       .setDescription('Повторити сьогоднішні server errors без скану Drive')
       .addBooleanOption(dryRunOption)),

  new SlashCommandBuilder()
    .setName('find')
    .setDescription('Знайти посилку і показати її останній статус')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('con_id')
       .setDescription('Номер посилки (consignment)')
       .setRequired(true)),

  new SlashCommandBuilder()
    .setName('todo')
    .setDescription('Особистий список задач на день')
    .addSubcommand(s =>
      s.setName('add')
       .setDescription('Додати задачу')
       .addStringOption(o =>
         o.setName('text')
          .setDescription('Текст задачі')
          .setRequired(true)))
    .addSubcommand(s =>
      s.setName('list')
       .setDescription('Показати список задач'))
    .addSubcommand(s =>
      s.setName('done')
       .setDescription('Відмітити задачу виконаною')
       .addIntegerOption(o =>
         o.setName('number')
          .setDescription('Номер задачі зі списку')
          .setRequired(true)))
    .addSubcommand(s =>
      s.setName('clear')
       .setDescription('Прибрати всі виконані задачі')),
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Create a driver recovery and redelivery report')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('con_id').setDescription('Consignment number').setRequired(true))
    .addStringOption(o => o.setName('eircode').setDescription('Correct destination Eircode; omit to use depot value').setMaxLength(12)),
  new SlashCommandBuilder()
    .setName('result')
    .setDescription('Показати збережений результат без повторної дії в depot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('con_id').setDescription('Номер посилки; без номера — список результатів')),
  new SlashCommandBuilder()
    .setName('reply')
    .setDescription('AI-чернетка відповіді клієнту за фактами депо (нічого не надсилає)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('con_id').setDescription('Номер посилки (consignment)').setRequired(true))
    .addStringOption(o => o.setName('text').setDescription('Текст листа клієнта').setRequired(true).setMaxLength(4000)),

];
