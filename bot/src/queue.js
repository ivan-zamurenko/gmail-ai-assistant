/** Production wiring for the queue; tests import queueService without credentials. */
import { randomUUID } from 'node:crypto';
import { db, admin } from './firebase.js';
import { loadConfig } from '../config/config.js';
import { createQueueService } from './queueService.js';

const cfg = loadConfig();
export const { enqueueAndWait, getResult, listResults, acknowledgeResult, sweepResults } = createQueueService({
  db,
  executorUid: cfg.firebase.executorUid,
  guildId: cfg.guildId,
  randomId: randomUUID,
  serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
  timestampFromMillis: value => admin.firestore.Timestamp.fromMillis(value),
});
