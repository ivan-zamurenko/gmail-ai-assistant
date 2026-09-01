/**
 * bot/src/contract.js
 * ===================
 * The shared vocabulary between the bot and the Chrome extension listener.
 * BOTH sides must agree on these exact strings — when the extension side is
 * built, it mirrors this file. Change a name here → change it there too.
 */

export const COMMANDS = {
  RESCHEDULE:  'reschedule',
  FIND:        'find',
};

// Sub-modes of /reschedule, carried in task.args.mode.
export const RESCHEDULE_MODE = {
  ALL:      'all',      // scan CAD list, reschedule every future-dated parcel
  PARCEL:   'parcel',   // reschedule one consignment to a given date
  BARCODES: 'barcodes', // scan Drive labels, reschedule the parcels found
  RETRY:    'retry',    // retry today's saved Drive-label server errors
};

export const STATUS = {
  PENDING:   'pending',
  CLAIMED:   'claimed',
  DONE:      'done',
  ERROR:     'error',
  CANCELLED: 'cancelled',
};

export const TASK_SCHEMA_VERSION = 2;

// Firestore collection that carries tasks in both directions.
export const TASKS_COLLECTION = 'tasks';
