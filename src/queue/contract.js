/**
 * src/queue/contract.js
 * =====================
 * The extension's mirror of bot/src/contract.js — the shared vocabulary both
 * halves must agree on. When a name changes in the bot's contract, change it
 * here too, or the queue silently stops matching.
 */

export const COMMANDS = Object.freeze({
  RESCHEDULE: 'reschedule',
  FIND:       'find',
});

// Sub-modes of /reschedule, carried in task.args.mode.
export const RESCHEDULE_MODE = Object.freeze({
  ALL:      'all',      // scan CAD list, reschedule every future-dated parcel
  PARCEL:   'parcel',   // reschedule one consignment to a given date
  BARCODES: 'barcodes', // scan Drive labels, reschedule the parcels found
});

export const STATUS = Object.freeze({
  PENDING:   'pending',
  CLAIMED:   'claimed',
  DONE:      'done',
  ERROR:     'error',
  CANCELLED: 'cancelled',
});

export const TASK_SCHEMA_VERSION = 1;

// Firestore collection that carries tasks in both directions.
export const TASKS_COLLECTION = 'tasks';
