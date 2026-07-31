/**
 * Date calculators: span between dates, and add/subtract duration from a date.
 */

import { ALL_UNITS, getBrowserTimeZone, unitLabel } from './constants.js';
import {
  clampDay,
  daysInMonth,
  decomposeDuration,
  getZonedParts,
  zonedCivilToUtcMs,
} from './time-engine.js';
import { todayIsoDate, offsetIsoDate } from './format.js';

export const OFFSET_UNIT_FIELDS = [
  { key: 'offsetYears', unit: 'years', label: 'Years', row: 'ym' },
  { key: 'offsetMonths', unit: 'months', label: 'Months', row: 'ym' },
  { key: 'offsetWeeks', unit: 'weeks', label: 'Weeks', row: 'wd' },
  { key: 'offsetDays', unit: 'days', label: 'Days', row: 'wd' },
  { key: 'offsetHours', unit: 'hours', label: 'Hours', row: 'hms' },
  { key: 'offsetMinutes', unit: 'minutes', label: 'Minutes', row: 'hms' },
  { key: 'offsetSeconds', unit: 'seconds', label: 'Seconds', row: 'hms' },
];

function parseCivil(dateIso, timeStr, includeTime) {
  const [y, m, d] = String(dateIso).split('-').map(Number);
  let hour = 0;
  let minute = 0;
  let second = 0;
  if (includeTime && timeStr) {
    const bits = String(timeStr).split(':').map(Number);
    hour = bits[0] || 0;
    minute = bits[1] || 0;
    second = bits[2] || 0;
  }
  return { y, m, d, hour, minute, second };
}

export function instantFromDraft(dateIso, timeStr, includeTime, timeZone = getBrowserTimeZone()) {
  const { y, m, d, hour, minute, second } = parseCivil(dateIso, timeStr, includeTime);
  if (!y || !m || !d) return null;
  return zonedCivilToUtcMs(y, m, d, hour, minute, second, timeZone);
}

function nonNegInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function defaultCalculatorDraft() {
  return {
    tool: 'span', // 'span' | 'offset'
    startDate: todayIsoDate(),
    startTime: '00:00',
    includeStartTime: true,
    endDate: offsetIsoDate(385),
    endTime: '00:00',
    includeEndTime: true,
    altsOpen: true,
    offsetOp: 'add', // 'add' | 'subtract'
    offsetYears: 0,
    offsetMonths: 0,
    offsetWeeks: 0,
    offsetDays: 0,
    offsetHours: 0,
    offsetMinutes: 0,
    offsetSeconds: 0,
  };
}

function formatInt(n) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function formatFixed(n, digits = 2) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** Calendar breakdown line: "1 year, 20 days" (weeks shown only in alternatives). */
export function formatCalendarBreakdown(parts) {
  const order = ['decades', 'years', 'months', 'days', 'hours', 'minutes', 'seconds'];
  const bits = [];
  for (const u of order) {
    let v = parts[u] || 0;
    if (u === 'days') v += (parts.weeks || 0) * 7;
    if (v > 0) bits.push(`${formatInt(v)} ${unitLabel(u, v)}`);
  }
  return bits.length ? bits.join(', ') : '0 seconds';
}

/** Headline like the screenshot: prefer whole days when ≥ 1 day. */
export function formatPrimaryResult(absMs) {
  const totalDays = Math.floor(absMs / 86400000);
  if (totalDays >= 1) {
    return { value: formatInt(totalDays), unit: unitLabel('days', totalDays) };
  }
  const totalHours = Math.floor(absMs / 3600000);
  if (totalHours >= 1) {
    return { value: formatInt(totalHours), unit: unitLabel('hours', totalHours) };
  }
  const totalMinutes = Math.floor(absMs / 60000);
  if (totalMinutes >= 1) {
    return { value: formatInt(totalMinutes), unit: unitLabel('minutes', totalMinutes) };
  }
  const totalSeconds = Math.floor(absMs / 1000);
  return { value: formatInt(totalSeconds), unit: unitLabel('seconds', totalSeconds) };
}

export function buildAlternatives(absMs) {
  const seconds = absMs / 1000;
  const minutes = seconds / 60;
  const hours = minutes / 60;
  const days = hours / 24;
  const weeks = days / 7;
  const commonYearPct = (days / 365) * 100;
  const leapYearPct = (days / 366) * 100;

  return [
    { key: 'seconds', text: `${formatInt(Math.floor(seconds))} seconds` },
    { key: 'minutes', text: `${formatInt(Math.floor(minutes))} minutes` },
    { key: 'hours', text: `${formatInt(Math.floor(hours))} hours` },
    { key: 'days', text: `${formatInt(Math.floor(days))} days` },
    { key: 'weeks', text: `${formatInt(Math.floor(weeks))} weeks` },
    {
      key: 'year-pct',
      text: `${formatFixed(commonYearPct, 2)}% of common year (365 days)`,
    },
    {
      key: 'leap-pct',
      text: `${formatFixed(leapYearPct, 2)}% of leap year (366 days)`,
    },
  ];
}

export function computeSpan(draft, timeZone = getBrowserTimeZone()) {
  const startMs = instantFromDraft(
    draft.startDate,
    draft.startTime,
    draft.includeStartTime,
    timeZone
  );
  const endMs = instantFromDraft(draft.endDate, draft.endTime, draft.includeEndTime, timeZone);

  if (startMs == null || endMs == null || Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { ok: false, error: 'Enter valid start and end dates.' };
  }

  const absMs = Math.abs(endMs - startMs);
  const parts = decomposeDuration(startMs, endMs, timeZone, ALL_UNITS);
  const primary = formatPrimaryResult(absMs);
  const breakdown = formatCalendarBreakdown(parts);
  const alternatives = buildAlternatives(absMs);

  return {
    ok: true,
    startMs,
    endMs,
    absMs,
    sameInstant: absMs === 0,
    reversed: endMs < startMs,
    parts,
    primary,
    breakdown,
    alternatives,
    timeZone,
  };
}

export function formatSpanCopy(result, draft) {
  if (!result?.ok) return '';
  const dir = result.reversed ? 'End is before Start' : 'Start → End';
  const lines = [
    `Time Pass — Date to Date`,
    `${dir}`,
    `Start: ${draft.startDate}${draft.includeStartTime ? ` ${draft.startTime}` : ''}`,
    `End: ${draft.endDate}${draft.includeEndTime ? ` ${draft.endTime}` : ''}`,
    `Result: ${result.primary.value} ${result.primary.unit}`,
    result.breakdown,
    '',
    'Alternative units:',
    ...result.alternatives.map((a) => a.text),
  ];
  return lines.join('\n');
}

function normalizeMonthYear(year, month) {
  let y = year;
  let m = month;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return { year: y, month: m };
}

function formatOffsetSummary(draft) {
  const bits = [];
  for (const field of OFFSET_UNIT_FIELDS) {
    const v = nonNegInt(draft[field.key]);
    if (v > 0) bits.push(`${formatInt(v)} ${unitLabel(field.unit, v)}`);
  }
  return bits.length ? bits.join(', ') : '0 seconds';
}

export function formatResultDate(parts) {
  try {
    const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }
}

export function formatResultTime(parts, includeTime) {
  if (!includeTime) return 'Start of day';
  try {
    const d = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    );
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: parts.second ? '2-digit' : undefined,
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  }
}

/** Add/subtract calendar + clock units from a start instant. */
export function applyOffset(draft, timeZone = getBrowserTimeZone()) {
  const startMs = instantFromDraft(
    draft.startDate,
    draft.startTime,
    draft.includeStartTime !== false,
    timeZone
  );
  if (startMs == null || Number.isNaN(startMs)) {
    return { ok: false, error: 'Enter a valid start date.' };
  }

  const sign = draft.offsetOp === 'subtract' ? -1 : 1;
  const years = nonNegInt(draft.offsetYears) * sign;
  const months = nonNegInt(draft.offsetMonths) * sign;
  const weeks = nonNegInt(draft.offsetWeeks) * sign;
  const days = nonNegInt(draft.offsetDays) * sign;
  const hours = nonNegInt(draft.offsetHours) * sign;
  const minutes = nonNegInt(draft.offsetMinutes) * sign;
  const seconds = nonNegInt(draft.offsetSeconds) * sign;

  const start = getZonedParts(startMs, timeZone);
  let { year, month } = normalizeMonthYear(start.year + years, start.month + months);
  let day = clampDay(year, month, start.day) + weeks * 7 + days;

  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month);
    ({ year, month } = normalizeMonthYear(year, month + 1));
  }
  while (day < 1) {
    ({ year, month } = normalizeMonthYear(year, month - 1));
    day += daysInMonth(year, month);
  }

  let totalSeconds =
    (start.hour + hours) * 3600 + (start.minute + minutes) * 60 + (start.second + seconds);

  day += Math.floor(totalSeconds / 86400);
  totalSeconds = ((totalSeconds % 86400) + 86400) % 86400;

  const hour = Math.floor(totalSeconds / 3600);
  const minute = Math.floor((totalSeconds % 3600) / 60);
  const second = totalSeconds % 60;

  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month);
    ({ year, month } = normalizeMonthYear(year, month + 1));
  }
  while (day < 1) {
    ({ year, month } = normalizeMonthYear(year, month - 1));
    day += daysInMonth(year, month);
  }

  const resultMs = zonedCivilToUtcMs(year, month, day, hour, minute, second, timeZone);
  const resultParts = getZonedParts(resultMs, timeZone);

  return {
    ok: true,
    startMs,
    resultMs,
    resultParts,
    operation: draft.offsetOp === 'subtract' ? 'subtract' : 'add',
    offsetSummary: formatOffsetSummary(draft),
    displayDate: formatResultDate(resultParts),
    displayTime: formatResultTime(resultParts, draft.includeStartTime !== false),
    isoDate: `${resultParts.year}-${String(resultParts.month).padStart(2, '0')}-${String(resultParts.day).padStart(2, '0')}`,
    isoTime: `${String(resultParts.hour).padStart(2, '0')}:${String(resultParts.minute).padStart(2, '0')}`,
    timeZone,
  };
}

export function formatOffsetCopy(result, draft) {
  if (!result?.ok) return '';
  const op = result.operation === 'subtract' ? 'Subtract' : 'Add';
  return [
    `Time Pass — Add / Subtract`,
    `Start: ${draft.startDate}${draft.includeStartTime !== false ? ` ${draft.startTime}` : ''}`,
    `${op}: ${result.offsetSummary}`,
    `Result: ${result.displayDate} · ${result.displayTime}`,
    `ISO: ${result.isoDate}${draft.includeStartTime !== false ? ` ${result.isoTime}` : ''}`,
  ].join('\n');
}
