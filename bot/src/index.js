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
import { COMMANDS, RESCHEDULE_MODE, STATUS } from './contract.js';
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

  if (interaction.commandName === COMMANDS.FIND) {
    await handleFind(interaction);
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

/** Depot commands (/reschedule) — routed through the queue to the extension. */
async function handleDepotCommand(interaction) {
  const command = interaction.commandName;

  const mode   = interaction.options.getSubcommand();      // all | parcel | barcodes
  const dryRun = interaction.options.getBoolean('dry_run') ?? true;

  let args;
  if (mode === RESCHEDULE_MODE.PARCEL) {
    const conId   = interaction.options.getString('con_id');
    const newDate = interaction.options.getString('new_date');

    const dateError = validateFutureWorkday(newDate);
    if (dateError) {
      await interaction.reply({ content: `⚠️ ${dateError}`, flags: MessageFlags.Ephemeral });
      return;
    }
    args = { mode, conId, newDate, dryRun };
  } else {
    args = { mode, dryRun };
  }

  // The depot round-trip is slower than Discord's 3-second reply window.
  await interaction.deferReply();

  try {
    const result = await enqueueAndWait({
      command,
      args,
      requestedBy: interaction.user.tag,
      channelId:   interaction.channelId,
    });

    await replyWithResult(interaction, result);
  } catch (err) {
    await interaction.editReply(`⚠️ ${err.message}`);
  }
}

/** Looks up one consignment and shows its latest status — read-only, no date. */
async function handleFind(interaction) {
  const conId = interaction.options.getString('con_id');

  await interaction.deferReply();

  try {
    const result = await enqueueAndWait({
      command:     COMMANDS.FIND,
      args:        { conId },
      requestedBy: interaction.user.tag,
      channelId:   interaction.channelId,
    });

    await replyWithResult(interaction, result);
  } catch (err) {
    await interaction.editReply(`⚠️ ${err.message}`);
  }
}

/** One place that turns an extension result into the Discord reply. */
async function replyWithResult(interaction, result) {
  const icon    = result.status === STATUS.ERROR ? '❌' : '✅';
  const summary = result.summary ?? (result.status === STATUS.ERROR ? 'Помилка виконання' : 'Готово');
  const details = result.details ? `\n\`\`\`\n${result.details}\n\`\`\`` : '';
  const link    = result.link ? `\n📍 ${result.link}` : '';
  await interaction.editReply(`${icon} ${summary}${details}${link}`);
}

/** Returns an error message if the date is not a valid future weekday, else null. */
function validateFutureWorkday(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return 'Дата має бути у форматі YYYY-MM-DD (напр. 2026-08-28)';
  }

  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Некоректна дата';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date <= today) return 'Дата має бути пізніше за сьогодні';

  const day = date.getDay(); // 0 = неділя, 6 = субота
  if (day === 0 || day === 6) return 'Дата не може бути суботою чи неділею';

  return null;
}

client.login(cfg.discordToken);
