/**
 * bot/src/contract.js
 * ===================
 * The shared vocabulary between the bot and the Chrome extension listener.
 * BOTH sides must agree on these exact strings — when the extension side is
 * built, it mirrors this file. Change a name here → change it there too.
 */

export const COMMANDS = {
  RESCHEDULE:  'reschedule',
};

// Sub-modes of /reschedule, carried in task.args.mode.
export const RESCHEDULE_MODE = {
  ALL:      'all',      // scan CAD list, reschedule every future-dated parcel
  PARCEL:   'parcel',   // reschedule one consignment to a given date
  BARCODES: 'barcodes', // scan Drive labels, reschedule the parcels found
};

export const STATUS = {
  PENDING: 'pending',
  DONE:    'done',
  ERROR:   'error',
};

// Firestore collection that carries tasks in both directions.
export const TASKS_COLLECTION = 'tasks';
