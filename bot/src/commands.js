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
];
