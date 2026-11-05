import { createRescheduleViews, rescheduleLines } from './rescheduleViews.js';
import { createFindViews } from './findViews.js';
import { todoDisplayText, todoErrorMessage } from './todoService.js';
import { normEircode } from './geo.js';
import { renderDriverReport } from './driverReport.js';
/** Discord interaction boundary; importing this module never starts a client or Firebase. */
import { createResultRecovery } from './resultRecovery.js';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { COMMANDS, RESCHEDULE_MODE, STATUS } from './contract.js';
import { safeErrorMessage } from './errors.js';
import { formatReport, formatRows, formatSummary, splitMessage } from './messageFormat.js';
import { validateConsignmentNumber, validateFutureWorkday } from './validation.js';
import { renderBarcodeProgress, shouldPublishBarcodeProgress } from './barcodeProgress.js';
import { proposeReply } from './aiReply.js';
import { createMailViews } from './mailViews.js';

export function createInteractionHandler({
  cfg, enqueueAndWait, buildParcelEmbed, acknowledgeResult = async () => {},
  addTodo, listTodos, markDone, clearDone, renderList, rememberTodoList = () => {}, listResults, getResult,
  propose = proposeReply, mail = null,
}) {
  const actor = interaction => ({ requestedBy: interaction.user.id, guildId: interaction.guildId });
  async function acknowledge(interaction, result) {
    if (!result.id) return;
    try { await acknowledgeResult(result.id, actor(interaction)); }
    catch (err) { console.error('Result acknowledgement failed:', safeErrorMessage(err, 'Queue acknowledgement failed')); }
  }
  async function deliveryError(interaction, err, retained = false) {
    try { await interaction.editReply(`⚠️ ${safeErrorMessage(err, 'Discord operation failed')}${retained ? '\nЗбережений результат можна знайти через /result; не повторюй depot-команду.' : ''}`); }
    catch (failure) { console.error('Result delivery failed:', safeErrorMessage(failure, 'Discord operation failed')); }
  }

  const mailViews = mail ? createMailViews({ ...mail, enqueueAndWait, acknowledge, propose, renderReply, guildId: cfg.guildId }) : null;
  const rescheduleViews = createRescheduleViews();
  const findViews = createFindViews({ buildParcelEmbed, apiKey: cfg.googleMapsApiKey });
  const recoverResult = createResultRecovery({ listResults, getResult, acknowledgeResult, buildParcelEmbed, renderFind: (parcel, interaction) => findViews.open(parcel, interaction), resultMessage, renderReschedule: (result, interaction) => rescheduleViews.open(result, interaction), cfg });

  async function handleInteraction(interaction) {
    const rescheduleButton = interaction.isButton?.() && interaction.customId?.startsWith('reschedule:');
    const findButton = interaction.isButton?.() && interaction.customId?.startsWith('find:');
    const reportButton = interaction.isButton?.() && interaction.customId?.startsWith('report:');
    const recoveryButton = interaction.isButton?.() && interaction.customId?.startsWith('result:');
    const mailButton = interaction.isButton?.() && interaction.customId?.startsWith('mail:');
    if (!interaction.isChatInputCommand() && !recoveryButton && !reportButton && !findButton && !rescheduleButton && !mailButton) return;

    // Commands are guild-scoped at registration, but keep a runtime gate too: it
    // protects us if registration changes or an interaction is ever misrouted.
    if (interaction.guildId !== cfg.guildId) {
      await interaction.reply({ content: '⛔ This bot is not enabled here.', flags: MessageFlags.Ephemeral });
      return;
    }

    const touchesDepot = recoveryButton || interaction.commandName !== 'todo';
    if (touchesDepot && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: '⛔ Depot commands require Administrator permission.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (mailButton || interaction.commandName === 'mail') {
      if (!mailViews) {
        await interaction.reply({ content: '⚠️ Канал пошти не налаштовано (mailChannelId).', flags: MessageFlags.Ephemeral });
        return;
      }
      await (mailButton ? mailViews.handle(interaction) : mailViews.command(interaction));
      return;
    }
    if (rescheduleButton) {
      await rescheduleViews.handle(interaction);
      return;
    }
    if (findButton) {
      await findViews.handle(interaction);
      return;
    }
    if (reportButton) {
      await handleReportButton(interaction);
      return;
    }
    if (recoveryButton || interaction.commandName === 'result') {
      if (typeof interaction.user?.id !== 'string' || !interaction.user.id) return;
      await recoverResult(interaction);
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
    } else if (interaction.commandName === COMMANDS.REPORT) {
      await handleReport(interaction, { conId: request.conId, ...(request.eircode && { eircode: request.eircode }) });
    } else if (interaction.commandName === COMMANDS.FIND) {
      await handleFind(interaction, request.conId);
    } else if (interaction.commandName === 'reply') {
      await handleReply(interaction, request);
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
        return typeof text === 'string' && text.trim() && text.length <= 500 ? { sub, text } : invalid;
      }
      if (sub === 'done') {
        const number = interaction.options.getInteger('number');
        return Number.isSafeInteger(number) && number > 0 ? { sub, number } : invalid;
      }
      return { sub };
    }
    if (command === 'reply') {
      const conId = interaction.options.getString('con_id');
      const text = interaction.options.getString('text');
      if (typeof conId !== 'string' || typeof text !== 'string' || !text.trim() || text.length > 4000) return invalid;
      const error = validateConsignmentNumber(conId);
      return error ? { error } : { conId, text };
    }
    if (command === COMMANDS.FIND || command === COMMANDS.REPORT) {
      const conId = interaction.options.getString('con_id');
      if (typeof conId !== 'string') return invalid;
      const error = validateConsignmentNumber(conId);
      if (error) return { error };
      if (command === COMMANDS.REPORT) {
        const manual = interaction.options.getString('eircode');
        if (manual !== null && manual !== undefined) {
          const eircode = normEircode(manual);
          if (!eircode) return { error: 'Enter a valid destination Eircode.' };
          return { conId, eircode };
        }
      }
      return { conId };
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

    const send = content => interaction.editReply({ content, allowedMentions: { parse: [] } });
    try {
      if (sub === 'add') {
        await addTodo(userId, text);
        await send(`✅ Додано: ${todoDisplayText(text.trim())}`);
      } else if (sub === 'list') {
        const todos = await listTodos(userId);
        await send(renderList(todos));
        rememberTodoList(userId, todos);
      } else if (sub === 'done') {
        const todo = await markDone(userId, number);
        await send(todo ? `✅ Виконано: ${todoDisplayText(todo.text)}` : `⚠️ Немає задачі №${number}`);
      } else if (sub === 'clear') {
        const { removed, failed, hasMore } = await clearDone(userId);
        await send(`🧹 Підтверджено видалення: ${removed}`
          + (failed ? `\n⚠️ Не підтверджено: ${failed}. Онови список через /todo list.` : '')
          + (hasMore ? '\n⚠️ Перевірено лише перші 100 записів; очищення часткове.' : ''));
      }
    } catch (err) {
      await send(`⚠️ ${todoErrorMessage(err) ?? safeErrorMessage(err, 'Discord operation failed')}`);
    }
  }

  /** Depot commands (/reschedule) — routed through the queue to the extension. */
  async function handleDepotCommand(interaction, args) {
    const command = interaction.commandName;
    const { mode, dryRun } = args;

    // The depot round-trip is slower than Discord's 3-second reply window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let retained = false;
    try {
      if (mode === RESCHEDULE_MODE.BARCODES) {
        await interaction.editReply(
          `⏳ Scan Drive Labels запускається (${dryRun ? 'DRY RUN' : 'LIVE'})…`,
        );

        let published = null;
        let edits = Promise.resolve();
        const onProgress = (progress) => {
          if (interaction.autoCleanupExpired) return;
          const now = Date.now();
          if (!shouldPublishBarcodeProgress(published, progress, now)) return;
          published = { ...progress, publishedAt: now };
          edits = edits
            .then(() => interaction.autoCleanupExpired ? undefined : interaction.editReply(renderBarcodeProgress(progress, dryRun)))
            .catch((err) => console.error('Barcode progress update failed:', safeErrorMessage(err, 'Discord operation failed')));
        };

        const queued = enqueueAndWait({
          command,
          args,
          requestedBy: interaction.user.id,
        }, { timeoutMs: 2 * 60 * 60_000, onProgress });

        let delivered = false;
        let terminalReceived = false;
        queued.then(
          async (result) => {
            terminalReceived = true;
            await edits;
            const lines = rescheduleLines(result);
            // Owner: the final report goes to the group channel, never to DMs.
            // The channel outlives the 15-minute interaction token of long scans.
            // A long report becomes several consecutive messages; never a file.
            const summary = String(result.summary ?? 'Reschedule').slice(0, 500);
            const report = lines ? formatReport(summary, lines) : resultMessage(result);
            for (const content of splitMessage(report)) {
              await interaction.channel.send({ content, allowedMentions: { parse: [] } });
            }
            delivered = true;
            await acknowledge(interaction, result);
            if (!interaction.autoCleanupExpired) await interaction.editReply('✅ Scan Drive Labels завершено — звіт у каналі.');
          },
          async (err) => {
            await edits;
            const message = `⚠️ Scan Drive Labels: ${safeErrorMessage(err, 'Discord operation failed')}`;
            await interaction.channel.send({ content: message, allowedMentions: { parse: [] } });
            if (!interaction.autoCleanupExpired) await interaction.editReply(message);
          },
        ).catch(async err => {
          console.error('Barcode result delivery failed:', safeErrorMessage(err, 'Discord operation failed'));
          if (!delivered) await deliveryError(interaction, err, terminalReceived);
        });
        return;
      }

      const queued = enqueueAndWait({
        command,
        args,
        requestedBy: interaction.user.id,
      });

      const result = await queued;
      retained = true;
      await replyWithResult(interaction, result);
      await acknowledge(interaction, result);
    } catch (err) {
      await deliveryError(interaction, err, retained);
    }
  }

  async function showReport(interaction, result) {
    const report = result.parcel?.report;
    await interaction.editReply(report
      ? await renderDriverReport(result.parcel, { resultId: result.id, eircode: result.args?.eircode, apiKey: cfg.googleMapsApiKey }) : resultMessage(result));
    if (report?.state !== 'choose') await acknowledge(interaction, result);
    return report?.state === 'ready';
  }

  async function handleReport(interaction, args, sourceId, deferred = false) {
    if (!deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let retained = false;
    try {
      const result = await enqueueAndWait({ command: COMMANDS.REPORT, args: { ...args, ...(sourceId && { choiceTaskId: sourceId }) }, requestedBy: interaction.user.id });
      retained = true;
      const delivered = await showReport(interaction, result);
      if (delivered && sourceId) await acknowledge(interaction, { id: sourceId });
    } catch (err) { await deliveryError(interaction, err, retained); }
  }

  async function handleReportButton(interaction) {
    const match = /^report:(select|page):([A-Za-z0-9-]{1,80}):(\d{1,2})$/.exec(interaction.customId);
    if (!match || typeof interaction.user?.id !== 'string' || !interaction.user.id) {
      await interaction.reply({ content: 'Report selection unavailable.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // getResult rechecks original requester, guild, executor and 24-hour expiry.
    let source;
    try { source = await getResult(match[2], actor(interaction)); }
    catch { /* No record or failed authorization never triggers a lookup. */ }
    const report = source?.parcel?.report;
    const index = Number(match[3]);
    if (report?.state !== 'choose' || !report.candidates?.[index]) {
      await interaction.editReply('Report selection expired or unavailable. Use /report again.');
      return;
    }
    if (match[1] === 'page') {
      try { await interaction.editReply(await renderDriverReport(source.parcel, { resultId: source.id, offset: index, eircode: source.args?.eircode })); }
      catch (err) { await deliveryError(interaction, err, true); }
      return;
    }
    await handleReport(interaction, { conId: report.consNumber, selection: report.candidates[index], ...(source.args?.eircode !== undefined && { eircode: source.args.eircode }) }, source.id, true);
  }

  /** Looks up one consignment and shows its latest status — read-only, no date. */
  async function handleReply(interaction, { conId, text }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let retained = false;
    try {
      const result = await enqueueAndWait({ command: COMMANDS.FIND, args: { conId }, requestedBy: interaction.user.id });
      retained = true;
      if (!result.parcel) {
        await replyWithResult(interaction, result);
        await acknowledge(interaction, result);
        return;
      }
      await interaction.editReply({ content: renderReply(await propose({ parcel: result.parcel, query: conId, text }), result.parcel) });
      await acknowledge(interaction, result);
    } catch (err) {
      await deliveryError(interaction, err, retained);
    }
  }

  async function handleFind(interaction, conId) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const t0 = Date.now();
    let retained = false;
    try {
      const result = await enqueueAndWait({
        command:     COMMANDS.FIND,
        args:        { conId },
        requestedBy: interaction.user.id,
      });
      retained = true;
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
        const payload = await findViews.open(result.parcel, interaction);
        console.log(`[find] geo+map+render: ${((Date.now() - t1) / 1000).toFixed(1)}s`);
        await interaction.editReply(payload);
      } else {
        await replyWithResult(interaction, result);
      }
      await acknowledge(interaction, result);
    } catch (err) {
      await deliveryError(interaction, err, retained);
    }
  }

  /** One place that turns an extension result into the Discord reply. */
  function resultMessage(result) {
    const icon    = result.status === STATUS.CANCELLED ? '⚠️' : result.status === STATUS.ERROR ? '❌' : '✅';
    const summary = result.summary ?? (result.status === STATUS.ERROR ? 'Помилка виконання' : 'Готово');
    const body = formatSummary(summary);
    const lead = result.status === STATUS.DONE && !body.startsWith('**') ? '' : `${icon} `;
    const spaced = `${lead}${body}${result.details ? `\n\u200b\n${formatRows(result.details)}` : ''}`;
    if (spaced.length <= 2000) return spaced;
    // Too long once spaced out: fall back to the compact block that always fits.
    const details = result.details ? `\n\`\`\`\n${result.details}\n\`\`\`` : '';
    return `${icon} ${summary}${details}`;
  }

  async function replyWithResult(interaction, result) {
    await interaction.editReply(rescheduleViews.open(result, interaction) ?? resultMessage(result));
  }

  return handleInteraction;
}

const REPLY_REASONS = {
  model_unavailable: 'локальна модель недоступна (Ollama не запущений?)',
  invalid_output: 'модель повернула некоректну відповідь',
  unsupported_date: 'у відповіді дата, якої немає у сканах',
  unsupported_number: 'у відповіді номер, якого немає в запиті',
  unsupported_commitment: 'відповідь обіцяє доставку/гарантію',
  action_claim: 'відповідь стверджує, що дію вже виконано',
  auto_send: 'відповідь згадує автоматичну відправку',
};

/** Ephemeral owner view of a reply proposal; never a send. */
export function renderReply(result, parcel) {
  const head = `✉️ **AI-чернетка відповіді** · 📦 ${parcel?.consNumber ?? '—'}`;
  if (result.status === 'error') return `${head}\n⛔ ${REPLY_REASONS[result.reason] ?? result.reason}`;
  const meta = `🧠 ${result.model} · 📋 фактів зі сканів: ${result.factCount ?? 0}`;
  const body = `\`\`\`\n${String(result.replyText ?? '').replace(/```/g, "'''").slice(0, 1500)}\n\`\`\``;
  const verdict = result.status === 'rejected'
    ? `🟥 **Відхилено перевіркою:** ${REPLY_REASONS[result.reason] ?? result.reason}. Не використовуй цей текст.`
    : result.needsHuman ? '🟨 **Потрібна ваша перевірка:** фактів недостатньо для повної відповіді.' : '🟩 Перевірку фактів пройдено.';
  return [head, meta, '', body, verdict, '📭 Нічого не надіслано — це лише пропозиція.'].join('\n');
}
