// Owner policy CALENDAR-2026-11-03. Republic of Ireland public + bank closures.
// Source checked 2026-11-03: https://bpfi.ie/wp-content/uploads/2025/10/Bank-Holidays-2025-2027-1.pdf
// A bounded snapshot is deliberate: do not extrapolate unverified future years.
export const DEPOT_CALENDAR = Object.freeze({
  version: 'IE-BPFI-2026-2027-v1',
  timeZone: 'Europe/Dublin',
  years: Object.freeze([2026, 2027]),
  holidays: Object.freeze([
    '2026-01-01', '2026-02-02', '2026-03-17', '2026-04-03', '2026-04-06',
    '2026-05-04', '2026-06-01', '2026-08-03', '2026-10-26',
    '2026-12-25', '2026-12-26', '2026-12-28', '2026-12-29',
    '2027-01-01', '2027-02-01', '2027-03-17', '2027-03-26', '2027-03-29',
    '2027-05-03', '2027-06-07', '2027-08-02', '2027-10-25',
    '2027-12-25', '2027-12-26', '2027-12-27', '2027-12-28', '2027-12-29',
  ]),
});

export function irishDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dateError(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Manual date must use YYYY-MM-DD';
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return 'Manual date is not a valid calendar date';
  return null;
}

function assertCoverage(day, calendar) {
  if (!calendar.years.includes(Number(day.slice(0, 4)))) throw new Error('Calendar coverage unavailable; update the Irish calendar');
}

function isWorkingDay(day, calendar) {
  assertCoverage(day, calendar);
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !calendar.holidays.includes(day);
}

export function validateManualDate(value, now = new Date(), calendar = DEPOT_CALENDAR) {
  const invalid = dateError(value);
  if (invalid) return invalid;
  const today = irishDay(now);
  if (value <= today) return 'Manual date must be in the future';
  try {
    assertCoverage(today, calendar);
    return isWorkingDay(value, calendar) ? null : 'Manual date must be a working day (no weekends or holidays)';
  } catch (error) {
    return error.message;
  }
}

export function calendarPlan({ date, now = new Date(), calendar = DEPOT_CALENDAR } = {}) {
  const today = irishDay(now);
  assertCoverage(today, calendar);
  let targetDate = date;
  if (date !== undefined) {
    const error = validateManualDate(date, now, calendar);
    if (error) throw new Error(error);
  } else {
    const next = new Date(`${today}T00:00:00Z`);
    do {
      next.setUTCDate(next.getUTCDate() + 1);
      targetDate = next.toISOString().slice(0, 10);
    } while (!isWorkingDay(targetDate, calendar));
  }
  return Object.freeze({ today, targetDate, version: calendar.version, timeZone: calendar.timeZone });
}

/** Only this trusted extension boundary prepares plans passed to MAIN world. */
export function prepareDepotArgs(args, now = new Date()) {
  const { expectedDay, ...options } = args;
  if (expectedDay !== undefined && expectedDay !== irishDay(now)) {
    throw new Error('Calendar plan expired at Irish midnight; refresh the operation');
  }
  return { ...options, calendar: calendarPlan({ now, ...(args.mode === 'manual' && { date: args.date ?? '' }) }) };
}

export function manualDateMessage(value, now = new Date()) {
  const reason = validateManualDate(value, now);
  if (!reason) return null;
  return {
    'Manual date must use YYYY-MM-DD': 'Дата має бути у форматі YYYY-MM-DD',
    'Manual date is not a valid calendar date': 'Некоректна календарна дата',
    'Manual date must be in the future': 'Дата має бути пізніше за сьогодні (час Ірландії)',
    'Manual date must be a working day (no weekends or holidays)': 'Дата не може бути суботою, неділею або святковим/банківським вихідним',
    'Calendar coverage unavailable; update the Irish calendar': 'Для цієї дати немає перевіреного календаря Ірландії; потрібне оновлення',
  }[reason] ?? 'Некоректна дата';
}
