export const APP_BASE = '/pages/Group-Availability';
/** Canonical origin for share links (always production, even when developing locally). */
export const SHARE_ORIGIN = 'https://xanderwiles.com';

export function debounce(fn, ms = 400) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function generateSlug(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const arr = crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i++) {
    result += chars[arr[i] % chars.length];
  }
  return result;
}

export function sanitizeSlug(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function enumerateDates(startDate, endDate) {
  const dates = [];
  const cur = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function countEventDays(startDate, endDate) {
  if (!startDate || !endDate || endDate < startDate) return 0;
  return enumerateDates(startDate, endDate).length;
}

export function getZonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = {};
  fmt.formatToParts(date).forEach(({ type, value }) => {
    parts[type] = value;
  });
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parseInt(parts.hour, 10) % 24,
    minute: parseInt(parts.minute, 10),
  };
}

/** Convert a local date+hour in event timezone to UTC ISO string */
export function localSlotToUtc(dateStr, hour, timeZone) {
  const [year, month, day] = dateStr.split('-').map(Number);
  let utc = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let i = 0; i < 6; i++) {
    const d = new Date(utc);
    const { date: shownDate, hour: shownHour } = getZonedParts(d, timeZone);
    if (shownDate === dateStr && shownHour === hour) {
      return d.toISOString();
    }
    const target = Date.parse(`${dateStr}T${String(hour).padStart(2, '0')}:00:00Z`);
    const shown = Date.parse(`${shownDate}T${String(shownHour).padStart(2, '0')}:00:00Z`);
    utc += target - shown;
  }
  return new Date(utc).toISOString();
}

export function utcToSlotKey(iso, timeZone) {
  const { date, hour } = getZonedParts(new Date(iso), timeZone);
  return `${date}|${hour}`;
}

export function formatSlotLabel(dateStr, hour, timeZone) {
  const iso = localSlotToUtc(dateStr, hour, timeZone);
  const d = new Date(iso);
  const dayFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${dayFmt.format(d)}, ${timeFmt.format(d)}`;
}

export function formatHourLabel(hour) {
  const h = hour % 24;
  if (h === 0) return '12 am';
  if (h < 12) return `${h} am`;
  if (h === 12) return '12 pm';
  return `${h - 12} pm`;
}

export function formatHourRangeLabel(startHour, endHour) {
  return `${formatHourLabel(startHour)} – ${formatHourLabel(endHour)}`;
}

export function hourToTimeInput(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function parseTimeInput(value) {
  if (!value) return 0;
  const [h] = value.split(':').map(Number);
  return Number.isFinite(h) ? h % 24 : 0;
}

function mergeDayConfidence(existing, next) {
  if (!existing) return next;
  if (existing === 'likely' || next === 'likely') return 'likely';
  return 'maybe';
}

/** Derive selected days + time window from hourly slot keys (`date|hour`). */
export function slotsToDaySelection(slotMap) {
  const days = new Map();
  let minHour = 24;
  let maxHour = -1;

  for (const [key, confidence] of slotMap.entries()) {
    const [dateStr, hourStr] = key.split('|');
    if (!dateStr || hourStr === undefined) continue;
    const hour = parseInt(hourStr, 10);
    days.set(dateStr, mergeDayConfidence(days.get(dateStr), confidence));
    minHour = Math.min(minHour, hour);
    maxHour = Math.max(maxHour, hour);
  }

  return {
    days,
    startHour: minHour === 24 ? 10 : minHour,
    endHour: maxHour < 0 ? 22 : maxHour + 1,
  };
}

/** Expand day picks + time window into hourly slot keys for storage. */
export function expandDaysToSlotMap(days, startHour, endHour) {
  const slotMap = new Map();
  if (endHour <= startHour) return slotMap;
  for (const [dateStr, confidence] of days.entries()) {
    for (let hour = startHour; hour < endHour; hour++) {
      slotMap.set(`${dateStr}|${hour}`, confidence);
    }
  }
  return slotMap;
}

export function formatDateRange(start, end, timeZone) {
  const opts = { timeZone, day: 'numeric', month: 'short', year: 'numeric' };
  const a = new Intl.DateTimeFormat('en-GB', opts).format(new Date(`${start}T12:00:00`));
  const b = new Intl.DateTimeFormat('en-GB', opts).format(new Date(`${end}T12:00:00`));
  return start === end ? a : `${a} – ${b}`;
}

export function computeDefaultExpiresAt(endDate, timeZone) {
  const endOfDay = localSlotToUtc(endDate, 23, timeZone);
  const d = new Date(endOfDay);
  d.setUTCMinutes(d.getUTCMinutes() + 59);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString();
}

export function formatDeadlineCountdown(deadlineIso) {
  const deadline = new Date(deadlineIso);
  const ms = deadline - Date.now();
  if (ms <= 0) return 'Deadline passed';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h left to edit`;
  if (hours > 0) return `${hours}h ${mins}m left to edit`;
  if (mins > 0) return `${mins}m left to edit`;
  return 'Less than 1m left to edit';
}

export function eventAllowsEdits(event) {
  if (!event) return false;
  if (event.is_closed) return false;
  if (event.expires_at && new Date(event.expires_at) <= new Date()) return false;
  if (event.edit_deadline && new Date(event.edit_deadline) <= new Date()) return false;
  return true;
}

export function eventUrl(slug) {
  if (!slug) return `${APP_BASE}/event`;
  return `${APP_BASE}/event?slug=${encodeURIComponent(slug)}`;
}

export function buildShareUrl(slug) {
  return `${SHARE_ORIGIN}${eventUrl(slug)}`;
}

function normalizeSlug(value) {
  if (!value || value === 'undefined' || value === 'null') return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/** Read slug / event id from URL, path, or sessionStorage (survives cleanUrl redirects) */
export function getEventContextFromLocation() {
  const params = new URLSearchParams(window.location.search);

  const fromQuery = normalizeSlug(params.get('slug'));
  if (fromQuery) return { slug: fromQuery, eventId: null };

  const pathMatch = window.location.pathname.match(/\/Group-Availability\/event\/([^/]+)\/?$/);
  if (pathMatch) {
    return { slug: normalizeSlug(decodeURIComponent(pathMatch[1])), eventId: null };
  }

  const eventId = params.get('id');
  if (eventId) return { slug: null, eventId };

  try {
    const navSlug = sessionStorage.getItem('wth_nav_slug');
    if (navSlug) return { slug: normalizeSlug(navSlug), eventId: null };

    const navId = sessionStorage.getItem('wth_nav_event_id');
    if (navId) return { slug: null, eventId: navId };

    const pending = sessionStorage.getItem('wth_pending_slug');
    if (pending) return { slug: normalizeSlug(pending), eventId: null };
  } catch {
    /* ignore */
  }

  return { slug: null, eventId: null };
}

export function getEventSlugFromLocation() {
  return getEventContextFromLocation().slug;
}

export function rememberEventSlug(slug) {
  try {
    sessionStorage.setItem('wth_pending_slug', slug);
    sessionStorage.setItem('wth_nav_slug', slug);
  } catch {
    /* ignore */
  }
}

export function clearEventNavStorage() {
  try {
    sessionStorage.removeItem('wth_nav_slug');
    sessionStorage.removeItem('wth_nav_event_id');
    sessionStorage.removeItem('wth_pending_slug');
  } catch {
    /* ignore */
  }
}

/** Navigate to event page with sessionStorage backup if query string is dropped */
export function navigateToEvent(slug, eventId = null) {
  try {
    if (slug) {
      sessionStorage.setItem('wth_nav_slug', slug);
      window.location.href = eventUrl(slug);
    } else if (eventId) {
      sessionStorage.setItem('wth_nav_event_id', eventId);
      window.location.href = `${APP_BASE}/event?id=${encodeURIComponent(eventId)}`;
    }
  } catch {
    if (slug) window.location.href = eventUrl(slug);
    else if (eventId) window.location.href = `${APP_BASE}/event?id=${encodeURIComponent(eventId)}`;
  }
}

export function syncEventUrl(slug) {
  if (!slug) return;
  const target = `${eventUrl(slug)}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== target) {
    window.history.replaceState({}, '', target);
  }
}

export function formatDbError(err) {
  const code = err?.code || '';
  const msg = err?.message || String(err);
  if (code === '42P01' || msg.includes('does not exist')) {
    return 'Database tables are missing. Run pages/Group-Availability/supabase/schema.sql in the Supabase SQL Editor.';
  }
  if (
    code === 'PGRST204' ||
    msg.includes("'location' column") ||
    msg.includes('column events.location')
  ) {
    return "Database needs updating: run pages/Group-Availability/supabase/migrate-existing.sql in the Supabase SQL Editor, wait a few seconds, then reload this page.";
  }
  if (code === '42501' || msg.includes('row-level security')) {
    return 'Permission denied. Sign in again, or check Supabase RLS policies.';
  }
  return msg;
}

export function copyToClipboard(text) {
  return navigator.clipboard?.writeText(text);
}

export function showToast(message, type = 'info') {
  let el = document.getElementById('wth-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wth-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add('visible');
  clearTimeout(el._hide);
  el._hide = setTimeout(() => el.classList.remove('visible'), 3200);
}

export const TIMEZONES = [
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
  'Australia/Sydney',
  'Asia/Tokyo',
  'Asia/Singapore',
  'UTC',
];
