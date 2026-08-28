/**
 * Scale event time amounts to the card width using worst-case digits/labels
 * so ticking values do not reflow the row.
 */
import { ALL_UNITS, normalizeUnits, unitLabel } from './constants.js';
import { formatRelativeCue, formatUnitValue } from './format.js';

/** Horizon used to size catch-all units when larger ones are disabled. */
export const UNIT_FIT_SPAN_YEARS = 999;

/** Do not grow past this even on a very wide card. */
export const UNIT_FIT_MAX = 2.75;
export const CUE_FIT_MAX = 1.85;
/** Compact grid: keep the longest possible cue readable after scaling. */
export const CUE_FIT_MIN = 0.72;

const PROBE_ID = 'tp-unit-fit-probe';

/**
 * Independent worst-case part for one unit given which units are enabled.
 * Larger units cap remainders; disabled larger units fold into this one.
 */
export function maxPartValue(unit, enabledUnits, spanYears = UNIT_FIT_SPAN_YEARS) {
  const en = new Set(Array.isArray(enabledUnits) && enabledUnits.length ? enabledUnits : ALL_UNITS);
  const span = Math.max(1, Math.floor(Number(spanYears) || UNIT_FIT_SPAN_YEARS));
  const daysInSpan = Math.ceil(span * 365.25) + 31;
  const hoursInSpan = daysInSpan * 24 + 23;
  const minutesInSpan = hoursInSpan * 60 + 59;
  const secondsInSpan = minutesInSpan * 60 + 59;
  const monthsInSpan = span * 12 + 11;
  const hasBigCal = en.has('months') || en.has('years') || en.has('decades');

  switch (unit) {
    case 'decades':
      return en.has('decades') ? Math.floor(span / 10) : 0;
    case 'years':
      if (!en.has('years')) return 0;
      return en.has('decades') ? 9 : span;
    case 'months':
      if (!en.has('months')) return 0;
      if (en.has('years') || en.has('decades')) return 11;
      return monthsInSpan;
    case 'weeks':
      if (!en.has('weeks')) return 0;
      if (hasBigCal) return 4;
      return Math.floor(daysInSpan / 7);
    case 'days':
      if (!en.has('days')) return 0;
      if (en.has('weeks')) return 6;
      if (hasBigCal) return 30;
      return daysInSpan;
    case 'hours':
      if (!en.has('hours')) return 0;
      if (en.has('days') || en.has('weeks')) return 23;
      return hoursInSpan;
    case 'minutes':
      if (!en.has('minutes')) return 0;
      if (en.has('hours')) return 59;
      return minutesInSpan;
    case 'seconds':
      if (!en.has('seconds')) return 0;
      if (en.has('minutes')) return 59;
      return secondsInSpan;
    default:
      return 0;
  }
}

export function maxSampleValue(unit, enabledUnits) {
  return formatUnitValue(unit, maxPartValue(unit, enabledUnits));
}

/** Longer of singular/plural so labels do not jump at 1 → 2. */
export function maxSampleLabel(unit) {
  const a = unitLabel(unit, 1);
  const b = unitLabel(unit, 2);
  return a.length >= b.length ? a : b;
}

export function maxRelativeCueTexts(enabledUnits, { maxUnits = 2, format = 'words' } = {}) {
  const enabled = normalizeUnits(enabledUnits);
  const parts = {};
  for (const u of enabled) parts[u] = maxPartValue(u, enabled);
  const texts = new Set();
  for (const direction of ['until', 'since']) {
    for (let i = 0; i < enabled.length; i++) {
      texts.add(
        formatRelativeCue(
          { direction, parts, visibleUnits: enabled.slice(i) },
          { maxUnits, format }
        )
      );
    }
  }
  return [...texts].filter(Boolean);
}

let measureCache = new Map();

export function clearUnitFitCache() {
  measureCache = new Map();
}

function cacheKey(parts) {
  const theme = document.documentElement.getAttribute('data-theme') || '';
  const bucket = window.innerWidth <= 640 ? 's' : 'l';
  return `${theme}|${bucket}|${parts.join('\n')}`;
}

function probeHost() {
  let host = document.getElementById(PROBE_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = PROBE_ID;
    host.className = 'unit-fit-probe';
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
  }
  return host;
}

function measureMaxUnitRow(visibleUnits, enabledUnits) {
  const visible = Array.isArray(visibleUnits) ? visibleUnits : [];
  const enabled = normalizeUnits(enabledUnits);
  if (!visible.length) return { total: 0, pills: [] };
  const key = cacheKey(['u', visible.join(','), enabled.join(',')]);
  const hit = measureCache.get(key);
  if (hit) return hit;

  const host = probeHost();
  const card = document.createElement('div');
  card.className = 'event-card';
  const row = document.createElement('div');
  row.className = 'unit-row unit-row--probe';
  row.style.setProperty('--unit-fit', '1');
  const pillEls = [];
  for (const u of visible) {
    const pill = document.createElement('div');
    pill.className = 'unit-pill';
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = maxSampleValue(u, enabled);
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = maxSampleLabel(u);
    pill.append(value, label);
    row.appendChild(pill);
    pillEls.push(pill);
  }
  card.appendChild(row);
  host.replaceChildren(card);

  const pills = pillEls.map((el) => el.getBoundingClientRect().width);
  const total = row.scrollWidth;
  const measured = { total, pills };
  measureCache.set(key, measured);
  host.replaceChildren();
  return measured;
}

function measureMaxCueNatural(enabledUnits, { maxUnits, format, compact }) {
  const texts = maxRelativeCueTexts(enabledUnits, { maxUnits, format });
  if (!texts.length) return 0;
  const key = cacheKey(['c', compact ? '1' : '0', String(maxUnits), format, texts.join('|')]);
  const hit = measureCache.get(key);
  if (hit != null) return hit;

  const host = probeHost();
  const card = document.createElement('div');
  card.className = compact ? 'event-card is-compact' : 'event-card';
  card.style.width = 'max-content';
  card.style.padding = '0';
  let widest = 0;
  for (const text of texts) {
    const cue = document.createElement('span');
    cue.className = 'relative-cue';
    cue.style.setProperty('--cue-fit', '1');
    cue.textContent = text;
    card.appendChild(cue);
  }
  host.replaceChildren(card);
  for (const cue of card.querySelectorAll('.relative-cue')) {
    const w = cue.scrollWidth;
    if (w > widest) widest = w;
  }
  measureCache.set(key, widest);
  host.replaceChildren();
  return widest;
}

function applyScale(el, prop, next) {
  const rounded = Math.round(next * 1000) / 1000;
  if (el.style.getPropertyValue(prop) === String(rounded)) return;
  el.style.setProperty(prop, String(rounded));
}

/** Prepare pill slots and return the scale this row needs to fit its longest possible amounts. */
function unitRowNeededFit(row) {
  const pills = [...row.querySelectorAll('.unit-pill[data-unit]')];
  const visible = pills.map((p) => p.getAttribute('data-unit')).filter(Boolean);
  if (!visible.length) return 0;
  const enabled = (row.getAttribute('data-enabled') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const available = row.clientWidth;
  if (!(available > 4)) return 0;

  const measured = measureMaxUnitRow(visible, enabled.length ? enabled : visible);
  if (!(measured.total > 0)) return 0;

  pills.forEach((pill, i) => {
    const w = measured.pills[i];
    if (w > 0) pill.style.setProperty('--pill-w', `${w}px`);
  });

  return Math.min(UNIT_FIT_MAX, (available / measured.total) * 0.995);
}

function compactCueNeededFit(card, opts) {
  const rows = [...card.querySelectorAll('.direction-row')];
  if (!rows.length) return 0;
  const enabled = (card.getAttribute('data-units') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const natural = measureMaxCueNatural(enabled, { ...opts, compact: true });
  if (!(natural > 0)) return 0;

  let available = Infinity;
  for (const row of rows) {
    const date = row.querySelector('.event-date-inline');
    const cs = getComputedStyle(row);
    const gap = date ? parseFloat(cs.columnGap || cs.gap) || 0 : 0;
    const dateW = date ? date.getBoundingClientRect().width : 0;
    const rowAvail = row.clientWidth - (date ? dateW + gap : 0);
    if (rowAvail < available) available = rowAvail;
  }
  if (!(available > 4) || !Number.isFinite(available)) return 0;

  return Math.min(CUE_FIT_MAX, (available / natural) * 0.995);
}

/**
 * One shared scale for every time amount, taken from the longest (tightest) row.
 * @param {ParentNode | null} root
 * @param {{ compact?: boolean, compactCueUnits?: number, compactCueFormat?: string }} [opts]
 */
export function fitTimeAmounts(root, opts = {}) {
  if (!root || typeof document === 'undefined') return;
  const compact = Boolean(opts.compact);
  const cueOpts = {
    maxUnits: opts.maxUnits ?? opts.compactCueUnits ?? 2,
    format: opts.format ?? opts.compactCueFormat ?? 'words',
  };

  if (compact) {
    const cards = [...root.querySelectorAll('.event-card.is-compact')];
    let shared = CUE_FIT_MAX;
    let any = false;
    for (const card of cards) {
      const fit = compactCueNeededFit(card, cueOpts);
      if (!(fit > 0)) continue;
      any = true;
      if (fit < shared) shared = fit;
    }
    if (any) {
      for (const card of cards) applyScale(card, '--cue-fit', shared);
    }
    return;
  }

  const rows = [...root.querySelectorAll('.unit-row')];
  let shared = UNIT_FIT_MAX;
  let any = false;
  for (const row of rows) {
    const fit = unitRowNeededFit(row);
    if (!(fit > 0)) continue;
    any = true;
    if (fit < shared) shared = fit;
  }
  if (!any) return;
  for (const row of rows) applyScale(row, '--unit-fit', shared);
}

/**
 * Compact column floor: emoji/chrome plus the longest possible cue at CUE_FIT_MIN.
 */
export function compactCueFloorWidth(enabledUnits, { maxUnits, format, compact = true } = {}) {
  return measureMaxCueNatural(enabledUnits, { maxUnits, format, compact }) * CUE_FIT_MIN;
}
