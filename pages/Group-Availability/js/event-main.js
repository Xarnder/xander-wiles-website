import { isSupabaseConfigured } from '../supabase-config.js';
import { getSession, signInWithGoogle, onAuthStateChange, profileFromSession, applyAvatarImage } from './auth.js';
import { getActiveClient } from './supabase-client.js';
import {
  fetchEventBySlug,
  fetchEventById,
  fetchParticipants,
  fetchSlots,
  joinAsAuthUser,
  joinAsGuest,
  syncSlots,
  markSubmitted,
  updateEvent,
  deleteEvent,
  mergeGuestToUser,
} from './api.js';
import {
  getGuestToken,
  setGuestToken,
  createGuestToken,
  clearGuestToken,
  setParticipantId,
} from './guest.js';
import { buildDayCalendar, buildMultiDayCalendar } from './calendar.js';
import { computeOverlap, slotsToParticipantMaps, canSeeIndividualGrids } from './overlap.js';
import { subscribeToEvent } from './realtime.js';
import { confirmAction } from './confirm-modal.js';
import { BLIND_GATE_MESSAGE, filterSlotsForViewer } from './blind-gate.js';
import { formatOverlapSummary, overlapToIcs, downloadTextFile } from './export.js';
import {
  APP_BASE,
  debounce,
  eventAllowsEdits,
  formatDateRange,
  formatDeadlineCountdown,
  copyToClipboard,
  showToast,
  getEventContextFromLocation,
  buildShareUrl,
  formatDbError,
  clearEventNavStorage,
  expandDaysToSlotMap,
  slotsToDaySelection,
  hourToTimeInput,
  parseTimeInput,
  syncEventUrl,
  eventUrl,
} from './utils.js';

let slug = null;

const els = {
  loading: document.getElementById('loading'),
  notFound: document.getElementById('not-found'),
  app: document.getElementById('event-app'),
  configWarning: document.getElementById('config-warning'),
  title: document.getElementById('event-title'),
  meta: document.getElementById('event-meta'),
  statusBar: document.getElementById('status-bar'),
  copyLink: document.getElementById('copy-link'),
  shareUrlInput: document.getElementById('share-url-input'),
  participantCount: document.getElementById('participant-count'),
  joinPanel: document.getElementById('join-panel'),
  guestForm: document.getElementById('guest-form'),
  guestName: document.getElementById('guest-name'),
  googleJoin: document.getElementById('google-join'),
  identityBar: document.getElementById('identity-bar'),
  identityName: document.getElementById('identity-name'),
  identityAvatar: document.getElementById('identity-avatar'),
  mergeGoogle: document.getElementById('merge-google'),
  paintSection: document.getElementById('paint-section'),
  paintGrid: document.getElementById('paint-grid'),
  timeStart: document.getElementById('time-start'),
  timeEnd: document.getElementById('time-end'),
  timeRangePanel: document.getElementById('time-range-panel'),
  toolbar: document.getElementById('paint-toolbar'),
  blindGate: document.getElementById('blind-gate'),
  multiSection: document.getElementById('multi-section'),
  multiGrid: document.getElementById('multi-grid'),
  overlapList: document.getElementById('overlap-list'),
  organizerPanel: document.getElementById('organizer-panel'),
  editDeadlineInput: document.getElementById('org-edit-deadline'),
  visibilitySelect: document.getElementById('org-visibility'),
  closeToggle: document.getElementById('org-close'),
  saveOrgBtn: document.getElementById('org-save'),
  deleteBtn: document.getElementById('org-delete'),
  editNameBtn: document.getElementById('edit-name-btn'),
  nameEditRow: document.getElementById('name-edit-row'),
  nameEditInput: document.getElementById('name-edit-input'),
  nameSaveBtn: document.getElementById('name-save-btn'),
  copyOverlapBtn: document.getElementById('copy-overlap'),
  downloadIcsBtn: document.getElementById('download-ics'),
  eventDescription: document.getElementById('event-description'),
};

let countdownTimer = null;

let state = {
  event: null,
  session: null,
  profile: null,
  participant: null,
  guestToken: null,
  participants: [],
  slots: [],
  paintController: null,
  brush: 'likely',
  pendingSave: false,
};

function client() {
  return getActiveClient({ session: state.session, guestToken: state.guestToken });
}

function isOrganizer() {
  return state.session && state.event?.organizer_id === state.session.user.id;
}

function viewerSlots() {
  return filterSlotsForViewer(state.slots, state.participant);
}

function startCountdownTimer() {
  if (countdownTimer) clearInterval(countdownTimer);
  if (!state.event?.edit_deadline || state.event.is_closed) return;
  countdownTimer = setInterval(() => {
    if (!state.event?.edit_deadline) return;
    renderStatus();
    if (new Date(state.event.edit_deadline) <= new Date()) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      renderPaintGrid();
    }
  }, 30000);
}

function renderStatus() {
  const ev = state.event;
  const parts = [];
  if (ev.is_closed) parts.push('<span class="badge badge-closed">Event closed</span>');
  if (ev.edit_deadline) {
    const d = new Date(ev.edit_deadline);
    const past = d <= new Date();
    const countdown = past ? 'deadline passed' : formatDeadlineCountdown(ev.edit_deadline);
    parts.push(
      `<span class="badge ${past ? 'badge-closed' : 'badge-deadline'}">Last edit: ${d.toLocaleString('en-GB', { timeZone: ev.timezone, dateStyle: 'medium', timeStyle: 'short' })} <span class="countdown">(${escapeHtml(countdown)})</span></span>`
    );
  }
  if (!eventAllowsEdits(ev)) {
    parts.push('<span class="muted">Editing is disabled</span>');
  }
  els.statusBar.innerHTML = parts.join(' ') || '<span class="muted">Open for responses</span>';
}

function renderOverlap() {
  const disableExport = () => {
    if (els.copyOverlapBtn) els.copyOverlapBtn.disabled = true;
    if (els.downloadIcsBtn) els.downloadIcsBtn.disabled = true;
  };

  if (!state.participant) {
    disableExport();
    els.overlapList.innerHTML = '<p class="muted">Join the event to mark your availability.</p>';
    return;
  }
  if (!state.participant.has_submitted_availability) {
    disableExport();
    els.overlapList.innerHTML =
      '<p class="muted">Submit your availability to see the best overlapping times.</p>';
    return;
  }

  const ranges = computeOverlap(state.event, state.participants, viewerSlots());
  const canExport = ranges.length > 0;
  if (els.copyOverlapBtn) els.copyOverlapBtn.disabled = !canExport;
  if (els.downloadIcsBtn) els.downloadIcsBtn.disabled = !canExport;
  if (!ranges.length) {
    els.overlapList.innerHTML = '<p class="muted">No overlapping availability yet.</p>';
    return;
  }
  els.overlapList.innerHTML = ranges
    .map(
      (r) => `
    <div class="overlap-item glass-card">
      <div class="overlap-score">${r.score} pts</div>
      <div>
        <strong>${escapeHtml(r.label)}</strong>
        <span class="muted">${escapeHtml(r.detail)}</span>
      </div>
    </div>`
    )
    .join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMultiGrid() {
  const canSee = canSeeIndividualGrids(state.event, state.participant, state.session);
  if (!canSee) {
    els.multiSection.hidden = true;
    els.blindGate.hidden = !state.participant || state.participant.has_submitted_availability;
    if (!state.participant?.has_submitted_availability) {
      els.blindGate.hidden = false;
      els.blindGate.textContent = BLIND_GATE_MESSAGE;
    }
    return;
  }

  els.blindGate.hidden = true;
  els.multiSection.hidden = false;
  const maps = slotsToParticipantMaps(viewerSlots(), state.event);
  buildMultiDayCalendar(els.multiGrid, state.event, state.participants, maps);
}

function setTimeInputs(startHour, endHour, readOnly) {
  if (!els.timeStart || !els.timeEnd) return;
  els.timeStart.value = hourToTimeInput(startHour);
  els.timeEnd.value = hourToTimeInput(endHour);
  els.timeStart.disabled = readOnly;
  els.timeEnd.disabled = readOnly;
}

function buildSlotMapFromUi() {
  const dayMap = state.paintController?.getDays() || new Map();
  const startHour = parseTimeInput(els.timeStart?.value);
  const endHour = parseTimeInput(els.timeEnd?.value);
  return expandDaysToSlotMap(dayMap, startHour, endHour);
}

function renderPaintGrid() {
  if (!state.participant) return;
  const maps = slotsToParticipantMaps(state.slots, state.event);
  const myMap = maps.get(state.participant.id) || new Map();
  const { days, startHour, endHour } = slotsToDaySelection(myMap);
  const readOnly = !eventAllowsEdits(state.event);

  setTimeInputs(startHour, endHour, readOnly);
  if (els.timeRangePanel) els.timeRangePanel.hidden = false;

  if (state.paintController) state.paintController.destroy();
  state.paintController = buildDayCalendar(els.paintGrid, state.event, days, {
    brush: state.brush,
    readOnly,
    onChange: scheduleSave,
  });
}

const scheduleSave = debounce(async () => {
  if (!state.participant || !eventAllowsEdits(state.event)) return;
  const startHour = parseTimeInput(els.timeStart?.value);
  const endHour = parseTimeInput(els.timeEnd?.value);
  if (endHour <= startHour) {
    showToast('End time must be after start time', 'error');
    return;
  }
  await onSlotsChanged(buildSlotMapFromUi());
}, 400);

const onSlotsChanged = async (slotMap) => {
  if (!state.participant || !eventAllowsEdits(state.event)) return;
  state.pendingSave = true;
  try {
    await syncSlots(state.event, state.participant.id, slotMap, client());
    if (!state.participant.has_submitted_availability) {
      await markSubmitted(state.participant.id, client());
      state.participant.has_submitted_availability = true;
      els.blindGate.hidden = true;
      await reloadData();
    } else {
      await reloadSlots();
    }
    renderOverlap();
    renderMultiGrid();
    showToast('Saved');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Save failed', 'error');
  } finally {
    state.pendingSave = false;
  }
};

async function reloadSlots() {
  state.slots = await fetchSlots(state.event.id, client());
}

async function reloadData() {
  state.participants = await fetchParticipants(state.event.id, client());
  state.slots = await fetchSlots(state.event.id, client());
  els.participantCount.textContent = `${state.participants.length} participant${state.participants.length === 1 ? '' : 's'}`;
}

function showMainUi() {
  els.joinPanel.hidden = true;
  els.paintSection.hidden = false;
  els.identityBar.hidden = false;
  els.identityName.textContent = state.participant.display_name;
  applyAvatarImage(
    els.identityAvatar,
    state.participant.avatar_url || state.profile?.avatarUrl
  );
  els.mergeGoogle.hidden = Boolean(state.session);

  renderPaintGrid();
  renderMultiGrid();
  renderOverlap();

  if (isOrganizer()) {
    els.organizerPanel.hidden = false;
    els.editDeadlineInput.value = state.event.edit_deadline
      ? toLocalInputValue(state.event.edit_deadline, state.event.timezone)
      : '';
    els.visibilitySelect.value = state.event.visibility_mode;
    els.closeToggle.checked = state.event.is_closed;
  }
}

function toLocalInputValue(iso, timeZone) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

async function ensureParticipant() {
  if (state.session && state.profile) {
    state.participant = await joinAsAuthUser(state.event, state.profile, client());
    const guestTok = getGuestToken(state.event.id);
    if (guestTok) {
      try {
        await mergeGuestToUser(state.event.id, guestTok);
        clearGuestToken(state.event.id);
        state.participant = await joinAsAuthUser(state.event, state.profile, client());
        showToast('Guest profile linked to your Google account');
      } catch {
        /* already merged or no guest row */
      }
    }
  } else if (state.guestToken) {
    const name = localStorage.getItem(`wth_guest_name_${state.event.id}`) || 'Guest';
    state.participant = await joinAsGuest(state.event, name, state.guestToken);
  }
  if (state.participant) setParticipantId(state.event.id, state.participant.id);
}

function updateShareLink() {
  if (!slug) return;
  const url = buildShareUrl(slug);
  if (els.shareUrlInput) els.shareUrlInput.value = url;
}

async function bootEvent() {
  const ctx = getEventContextFromLocation();
  slug = ctx.slug;

  if (!slug && !ctx.eventId) {
    els.loading.hidden = true;
    els.notFound.hidden = false;
    document.getElementById('not-found-detail').textContent =
      'No event ID in the link. Open an event from your dashboard or use the full share URL.';
    return;
  }

  if (!isSupabaseConfigured()) {
    els.loading.hidden = true;
    els.configWarning.hidden = false;
    return;
  }

  state.session = await getSession();
  state.profile = state.session ? profileFromSession(state.session) : null;

  try {
    if (slug) {
      state.event = await fetchEventBySlug(slug, client());
    } else {
      state.event = await fetchEventById(ctx.eventId, client());
      if (state.event?.slug) slug = state.event.slug;
    }

    if (!state.event) {
      els.loading.hidden = true;
      els.notFound.hidden = false;
      const label = slug || ctx.eventId || 'unknown';
      document.getElementById('not-found-detail').textContent =
        `No event found for "${label}". If you just created it, confirm schema.sql was run in Supabase and check the Table Editor for an events row.`;
      return;
    }

    clearEventNavStorage();
    if (slug) syncEventUrl(slug);

    updateShareLink();

    state.guestToken = getGuestToken(state.event.id);

    els.title.textContent = state.event.title;
    if (els.eventDescription) {
      if (state.event.description) {
        els.eventDescription.textContent = state.event.description;
        els.eventDescription.hidden = false;
      } else {
        els.eventDescription.hidden = true;
      }
    }
    els.meta.textContent = `${formatDateRange(state.event.start_date, state.event.end_date, state.event.timezone)} · ${state.event.timezone.replace(/_/g, ' ')}`;
    renderStatus();
    startCountdownTimer();

    await reloadData();

    if (state.session) {
      await ensureParticipant();
      showMainUi();
    } else if (state.guestToken) {
      await ensureParticipant();
      showMainUi();
    } else {
      els.joinPanel.hidden = false;
      els.paintSection.hidden = true;
      renderOverlap();
    }

    els.loading.hidden = true;
    els.app.hidden = false;

    subscribeToEvent(state.event.id, client(), {
      onSlots: async () => {
        await reloadSlots();
        if (state.participant) {
          renderPaintGrid();
          renderMultiGrid();
          renderOverlap();
        }
      },
      onParticipants: reloadData,
      onEvent: (ev) => {
        state.event = ev;
        renderStatus();
        startCountdownTimer();
        renderPaintGrid();
        renderMultiGrid();
        renderOverlap();
      },
    });
  } catch (err) {
    console.error(err);
    els.loading.hidden = true;
    els.notFound.hidden = false;
    document.getElementById('not-found-detail').textContent = formatDbError(err);
    showToast(formatDbError(err), 'error');
  }
}

function setupToolbar() {
  els.toolbar.querySelectorAll('[data-brush]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.brush = btn.dataset.brush;
      els.toolbar.querySelectorAll('[data-brush]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.paintController?.setBrush(state.brush);
    });
  });

  const onTimeInput = () => scheduleSave();
  els.timeStart?.addEventListener('change', onTimeInput);
  els.timeEnd?.addEventListener('change', onTimeInput);
}

function setupJoin() {
  els.googleJoin?.addEventListener('click', async () => {
    await signInWithGoogle(`${APP_BASE}/event?slug=${encodeURIComponent(slug)}`);
  });

  els.guestForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = els.guestName.value.trim();
    if (!name) return;
    const token = createGuestToken();
    setGuestToken(state.event.id, token);
    localStorage.setItem(`wth_guest_name_${state.event.id}`, name);
    state.guestToken = token;
    await ensureParticipant();
    await reloadData();
    showMainUi();
  });

  els.mergeGoogle?.addEventListener('click', async () => {
    await signInWithGoogle(`${APP_BASE}/event?slug=${encodeURIComponent(slug)}`);
  });

  els.copyLink?.addEventListener('click', async () => {
    const url = buildShareUrl(slug);
    await copyToClipboard(url);
    showToast('Link copied');
  });

  els.copyOverlapBtn?.addEventListener('click', async () => {
    if (!state.participant?.has_submitted_availability) return;
    const ranges = computeOverlap(state.event, state.participants, viewerSlots());
    const text = formatOverlapSummary(state.event, ranges);
    await copyToClipboard(text);
    showToast('Overlap summary copied');
  });

  els.downloadIcsBtn?.addEventListener('click', () => {
    if (!state.participant?.has_submitted_availability) return;
    const ranges = computeOverlap(state.event, state.participants, viewerSlots());
    if (!ranges.length) return;
    const ics = overlapToIcs(state.event, ranges);
    const safeTitle = (state.event.title || 'event').replace(/[^\w-]+/g, '-').slice(0, 40);
    downloadTextFile(`${safeTitle}-best-times.ics`, ics, 'text/calendar');
    showToast('Calendar file downloaded');
  });

  els.editNameBtn?.addEventListener('click', () => {
    els.nameEditRow.hidden = false;
    els.nameEditInput.value = state.participant?.display_name || '';
  });

  els.nameSaveBtn?.addEventListener('click', async () => {
    const name = els.nameEditInput.value.trim();
    if (!name || !state.participant) return;
    const db = client();
    const { data, error } = await db
      .from('event_participants')
      .update({ display_name: name })
      .eq('id', state.participant.id)
      .select()
      .single();
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    state.participant = data;
    localStorage.setItem(`wth_guest_name_${state.event.id}`, name);
    els.identityName.textContent = name;
    els.nameEditRow.hidden = true;
    await reloadData();
    renderMultiGrid();
    showToast('Name updated');
  });

  els.saveOrgBtn?.addEventListener('click', async () => {
    if (!isOrganizer()) return;
    try {
      const patch = {
        visibility_mode: els.visibilitySelect.value,
        is_closed: els.closeToggle.checked,
        edit_deadline: els.editDeadlineInput.value
          ? new Date(els.editDeadlineInput.value).toISOString()
          : null,
      };
      state.event = await updateEvent(state.event.id, patch);
      renderStatus();
      renderPaintGrid();
      renderMultiGrid();
      showToast('Event settings saved');
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    }
  });

  els.deleteBtn?.addEventListener('click', async () => {
    if (!isOrganizer()) return;
    const title = state.event?.title || 'this event';
    const confirmed = await confirmAction({
      title: 'Delete event?',
      message: `${title} will be permanently removed along with everyone's availability. This cannot be undone.`,
      highlight: title,
      confirmLabel: 'Delete event',
      cancelLabel: 'Keep event',
    });
    if (!confirmed) return;
    try {
      await deleteEvent(state.event.id);
      window.location.href = `${APP_BASE}/index.html`;
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    }
  });
}

setupToolbar();
setupJoin();
bootEvent();

onAuthStateChange(async (session) => {
  if (!state.event) return;
  state.session = session;
  state.profile = session ? profileFromSession(session) : null;
  if (session && !state.participant?.user_id) {
    await ensureParticipant();
    await reloadData();
    showMainUi();
  }
});
