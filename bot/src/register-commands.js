/**
 * bot/src/register-commands.js
 * ============================
 * One-off: pushes the slash-command definitions to your Discord server.
 * Guild-scoped registration appears instantly (global takes ~1h), which is
 * what we want during development.
 *
 *   npm run register
 */
import { REST, Routes } from 'discord.js';

import { loadConfig } from '../config/config.js';
import { commands }   from './commands.js';

async function main() {
  const cfg  = loadConfig();
  const rest = new REST().setToken(cfg.discordToken);
  const body = commands.map(c => c.toJSON());

  console.log(`Registering ${body.length} guild command(s)…`);
  await rest.put(
    Routes.applicationGuildCommands(cfg.applicationId, cfg.guildId),
    { body },
  );
  console.log('✅ Commands registered — they appear immediately in your server.');
}

main().catch((err) => {
  console.error('❌ Registration failed:', err.message);
  process.exit(1);
});
