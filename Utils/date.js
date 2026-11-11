/**
 * Date and Timezone normalization utilities
 */

const getLocalDateString = (date = new Date(), timezone = 'Asia/Kolkata') => {
  try {
    const d = new Date(date);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(d); // Returns YYYY-MM-DD
  } catch (err) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }
};

const getDayOfWeek = (dateString) => {
  // dateString is YYYY-MM-DD
  const parts = dateString.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return d.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
};

const getRecentDays = (count = 7, timezone = 'Asia/Kolkata') => {
  const days = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(getLocalDateString(d, timezone));
  }
  return days;
};

const isToday = (dateString, timezone = 'Asia/Kolkata') => {
  return dateString === getLocalDateString(new Date(), timezone);
};

const getDaysDiff = (dateStr1, dateStr2) => {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getISOWeekDetails = (dateString) => {
  // Returns weekStart (Monday YYYY-MM-DD) and weekEnd (Sunday YYYY-MM-DD)
  const parts = dateString.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const day = d.getUTCDay() || 7; // ISO week: 1=Mon, ..., 7=Sun
  
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - day + 1);
  
  const sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() - day + 7);
  
  const toStr = (dateObj) => dateObj.toISOString().split('T')[0];
  return {
    weekStart: toStr(monday),
    weekEnd: toStr(sunday),
  };
};

const getCalendarMonth = (dateString) => {
  // Returns YYYY-MM
  return dateString.slice(0, 7);
};

const isValidDateString = (str) => {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
};

const addDaysToDateString = (dateString, deltaDays = 0) => {
  const [y, m, d] = dateString.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().split('T')[0];
};

const getSignedDaysDiff = (fromDateStr, toDateStr) => {
  const [y1, m1, d1] = fromDateStr.split('-').map(Number);
  const [y2, m2, d2] = toDateStr.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
};

const getWeekDates = (weekStartStr) => {
  const days = [];
  for (let i = 0; i < 7; i++) {
    days.push(addDaysToDateString(weekStartStr, i));
  }
  return days;
};

const getPreviousWeekStart = (weekStartStr, weeksBack = 1) => {
  return addDaysToDateString(weekStartStr, -7 * weeksBack);
};

/**
 * Returns local calendar date, HH:MM clock (24h, h23 so midnight is 00:xx), and weekday (0=Sun..6=Sat)
 */
const getLocalClockDetails = (date = new Date(), timezone = 'Asia/Kolkata') => {
  const tz = timezone || 'Asia/Kolkata';
  const d = new Date(date);
  try {
    const dateString = getLocalDateString(d, tz);
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = timeFormatter.formatToParts(d);
    let hours = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minutes = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    if (hours === 24) hours = 0;
    const hhmm = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const weekday = getDayOfWeek(dateString);
    return { dateString, hhmm, hours, minutes, weekday };
  } catch (err) {
    const dateString = getLocalDateString(d, 'Asia/Kolkata');
    const weekday = getDayOfWeek(dateString);
    return { dateString, hhmm: '00:00', hours: 0, minutes: 0, weekday };
  }
};

const hhmmToMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm)) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Checks whether local HH:MM falls within quietHours { enabled, from, to }.
 * Supports both overnight spans (e.g. 22:00 -> 06:00) and same-day spans (e.g. 13:00 -> 15:00).
 */
const isTimeInQuietHours = (hhmm, quietHours) => {
  if (!quietHours || !quietHours.enabled) return false;
  const nowMin = hhmmToMinutes(hhmm);
  const fromMin = hhmmToMinutes(quietHours.from || '22:00');
  const toMin = hhmmToMinutes(quietHours.to || '06:00');
  if (fromMin === toMin) return false;
  if (fromMin < toMin) {
    return nowMin >= fromMin && nowMin < toMin;
  }
  // Overnight wrap (e.g. 22:00 to 06:00)
  return nowMin >= fromMin || nowMin < toMin;
};

/**
 * Bi-weekly (14-day) progress photo cycle calculation from an anchorDate (YYYY-MM-DD).
 * Cycle 1 due on anchorDate (n=0), Cycle 2 on anchorDate + 14d (n=1), etc.
 * Allows a 3-day grace window after due date before marking overdue.
 */
const getPhotoCycleDetails = (anchorDateStr, targetDateStr, completedCount = 0, cycleDays = 14) => {
  const anchor = isValidDateString(anchorDateStr) ? anchorDateStr : targetDateStr;
  const diff = getSignedDaysDiff(anchor, targetDateStr);
  const isComplete = completedCount >= 3;

  if (diff < 0) {
    return {
      cycleNumber: 1,
      dueDate: anchor,
      nextDueDate: addDaysToDateString(anchor, cycleDays),
      daysSinceDue: diff,
      status: isComplete ? 'completed' : 'upcoming',
    };
  }

  const n = Math.floor(diff / cycleDays);
  const cycleNumber = n + 1;
  const dueDate = addDaysToDateString(anchor, n * cycleDays);
  const nextDueDate = addDaysToDateString(anchor, (n + 1) * cycleDays);
  const daysSinceDue = getSignedDaysDiff(dueDate, targetDateStr);

  let status = 'due';
  if (isComplete) {
    status = 'completed';
  } else if (daysSinceDue > 3) {
    status = 'overdue';
  } else {
    status = 'due';
  }

    return {
    cycleNumber,
    dueDate,
    nextDueDate,
    daysSinceDue,
    status,
  };
};

/**
 * Converts a local YYYY-MM-DD calendar date into a safe Date timestamp whose calendar day
 * in the supplied IANA timezone stays anchored to the exact requested YYYY-MM-DD date.
 */
const anchorDateFromLocalString = (dateStr, timezone = 'Asia/Kolkata') => {
  if (!isValidDateString(dateStr)) return new Date();
  const baseNoonUtc = new Date(`${dateStr}T12:00:00.000Z`);
  if (getLocalDateString(baseNoonUtc, timezone) === dateStr) {
    return baseNoonUtc;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  for (let offsetHours = -14; offsetHours <= 14; offsetHours += 1) {
    const candidate = new Date(Date.UTC(y, m - 1, d, 12 - offsetHours, 0, 0));
    if (getLocalDateString(candidate, timezone) === dateStr) {
      return candidate;
    }
  }
  return baseNoonUtc;
};

module.exports = {
  getLocalDateString,
  getDayOfWeek,
  getRecentDays,
  isToday,
  getDaysDiff,
  getISOWeekDetails,
  getCalendarMonth,
  isValidDateString,
  addDaysToDateString,
  getSignedDaysDiff,
  getWeekDates,
  getPreviousWeekStart,
  getLocalClockDetails,
  hhmmToMinutes,
  isTimeInQuietHours,
  getPhotoCycleDetails,
  anchorDateFromLocalString,
};
