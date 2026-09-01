/**
 * bot/src/index.js
 * ================
 * The running bot. Turns a Discord slash command into a queue task, waits for
 * the extension's result, and edits the reply with a one-line summary.
 *
 *   npm start
 */
import {
  Client, Events, GatewayIntentBits, MessageFlags, PermissionFlagsBits,
} from 'discord.js';

import { loadConfig }     from '../config/config.js';
import { enqueueAndWait } from './queue.js';
import { COMMANDS, RESCHEDULE_MODE, STATUS } from './contract.js';
import { buildParcelEmbed } from './render.js';
import { addTodo, listTodos, markDone, clearDone, renderList } from './todo.js';
import { safeErrorMessage } from './errors.js';
import { validateConsignmentNumber, validateFutureWorkday } from './validation.js';

const cfg = loadConfig();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot online as ${c.user.tag}`);
});

// A stray API error must never take the whole bot down.
client.on(Events.Error, (err) => console.error('Client error:', err));

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Commands are guild-scoped at registration, but keep a runtime gate too: it
  // protects us if registration changes or an interaction is ever misrouted.
  if (interaction.guildId !== cfg.guildId) {
    await interaction.reply({ content: '⛔ This bot is not enabled here.', flags: MessageFlags.Ephemeral });
    return;
  }

  const touchesDepot = interaction.commandName !== 'todo';
  if (touchesDepot && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '⛔ Depot commands require Administrator permission.', flags: MessageFlags.Ephemeral });
    return;
  }

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
    await interaction.editReply(`⚠️ ${safeErrorMessage(err)}`);
  }
}

/** Depot commands (/reschedule) — routed through the queue to the extension. */
async function handleDepotCommand(interaction) {
  const command = interaction.commandName;

  const mode   = interaction.options.getSubcommand(); // all | parcel | barcodes | retry
  const dryRun = interaction.options.getBoolean('dry_run') ?? true;
  const confirmLive = interaction.options.getBoolean('confirm_live') ?? false;

  if (!dryRun && !confirmLive) {
    await interaction.reply({
      content: '⚠️ Live-зміна потребує `confirm_live:true`. Спочатку виконай dry run.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let args;
  if (mode === RESCHEDULE_MODE.PARCEL) {
    const conId   = interaction.options.getString('con_id');
    const newDate = interaction.options.getString('new_date');

    const numberError = validateConsignmentNumber(conId);
    if (numberError) {
      await interaction.reply({ content: `⚠️ ${numberError}`, flags: MessageFlags.Ephemeral });
      return;
    }
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await enqueueAndWait({
      command,
      args,
      requestedBy: interaction.user.id,
    });

    await replyWithResult(interaction, result);
  } catch (err) {
    await interaction.editReply(`⚠️ ${safeErrorMessage(err)}`);
  }
}

/** Looks up one consignment and shows its latest status — read-only, no date. */
async function handleFind(interaction) {
  const conId = interaction.options.getString('con_id');

  const numberError = validateConsignmentNumber(conId);
  if (numberError) {
    await interaction.reply({
      content: `⚠️ ${numberError}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const t0 = Date.now();
  try {
    const result = await enqueueAndWait({
      command:     COMMANDS.FIND,
      args:        { conId },
      requestedBy: interaction.user.id,
    });
    const t1 = Date.now();
    // Split the round trip: queue pickup (listener asleep?) vs depot work itself.
    const totalMs  = t1 - t0;
    const execMs   = result.execMs ?? 0;
    const pickupMs = totalMs - execMs;
    const logRef = `…${conId.slice(-4)}`;
    console.log(`[find ${logRef}] extension: ${(totalMs / 1000).toFixed(1)}s`
      + ` (pickup ${(pickupMs / 1000).toFixed(1)}s + depot ${(execMs / 1000).toFixed(1)}s)`);

    if (result.parcel) {
      const tm = result.parcel.timing;
      if (tm) console.log(`[find ${logRef}] depot phases: search ${tm.search}ms + detail ${tm.detail}ms + scans ${tm.scans}ms`);
      if (result.parcel._diag) console.log(`[find ${logRef}] tabs:`, JSON.stringify(result.parcel._diag));
      const payload = await buildParcelEmbed(result.parcel, cfg.googleMapsApiKey);
      console.log(`[find ${logRef}] geo+map+render: ${((Date.now() - t1) / 1000).toFixed(1)}s`);
      await interaction.editReply(payload);
    } else {
      await replyWithResult(interaction, result);
    }
  } catch (err) {
    await interaction.editReply(`⚠️ ${safeErrorMessage(err)}`);
  }
}

/** One place that turns an extension result into the Discord reply. */
async function replyWithResult(interaction, result) {
  const icon    = result.status === STATUS.ERROR ? '❌' : '✅';
  const summary = result.summary ?? (result.status === STATUS.ERROR ? 'Помилка виконання' : 'Готово');
  const details = result.details ? `\n\`\`\`\n${result.details}\n\`\`\`` : '';
  await interaction.editReply(`${icon} ${summary}${details}`);
}

client.login(cfg.discordToken);
