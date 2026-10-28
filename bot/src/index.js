import { safeErrorMessage } from './errors.js';
/** Running bot: configuration and adapters are wired here, outside the testable handler. */
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig } from '../config/config.js';
import { enqueueAndWait } from './queue.js';
import { buildParcelEmbed } from './render.js';
import { addTodo, listTodos, markDone, clearDone, renderList } from './todo.js';
import { createInteractionHandler } from './interactions.js';

const cfg = loadConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot online as ${c.user.tag}`);
});

// A stray API error must never take the whole bot down.
client.on(Events.Error, (err) => console.error('Client error:', safeErrorMessage(err, 'Discord client failed')));
client.on(Events.InteractionCreate, createInteractionHandler({
  cfg, enqueueAndWait, buildParcelEmbed,
  addTodo, listTodos, markDone, clearDone, renderList,
}));

client.login(cfg.discordToken);
