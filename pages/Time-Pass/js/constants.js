/** Shared constants for Time Pass */

export const ALL_UNITS = [
  'decades',
  'years',
  'months',
  'weeks',
  'days',
  'hours',
  'minutes',
  'seconds',
];

/** Default units for newly created events (per-event only; Q12). */
export const DEFAULT_UNITS = ALL_UNITS.filter((u) => u !== 'decades');

export const COLOR_PALETTE = [
  '#3cf0ff',
  '#5b8cff',
  '#a78bfa',
  '#f472b6',
  '#fb923c',
  '#facc15',
  '#4ade80',
  '#2dd4bf',
  '#f87171',
  '#94a3b8',
];

export const RECURRENCE_FREQUENCIES = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

export const NAME_MAX = 80;
export const SOFT_EVENT_CAP = 100;
export const HARD_EVENT_CAP = 250;

export const SCHEMA_VERSION = 1;

/** How many leading units compact cues show (settings; default 2). */
export const COMPACT_CUE_UNITS_MIN = 1;
export const COMPACT_CUE_UNITS_MAX = 5;
export const COMPACT_CUE_UNITS_DEFAULT = 2;

export function normalizeCompactCueUnits(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return COMPACT_CUE_UNITS_DEFAULT;
  return Math.min(COMPACT_CUE_UNITS_MAX, Math.max(COMPACT_CUE_UNITS_MIN, n));
}

export const UNIT_LABELS = {
  decades: ['decade', 'decades'],
  years: ['year', 'years'],
  months: ['month', 'months'],
  weeks: ['week', 'weeks'],
  days: ['day', 'days'],
  hours: ['hour', 'hours'],
  minutes: ['minute', 'minutes'],
  seconds: ['second', 'seconds'],
};

export function unitLabel(unit, value) {
  const pair = UNIT_LABELS[unit] || [unit, unit];
  return value === 1 ? pair[0] : pair[1];
}

export function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function effectiveTimeZone(eventTz) {
  if (eventTz && String(eventTz).trim()) return String(eventTz).trim();
  return getBrowserTimeZone();
}

export function isValidColor(color) {
  return COLOR_PALETTE.includes(color);
}

export function normalizeUnits(units) {
  if (!Array.isArray(units) || units.length === 0) return [...DEFAULT_UNITS];
  const set = new Set(ALL_UNITS);
  const cleaned = units.filter((u) => set.has(u));
  return cleaned.length ? cleaned : [...DEFAULT_UNITS];
}
