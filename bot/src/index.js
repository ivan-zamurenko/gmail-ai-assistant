/**
 * bot/src/index.js
 * ================
 * The running bot. Turns a Discord slash command into a queue task, waits for
 * the extension's result, and edits the reply with a one-line summary.
 *
 *   npm start
 */
import { Client, Events, GatewayIntentBits } from 'discord.js';

import { loadConfig }     from '../config/config.js';
import { enqueueAndWait } from './queue.js';
import { STATUS }         from './contract.js';

const cfg = loadConfig();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot online as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

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
});

client.login(cfg.discordToken);
