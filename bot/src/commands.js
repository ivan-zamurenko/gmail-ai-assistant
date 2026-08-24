/**
 * bot/src/commands.js
 * ===================
 * Slash-command definitions. Kept separate from the runtime so the register
 * script and the bot share one source of truth for names and options.
 */
import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('find')
    .setDescription('Знайти посилку в депо за номером, reference або адресою')
    .addStringOption(o =>
      o.setName('query')
       .setDescription('Номер посилки / reference / частина адреси')
       .setRequired(true)),

  new SlashCommandBuilder()
    .setName('reschedule')
    .setDescription('Перенести CAD-посилки на наступний робочий день')
    .addBooleanOption(o =>
      o.setName('dry_run')
       .setDescription('true = лише показати, нічого не змінювати (за замовч. true)')),

  new SlashCommandBuilder()
    .setName('check_barcodes')
    .setDescription('Зчитати штрихкоди лейблів з Drive і звірити в депо')
    .addBooleanOption(o =>
      o.setName('dry_run')
       .setDescription('true = лише показати, нічого не рухати (за замовч. true)')),

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
