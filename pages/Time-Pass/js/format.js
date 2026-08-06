import { unitLabel } from './constants.js';

export function formatUnitValue(unit, value) {
  if (unit === 'hours' || unit === 'minutes' || unit === 'seconds') {
    return String(value).padStart(2, '0');
  }
  return String(value);
}

export function formatPartsLine(parts, visibleUnits) {
  return visibleUnits
    .map((u) => {
      const v = parts[u] || 0;
      return `${formatUnitValue(u, v)} ${unitLabel(u, v)}`;
    })
    .join(' · ');
}

export function directionLabel(direction) {
  return direction === 'until' ? 'until' : 'since';
}

export function recurrenceLabel(frequency) {
  switch (frequency) {
    case 'daily':
      return 'Every day';
    case 'weekly':
      return 'Every Monday';
    case 'monthly':
      return 'Every month';
    case 'yearly':
      return 'Every year';
    default:
      return 'One-time';
  }
}

/** Friendly civil date: "30 Jul 2026" */
export function formatDisplayDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

export function formatDisplayTime(time) {
  if (!time) return '';
  return String(time).slice(0, 5);
}

/** Parse ISO string or Firestore Timestamp-like value to Date. */
export function parseAppTimestamp(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    const d = new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Human-readable created/edited timestamp for the edit modal. */
export function formatAppTimestamp(value) {
  const d = parseAppTimestamp(value);
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function joinUnitPhrases(bits) {
  if (!bits.length) return '';
  if (bits.length === 1) return bits[0];
  if (bits.length === 2) return `${bits[0]} and ${bits[1]}`;
  return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`;
}

/**
 * Relative phrasing from a stat block.
 * @param {object} primary
 * @param {{ maxUnits?: number }} [opts] — how many leading visible units to include (compact often uses 2+)
 */
export function formatRelativeCue(primary, { maxUnits = 1 } = {}) {
  if (!primary) return '';
  const { direction, parts, visibleUnits } = primary;
  const units = Array.isArray(visibleUnits) ? visibleUnits : [];
  if (!units.length) return direction === 'until' ? 'now' : 'just now';

  const limit = Math.max(1, Math.min(Math.floor(Number(maxUnits) || 1), units.length));
  const picked = [];
  for (const u of units) {
    const v = parts[u] || 0;
    // Skip a leading zero when smaller units remain (all-zero edge uses last unit).
    if (picked.length === 0 && v === 0 && units.length > 1) continue;
    picked.push({ u, v });
    if (picked.length >= limit) break;
  }

  if (!picked.length) {
    const u = units[units.length - 1];
    picked.push({ u, v: parts[u] || 0 });
  }

  if (picked.every(({ v }) => v === 0)) {
    return direction === 'until' ? 'now' : 'just now';
  }

  const phrase = joinUnitPhrases(
    picked.map(({ u, v }) => `${formatUnitValue(u, v)} ${unitLabel(u, v)}`)
  );

  if (direction === 'until') return `in ${phrase}`;
  return `${phrase} ago`;
}

export function buildCopySummary(vm) {
  const name = vm.event?.name || 'Event';
  const line = formatPartsLine(vm.primary.parts, vm.primary.visibleUnits);
  const dir = vm.primary.direction === 'until' ? 'until next' : 'since';
  let text = `${name} — ${line} ${dir}`;
  if (vm.cycleProgress) {
    text += `\n${vm.cycleProgress.label} (${vm.cycleProgress.percent}%)`;
  }
  if (vm.secondary) {
    const line2 = formatPartsLine(vm.secondary.parts, vm.secondary.visibleUnits);
    text += `\n${line2} since last`;
  }
  if (vm.sinceFirst) {
    const line3 = formatPartsLine(vm.sinceFirst.parts, vm.sinceFirst.visibleUnits);
    text += `\n${line3} since first`;
  }
  return text;
}

/**
 * How far through the current recurrence cycle (last → next).
 * @returns {{ ratio: number, percent: number, label: string, detail: string } | null}
 */
export function buildCycleProgress(lastMs, nextMs, nowMs = Date.now()) {
  if (lastMs == null || nextMs == null || !(nextMs > lastMs)) return null;
  const span = nextMs - lastMs;
  if (span <= 0) return null;
  const ratio = Math.min(1, Math.max(0, (nowMs - lastMs) / span));
  const percent = Math.round(ratio * 100);
  return {
    ratio,
    percent,
    label: formatCycleProgressLabel(ratio),
    detail: 'from last to next occurrence',
  };
}

const CYCLE_MARKS = [
  { t: 0, label: 'Just after the last occurrence' },
  { t: 1 / 8, label: 'An eighth of the way through' },
  { t: 1 / 4, label: 'A quarter of the way through' },
  { t: 1 / 3, label: 'A third of the way through' },
  { t: 3 / 8, label: 'Three eighths of the way through' },
  { t: 1 / 2, label: 'Halfway through' },
  { t: 5 / 8, label: 'Five eighths of the way through' },
  { t: 2 / 3, label: 'Two thirds of the way through' },
  { t: 3 / 4, label: 'Three quarters of the way through' },
  { t: 7 / 8, label: 'Seven eighths of the way through' },
  { t: 1, label: 'Almost at the next occurrence' },
];

export function formatCycleProgressLabel(ratio) {
  const r = Math.min(1, Math.max(0, Number(ratio) || 0));
  if (r <= 0.02) return CYCLE_MARKS[0].label;
  if (r >= 0.98) return CYCLE_MARKS[CYCLE_MARKS.length - 1].label;

  let best = CYCLE_MARKS[0];
  let bestDist = Infinity;
  for (const mark of CYCLE_MARKS) {
    const d = Math.abs(r - mark.t);
    if (d < bestDist) {
      best = mark;
      bestDist = d;
    }
  }
  return best.label;
}

export function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function offsetIsoDate(daysFromToday) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function offsetIsoMonths(monthsFromToday) {
  const d = new Date();
  const day = d.getDate();
  d.setMonth(d.getMonth() + monthsFromToday);
  // Clamp if month rolled past (e.g. Jan 31 → Mar 3); prefer last day of target month
  if (d.getDate() !== day) d.setDate(0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function toast(message, kind = 'info') {
  const host = document.getElementById('toast-host');
  if (!host) {
    console.log(`[Time Pass] ${message}`);
    return;
  }
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 350);
  }, 3200);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Common IANA zones for the datalist helper */
export const COMMON_TIME_ZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Zurich',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];
