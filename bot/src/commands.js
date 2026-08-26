/**
 * bot/src/commands.js
 * ===================
 * Slash-command definitions. Kept separate from the runtime so the register
 * script and the bot share one source of truth for names and options.
 */
import { SlashCommandBuilder } from 'discord.js';

const dryRunOption = (o) =>
  o.setName('dry_run')
   .setDescription('true = лише показати, нічого не змінювати (за замовч. true)');

export const commands = [
  new SlashCommandBuilder()
    .setName('reschedule')
    .setDescription('Перенести посилки на майбутню дату')
    .addSubcommand(s =>
      s.setName('all')
       .setDescription('Знайти всі CAD-посилки з майбутньою датою і перенести')
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
          .setDescription('Дата YYYY-MM-DD — майбутня, не субота й не неділя')
          .setRequired(true))
       .addBooleanOption(dryRunOption))
    .addSubcommand(s =>
      s.setName('barcodes')
       .setDescription('Зчитати лейбли з Drive і перенести знайдені посилки')
       .addBooleanOption(dryRunOption)),

  new SlashCommandBuilder()
    .setName('find')
    .setDescription('Знайти посилку і показати її останній статус')
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
];
