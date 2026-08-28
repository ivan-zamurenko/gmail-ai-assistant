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
  if (!LOCAL.firebase?.serviceAccountPath) {
    throw new Error('Config "firebase.serviceAccountPath" not set — fill bot/config/local.js');
  }
  if (!LOCAL.firebase?.executorUid || LOCAL.firebase.executorUid.startsWith('YOUR_')) {
    throw new Error('Config "firebase.executorUid" not set — copy the UID printed by the extension');
  }
  return LOCAL;
}
