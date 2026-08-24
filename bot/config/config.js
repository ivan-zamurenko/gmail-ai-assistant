/**
 * bot/config/config.js
 * ====================
 * Facade over the gitignored local.js — one place that reads secrets and fails
 * loudly if something is missing, so no module hunts for its own env values.
 */
import { LOCAL } from './local.js';

const REQUIRED = ['discordToken', 'applicationId', 'guildId'];

export function loadConfig() {
  for (const key of REQUIRED) {
    const value = LOCAL[key];
    if (!value || value.startsWith('YOUR_')) {
      throw new Error(`Config "${key}" not set — fill bot/config/local.js (copy from local.example.js)`);
    }
  }
  if (!LOCAL.firebase?.projectId || LOCAL.firebase.projectId.startsWith('your-')) {
    throw new Error('Config "firebase.projectId" not set — fill bot/config/local.js');
  }
  return LOCAL;
}
