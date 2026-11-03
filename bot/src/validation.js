import { manualDateMessage } from '../../shared/depotCalendar.js';

/** Returns an operator-facing error for an invalid lookup number, else null. */
export function validateConsignmentNumber(value) {
  return /^\d{9}(?:\d{5})?$/.test(value ?? '')
    ? null
    : 'Номер посилки має містити 9 або 14 цифр.';
}

/** Same Irish calendar policy as the extension, before creating a task. */
export const validateFutureWorkday = manualDateMessage;
