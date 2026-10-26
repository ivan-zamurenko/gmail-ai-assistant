/** Build the queue envelope without loading Firebase or private configuration. */
import { STATUS, TASK_SCHEMA_VERSION } from './contract.js';

export function buildPendingTask(task, { id, executorUid, createdAt, expiresAt }) {
  return {
    id,
    schemaVersion: TASK_SCHEMA_VERSION,
    command: task.command,
    args: task.args ?? {},
    requestedBy: task.requestedBy,
    executorUid,
    status: STATUS.PENDING,
    createdAt,
    expiresAt,
  };
}
