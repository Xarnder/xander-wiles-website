import { isSupabaseConfigured } from '../supabase-config.js';
import { getSession, signInWithGoogle, profileFromSession } from './auth.js';
import { createEvent } from './api.js';
import {
  APP_BASE,
  todayDateString,
  TIMEZONES,
  computeDefaultExpiresAt,
  showToast,
  rememberEventSlug,
  formatDbError,
  eventUrl,
  countEventDays,
  formatDateRange,
} from './utils.js';

const form = document.getElementById('create-form');
const configWarning = document.getElementById('config-warning');
const expiresPreview = document.getElementById('expires-preview');
const dateSpanPreview = document.getElementById('date-span-preview');

function farFutureDateString() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function updateDateSpanPreview() {
  const start = form.start_date.value;
  const end = form.end_date.value;
  const tz = form.timezone.value || 'Europe/London';
  if (!start || !end) {
    dateSpanPreview.textContent = '—';
    return;
  }
  if (end < start) {
    dateSpanPreview.textContent = 'End date must be on or after start date';
    return;
  }
  const days = countEventDays(start, end);
  const dayLabel = days === 1 ? '1 day' : `${days} days`;
  dateSpanPreview.textContent = `${dayLabel} · ${formatDateRange(start, end, tz)}`;
}

function updateExpiresPreview() {
  const end = form.end_date.value;
  const tz = form.timezone.value;
  if (end && tz) {
    expiresPreview.textContent = new Date(computeDefaultExpiresAt(end, tz)).toLocaleString('en-GB', {
      timeZone: tz,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
}

async function init() {
  if (!isSupabaseConfigured()) {
    configWarning.hidden = false;
    form.querySelector('button[type=submit]').disabled = true;
    return;
  }

  const session = await getSession();
  if (!session) {
    showToast('Please sign in first');
    window.location.href = `${APP_BASE}/index.html`;
    return;
  }

  const today = todayDateString();
  const farFuture = farFutureDateString();
  form.start_date.min = today;
  form.start_date.removeAttribute('max');
  form.end_date.min = today;
  form.end_date.removeAttribute('max');
  form.end_date.max = farFuture;
  form.start_date.value = today;
  form.end_date.value = today;

  const tzSelect = form.timezone;
  TIMEZONES.forEach((tz) => {
    const opt = document.createElement('option');
    opt.value = tz;
    opt.textContent = tz.replace(/_/g, ' ');
    if (tz === 'Europe/London') opt.selected = true;
    tzSelect.appendChild(opt);
  });

  form.start_date.addEventListener('change', () => {
    form.end_date.min = form.start_date.value || today;
    form.end_date.max = farFuture;
    if (form.end_date.value < form.start_date.value) {
      form.end_date.value = form.start_date.value;
    }
    updateDateSpanPreview();
    updateExpiresPreview();
  });
  form.end_date.addEventListener('change', () => {
    updateDateSpanPreview();
    updateExpiresPreview();
  });
  form.timezone.addEventListener('change', () => {
    updateDateSpanPreview();
    updateExpiresPreview();
  });
  updateDateSpanPreview();
  updateExpiresPreview();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const session = await getSession();
    if (!session) {
      showToast('Please sign in again', 'error');
      window.location.href = `${APP_BASE}/`;
      return;
    }
    const profile = profileFromSession(session);
    const startDate = form.start_date.value;
    const endDate = form.end_date.value;
    if (endDate < startDate) {
      showToast('End date must be on or after start date', 'error');
      return;
    }
    if (startDate < today) {
      showToast('Start date cannot be in the past', 'error');
      return;
    }

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const editDeadline = form.edit_deadline.value
        ? new Date(form.edit_deadline.value).toISOString()
        : null;
      const expiresAt = form.expires_at.value
        ? new Date(form.expires_at.value).toISOString()
        : computeDefaultExpiresAt(endDate, form.timezone.value);

      const event = await createEvent(
        {
          title: form.title.value,
          description: form.description.value,
          location: form.location.value,
          startDate,
          endDate,
          timezone: form.timezone.value,
          customSlug: form.custom_slug.value,
          visibilityMode: form.visibility_mode.value,
          editDeadline,
          expiresAt,
        },
        profile
      );
      if (!event?.slug) {
        throw new Error('No share link was created. Has the database been set up?');
      }
      rememberEventSlug(event.slug);
      window.location.href = eventUrl(event.slug);
    } catch (err) {
      console.error(err);
      showToast(formatDbError(err), 'error');
      btn.disabled = false;
    }
  });
}

init();
