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

// A stray API error must never take the whole bot down.
client.on(Events.Error, (err) => console.error('Client error:', err));

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

  // Defer first: a cold Firestore call can exceed Discord's 3-second reply window.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (sub === 'add') {
      const text = interaction.options.getString('text');
      await addTodo(userId, text);
      await interaction.editReply(`✅ Додано: ${text}`);
    } else if (sub === 'list') {
      await interaction.editReply(renderList(await listTodos(userId)));
    } else if (sub === 'done') {
      const number = interaction.options.getInteger('number');
      const todo   = await markDone(userId, number);
      await interaction.editReply(todo ? `✅ Виконано: ${todo.text}` : `⚠️ Немає задачі №${number}`);
    } else if (sub === 'clear') {
      const count = await clearDone(userId);
      await interaction.editReply(`🧹 Прибрано виконаних: ${count}`);
    }
  } catch (err) {
    await interaction.editReply(`⚠️ ${err.message}`);
  }
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
