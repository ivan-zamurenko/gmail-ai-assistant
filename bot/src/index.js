import { createResponseLifecycle } from './responseLifecycle.js';
import { safeErrorMessage } from './errors.js';
/** Running bot: configuration and adapters are wired here, outside the testable handler. */
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig } from '../config/config.js';
import { enqueueAndWait, acknowledgeResult, sweepResults, listResults, getResult } from './queue.js';
import { buildParcelEmbed } from './render.js';
import { addTodo, listTodos, markDone, clearDone, renderList, rememberTodoList } from './todo.js';
import { createInteractionHandler } from './interactions.js';
import { createMailStore } from './mailStore.js';
import { createMailWatch } from './mailWatch.js';

const cfg = loadConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot online as ${c.user.tag}`);
});

// A stray API error must never take the whole bot down.
client.on(Events.Error, (err) => console.error('Client error:', safeErrorMessage(err, 'Discord client failed')));
// Optional mail channel: only when local config names a private channel.
const mailChannelId = /^\d{17,20}$/.test(cfg.mailChannelId ?? '') ? cfg.mailChannelId : null;
const mailStore = mailChannelId ? createMailStore({ path: new globalThis.URL('../data/mail.json', import.meta.url).pathname }) : null;
const mailWatch = mailChannelId ? createMailWatch({
  enqueueAndWait, acknowledgeResult, store: mailStore, guildId: cfg.guildId,
  getChannel: () => client.channels.fetch(mailChannelId),
}) : null;
client.once(Events.ClientReady, () => {
  if (!mailWatch) return;
  console.log('📨 Mail channel watch: every 2 min');
  void mailWatch.poll();
  globalThis.setInterval(() => void mailWatch.poll(), 120_000).unref();
});

const handleInteraction = createInteractionHandler({
  cfg, enqueueAndWait, acknowledgeResult, buildParcelEmbed, listResults, getResult,
  addTodo, listTodos, markDone, clearDone, renderList, rememberTodoList,
  mail: mailWatch ? { store: mailStore, poll: mailWatch.poll, channelId: mailChannelId } : null,
});
const withCleanup = createResponseLifecycle();
client.on(Events.InteractionCreate, interaction => {
  handleInteraction(withCleanup(interaction)).catch(err => console.error('Interaction failed:', safeErrorMessage(err, 'Discord operation failed')));
});

// Best-effort physical cleanup; recovery independently denies expired data.
let sweeping = false;
async function cleanupResults() {
  if (sweeping) return;
  sweeping = true;
  try { await sweepResults(); }
  catch (err) { console.error('Result cleanup failed:', safeErrorMessage(err, 'Queue cleanup failed')); }
  finally { sweeping = false; }
}
void cleanupResults();
globalThis.setInterval(cleanupResults, 60_000).unref();
client.login(cfg.discordToken);
