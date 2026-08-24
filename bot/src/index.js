/**
 * bot/src/index.js
 * ================
 * The running bot. Turns a Discord slash command into a queue task, waits for
 * the extension's result, and edits the reply with a one-line summary.
 *
 *   npm start
 */
import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';

import { loadConfig }     from '../config/config.js';
import { enqueueAndWait } from './queue.js';
import { STATUS }         from './contract.js';
import { addTodo, listTodos, markDone, clearDone, renderList } from './todo.js';

const cfg = loadConfig();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot online as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /todo lives entirely in the bot + Firestore — no depot round-trip.
  if (interaction.commandName === 'todo') {
    await handleTodo(interaction);
    return;
  }

  await handleDepotCommand(interaction);
});

/** Personal to-do list — replies are ephemeral so only the author sees them. */
async function handleTodo(interaction) {
  const sub    = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  try {
    if (sub === 'add') {
      const text = interaction.options.getString('text');
      await addTodo(userId, text);
      await reply(interaction, `✅ Додано: ${text}`);
    } else if (sub === 'list') {
      await reply(interaction, renderList(await listTodos(userId)));
    } else if (sub === 'done') {
      const number = interaction.options.getInteger('number');
      const todo   = await markDone(userId, number);
      await reply(interaction, todo ? `✅ Виконано: ${todo.text}` : `⚠️ Немає задачі №${number}`);
    } else if (sub === 'clear') {
      const count = await clearDone(userId);
      await reply(interaction, `🧹 Прибрано виконаних: ${count}`);
    }
  } catch (err) {
    await reply(interaction, `⚠️ ${err.message}`);
  }
}

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/** Depot commands (/find, /reschedule, /check_barcodes) — routed through the queue. */
async function handleDepotCommand(interaction) {
  const command = interaction.commandName;
  const args = command === 'find'
    ? { query: interaction.options.getString('query') }
    : { dryRun: interaction.options.getBoolean('dry_run') ?? true };

  // The depot round-trip is slower than Discord's 3-second reply window.
  await interaction.deferReply();

  try {
    const result = await enqueueAndWait({
      command,
      args,
      requestedBy: interaction.user.tag,
      channelId:   interaction.channelId,
    });

    const summary = result.summary ?? (result.status === STATUS.ERROR ? 'Помилка виконання' : 'Готово');
    await interaction.editReply(`${result.status === STATUS.ERROR ? '❌' : '✅'} ${summary}`);
  } catch (err) {
    await interaction.editReply(`⚠️ ${err.message}`);
  }
}

client.login(cfg.discordToken);
