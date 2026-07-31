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

/** Compact relative phrasing from primary view model */
export function formatRelativeCue(primary) {
  if (!primary) return '';
  const { direction, parts, visibleUnits } = primary;
  const top = visibleUnits?.[0];
  if (!top) return direction === 'until' ? 'now' : 'just now';
  const v = parts[top] || 0;
  const label = unitLabel(top, v);
  if (direction === 'until') {
    if (v === 0 && visibleUnits.length > 1) {
      const t2 = visibleUnits[1];
      const v2 = parts[t2] || 0;
      return `in ${v2} ${unitLabel(t2, v2)}`;
    }
    return v === 0 ? 'now' : `in ${v} ${label}`;
  }
  if (v === 0 && visibleUnits.length > 1) {
    const t2 = visibleUnits[1];
    const v2 = parts[t2] || 0;
    return `${v2} ${unitLabel(t2, v2)} ago`;
  }
  return v === 0 ? 'just now' : `${v} ${label} ago`;
}

export function buildCopySummary(vm) {
  const name = vm.event?.name || 'Event';
  const line = formatPartsLine(vm.primary.parts, vm.primary.visibleUnits);
  const dir = vm.primary.direction === 'until' ? 'until' : 'since';
  let text = `${name} — ${line} ${dir}`;
  if (vm.secondary) {
    const line2 = formatPartsLine(vm.secondary.parts, vm.secondary.visibleUnits);
    const dir2 = vm.secondary.direction === 'until' ? 'until' : 'since last';
    text += `\n${line2} ${dir2}`;
  }
  return text;
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
