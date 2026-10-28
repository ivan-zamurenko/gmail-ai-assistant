/** Discord interaction boundary; importing this module never starts a client or Firebase. */
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { COMMANDS, RESCHEDULE_MODE, STATUS } from './contract.js';
import { safeErrorMessage } from './errors.js';
import { validateConsignmentNumber, validateFutureWorkday } from './validation.js';
import { renderBarcodeProgress, shouldPublishBarcodeProgress } from './barcodeProgress.js';

export function createInteractionHandler({
  cfg, enqueueAndWait, buildParcelEmbed,
  addTodo, listTodos, markDone, clearDone, renderList,
}) {
  async function handleInteraction(interaction) {
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

    // Parse once before defer or any queue/todo effect. SDK getter errors must
    // not escape the listener or echo user input in an error response.
    let request;
    try {
      request = readRequest(interaction);
    } catch {
      request = { error: 'Некоректна команда або параметри.' };
    }
    if (request.error) {
      await interaction.reply({ content: `⚠️ ${request.error}`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.commandName === 'todo') {
      await handleTodo(interaction, request);
    } else if (interaction.commandName === COMMANDS.FIND) {
      await handleFind(interaction, request.conId);
    } else {
      await handleDepotCommand(interaction, request);
    }
  }

  function readRequest(interaction) {
    const invalid = { error: 'Некоректна команда або параметри.' };
    if (typeof interaction.user?.id !== 'string' || !interaction.user.id.trim()) return invalid;
    const command = interaction.commandName;
    if (command === 'todo') {
      const sub = interaction.options.getSubcommand();
      if (!['add', 'list', 'done', 'clear'].includes(sub)) return invalid;
      if (sub === 'add') {
        const text = interaction.options.getString('text');
        return typeof text === 'string' && text.trim() ? { sub, text } : invalid;
      }
      if (sub === 'done') {
        const number = interaction.options.getInteger('number');
        return Number.isSafeInteger(number) && number > 0 ? { sub, number } : invalid;
      }
      return { sub };
    }
    if (command === COMMANDS.FIND) {
      const conId = interaction.options.getString('con_id');
      if (typeof conId !== 'string') return invalid;
      const error = validateConsignmentNumber(conId);
      return error ? { error } : { conId };
    }
    if (command !== COMMANDS.RESCHEDULE) return invalid;
    const mode = interaction.options.getSubcommand();
    if (!Object.values(RESCHEDULE_MODE).includes(mode)) return invalid;
    // Discord returns null for an absent optional boolean, unlike the wire task.
    const dryRun = interaction.options.getBoolean('dry_run') ?? true;
    if (typeof dryRun !== 'boolean') return invalid;
    if (mode !== RESCHEDULE_MODE.PARCEL) return { mode, dryRun };
    const conId = interaction.options.getString('con_id');
    const newDate = interaction.options.getString('new_date');
    if (typeof conId !== 'string' || typeof newDate !== 'string') return invalid;
    const error = validateConsignmentNumber(conId) || validateFutureWorkday(newDate);
    return error ? { error } : { mode, conId, newDate, dryRun };
  }

  /** Personal to-do list — replies are ephemeral so only the author sees them. */
  async function handleTodo(interaction, { sub, text, number }) {
    const userId = interaction.user.id;

    // Defer first: a cold Firestore call can exceed Discord's 3-second reply window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (sub === 'add') {
        await addTodo(userId, text);
        await interaction.editReply(`✅ Додано: ${text}`);
      } else if (sub === 'list') {
        await interaction.editReply(renderList(await listTodos(userId)));
      } else if (sub === 'done') {
        const todo   = await markDone(userId, number);
        await interaction.editReply(todo ? `✅ Виконано: ${todo.text}` : `⚠️ Немає задачі №${number}`);
      } else if (sub === 'clear') {
        const count = await clearDone(userId);
        await interaction.editReply(`🧹 Прибрано виконаних: ${count}`);
      }
    } catch (err) {
      await interaction.editReply(`⚠️ ${safeErrorMessage(err, 'Discord operation failed')}`);
    }
  }

  /** Depot commands (/reschedule) — routed through the queue to the extension. */
  async function handleDepotCommand(interaction, args) {
    const command = interaction.commandName;
    const { mode, dryRun } = args;

    // The depot round-trip is slower than Discord's 3-second reply window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (mode === RESCHEDULE_MODE.BARCODES) {
        await interaction.editReply(
          `⏳ Scan Drive Labels запускається (${dryRun ? 'DRY RUN' : 'LIVE'})…`,
        );

        let published = null;
        let edits = Promise.resolve();
        const onProgress = (progress) => {
          const now = Date.now();
          if (!shouldPublishBarcodeProgress(published, progress, now)) return;
          published = { ...progress, publishedAt: now };
          edits = edits
            .then(() => interaction.editReply(renderBarcodeProgress(progress, dryRun)))
            .catch((err) => console.error('Barcode progress update failed:', safeErrorMessage(err, 'Discord operation failed')));
        };

        const queued = enqueueAndWait({
          command,
          args,
          requestedBy: interaction.user.id,
        }, { timeoutMs: 2 * 60 * 60_000, onProgress });

        queued.then(
          async (result) => {
            await edits;
            await interaction.editReply('✅ Scan Drive Labels завершено — фінальний звіт надіслано в DM.');
            await interaction.user.send(resultMessage(result));
          },
          async (err) => {
            await edits;
            const message = `⚠️ Scan Drive Labels: ${safeErrorMessage(err, 'Discord operation failed')}`;
            await interaction.editReply(message);
            await interaction.user.send(message);
          },
        ).catch((err) => console.error('Barcode result delivery failed:', safeErrorMessage(err, 'Discord operation failed')));
        return;
      }

      const queued = enqueueAndWait({
        command,
        args,
        requestedBy: interaction.user.id,
      });

      const result = await queued;
      await replyWithResult(interaction, result);
    } catch (err) {
      await interaction.editReply(`⚠️ ${safeErrorMessage(err, 'Discord operation failed')}`);
    }
  }

  /** Looks up one consignment and shows its latest status — read-only, no date. */
  async function handleFind(interaction, conId) {
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
      const duration = (value) => Number.isFinite(value) && value >= 0 ? value : 0;
      const execMs   = duration(result.execMs);
      const pickupMs = totalMs - execMs;
      console.log(`[find] extension: ${(totalMs / 1000).toFixed(1)}s`
        + ` (pickup ${(pickupMs / 1000).toFixed(1)}s + depot ${(execMs / 1000).toFixed(1)}s)`);

      if (result.parcel) {
        const tm = result.parcel.timing;
        if (tm) console.log(`[find] depot phases: search ${duration(tm.search)}ms + detail ${duration(tm.detail)}ms + scans ${duration(tm.scans)}ms`);
        const payload = await buildParcelEmbed(result.parcel, cfg.googleMapsApiKey);
        console.log(`[find] geo+map+render: ${((Date.now() - t1) / 1000).toFixed(1)}s`);
        await interaction.editReply(payload);
      } else {
        await replyWithResult(interaction, result);
      }
    } catch (err) {
      await interaction.editReply(`⚠️ ${safeErrorMessage(err, 'Discord operation failed')}`);
    }
  }

  /** One place that turns an extension result into the Discord reply. */
  function resultMessage(result) {
    const icon    = result.status === STATUS.ERROR ? '❌' : '✅';
    const summary = result.summary ?? (result.status === STATUS.ERROR ? 'Помилка виконання' : 'Готово');
    const details = result.details ? `\n\`\`\`\n${result.details}\n\`\`\`` : '';
    return `${icon} ${summary}${details}`;
  }

  async function replyWithResult(interaction, result) {
    await interaction.editReply(resultMessage(result));
  }

  return handleInteraction;
}
