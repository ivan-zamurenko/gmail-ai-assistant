/**
 * background.js — Service Worker
 * ================================
 * Entry point for the background context.
 * Responsibility: wire up Chrome events only.
 * No business logic lives here — everything is delegated to modules.
 */

import { initConfig } from '../config/config.js';
import { logger }     from '../utils/logger.js';

chrome.runtime.onInstalled.addListener(async () => {
  logger.info('background: extension installed / updated');
  await initConfig();
});
