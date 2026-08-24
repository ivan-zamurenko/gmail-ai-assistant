/**
 * bot/src/contract.js
 * ===================
 * The shared vocabulary between the bot and the Chrome extension listener.
 * BOTH sides must agree on these exact strings — when the extension side is
 * built, it mirrors this file. Change a name here → change it there too.
 */

export const COMMANDS = {
  FIND:           'find',
  RESCHEDULE:     'reschedule',
  CHECK_BARCODES: 'check_barcodes',
};

export const STATUS = {
  PENDING: 'pending',
  DONE:    'done',
  ERROR:   'error',
};

// Firestore collection that carries tasks in both directions.
export const TASKS_COLLECTION = 'tasks';
