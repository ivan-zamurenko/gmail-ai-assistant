/** Returns an operator-facing error for an invalid lookup number, else null. */
export function validateConsignmentNumber(value) {
  return /^\d{9}(?:\d{5})?$/.test(value ?? '')
    ? null
    : 'Номер посилки має містити 9 або 14 цифр.';
}

/** Returns an error message if the date is not a valid future weekday, else null. */
export function validateFutureWorkday(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return 'Дата має бути у форматі YYYY-MM-DD (напр. 2026-09-03)';
  }

  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Некоректна дата';
  const [year, month, dayOfMonth] = dateStr.split('-').map(Number);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== dayOfMonth) {
    return 'Некоректна календарна дата';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date <= today) return 'Дата має бути пізніше за сьогодні';

  const day = date.getDay();
  if (day === 0 || day === 6) return 'Дата не може бути суботою чи неділею';

  return null;
}
