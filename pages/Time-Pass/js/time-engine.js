/**
 * Time zone + calendar-aware duration decomposition.
 */

import { ALL_UNITS, effectiveTimeZone } from './constants.js';

const DTF_CACHE = new Map();

function getDtf(timeZone) {
  let dtf = DTF_CACHE.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    DTF_CACHE.set(timeZone, dtf);
  }
  return dtf;
}

export function getZonedParts(ms, timeZone) {
  const parts = getDtf(timeZone).formatToParts(new Date(ms));
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

export function zonedCivilToUtcMs(year, month, day, hour, minute, second, timeZone) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const p = getZonedParts(utc, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = targetAsUtc - asUtc;
    if (diff === 0) break;
    utc += diff;
  }
  return utc;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function clampDay(year, month, day) {
  return Math.min(day, daysInMonth(year, month));
}

export function resolveEventInstant(event) {
  const tz = effectiveTimeZone(event.timeZone);
  const [y, m, d] = String(event.date).split('-').map(Number);
  let hour = 0;
  let minute = 0;
  let second = 0;
  if (event.time) {
    const bits = String(event.time).split(':').map(Number);
    hour = bits[0] || 0;
    minute = bits[1] || 0;
    second = bits[2] || 0;
  }
  return zonedCivilToUtcMs(y, m, d, hour, minute, second, tz);
}

function borrowCalendar(a, b) {
  let year = b.year - a.year;
  let month = b.month - a.month;
  let day = b.day - a.day;
  let hour = b.hour - a.hour;
  let minute = b.minute - a.minute;
  let second = b.second - a.second;

  if (second < 0) {
    second += 60;
    minute -= 1;
  }
  if (minute < 0) {
    minute += 60;
    hour -= 1;
  }
  if (hour < 0) {
    hour += 24;
    day -= 1;
  }
  if (day < 0) {
    let pm = b.month - 1;
    let py = b.year;
    if (pm < 1) {
      pm = 12;
      py -= 1;
    }
    day += daysInMonth(py, pm);
    month -= 1;
  }
  if (month < 0) {
    month += 12;
    year -= 1;
  }
  return { year, month, day, hour, minute, second };
}

/**
 * Full civil diff, then pack into enabled units (largest → smallest).
 * Decades from years; weeks from days when enabled.
 */
export function decomposeDuration(fromMs, toMs, timeZone, enabledUnits) {
  const tz = timeZone || 'UTC';
  const earlier = Math.min(fromMs, toMs);
  const later = Math.max(fromMs, toMs);
  const diff = borrowCalendar(getZonedParts(earlier, tz), getZonedParts(later, tz));

  let years = Math.max(0, diff.year);
  let months = Math.max(0, diff.month);
  let days = Math.max(0, diff.day);
  let hours = Math.max(0, diff.hour);
  let minutes = Math.max(0, diff.minute);
  let seconds = Math.max(0, diff.second);

  const enabled = enabledUnits?.length ? enabledUnits : ALL_UNITS;
  const en = new Set(enabled);

  // Fold disabled units into the next-smaller channel
  if (!en.has('years') && !en.has('decades')) {
    months += years * 12;
    years = 0;
  }
  if (!en.has('months')) {
    for (let i = 0; i < months; i++) days += 30; // coarse fold when months hidden
    months = 0;
  }
  if (!en.has('days') && !en.has('weeks')) {
    hours += days * 24;
    days = 0;
  }
  if (!en.has('hours')) {
    minutes += hours * 60;
    hours = 0;
  }
  if (!en.has('minutes')) {
    seconds += minutes * 60;
    minutes = 0;
  }
  if (!en.has('seconds')) {
    seconds = 0;
  }

  let decades = 0;
  if (en.has('decades')) {
    decades = Math.floor(years / 10);
    years %= 10;
    if (!en.has('years')) years = 0;
  }

  let weeks = 0;
  if (en.has('weeks')) {
    weeks = Math.floor(days / 7);
    days %= 7;
    if (!en.has('days')) days = 0;
  }

  const parts = {};
  for (const u of enabled) {
    switch (u) {
      case 'decades':
        parts.decades = decades;
        break;
      case 'years':
        parts.years = years;
        break;
      case 'months':
        parts.months = months;
        break;
      case 'weeks':
        parts.weeks = weeks;
        break;
      case 'days':
        parts.days = days;
        break;
      case 'hours':
        parts.hours = hours;
        break;
      case 'minutes':
        parts.minutes = minutes;
        break;
      case 'seconds':
        parts.seconds = seconds;
        break;
      default:
        break;
    }
  }
  return parts;
}

export function getVisibleUnits(parts, enabledUnits) {
  const order = ALL_UNITS.filter((u) => enabledUnits.includes(u));
  if (!order.length) return [];
  let firstNonZero = -1;
  for (let i = 0; i < order.length; i++) {
    if ((parts[order[i]] || 0) > 0) {
      firstNonZero = i;
      break;
    }
  }
  if (firstNonZero === -1) return [order[order.length - 1]];
  return order.slice(firstNonZero);
}

export function buildPrimaryView(event, targetMs, nowMs) {
  const tz = effectiveTimeZone(event.timeZone);
  const units = event.units?.length ? event.units : ALL_UNITS;
  const direction = targetMs >= nowMs ? 'until' : 'since';
  const parts = decomposeDuration(Math.min(nowMs, targetMs), Math.max(nowMs, targetMs), tz, units);
  return {
    direction,
    targetMs,
    parts,
    visibleUnits: getVisibleUnits(parts, units),
  };
}
