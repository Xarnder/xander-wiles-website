import { isSupabaseConfigured } from '../supabase-config.js';
import { recoverOAuthRedirectFromSiteRoot } from './oauth-recover.js';
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
  deleteParticipant,
  mergeGuestToUser,
} from './api.js';
import {
  getGuestToken,
  setGuestToken,
  createGuestToken,
  clearGuestToken,
  setParticipantId,
} from './guest.js';
import { buildDayCalendar, buildMultiDayCalendar, buildGroupHeatCalendar } from './calendar.js';
import { computeDayAvailabilityCounts } from './heatmap.js';
import { computeOverlap, slotsToParticipantMaps, canSeeIndividualGrids } from './overlap.js';
import { subscribeToEvent } from './realtime.js';
import { confirmAction } from './confirm-modal.js';
import { BLIND_GATE_MESSAGE, filterSlotsForViewer } from './blind-gate.js';
import { formatOverlapSummary, overlapToIcs, downloadTextFile } from './export.js';
import { isGuestPreviewActive, navigateToGuestPreview, exitGuestPreview } from './guest-preview.js';
import {
  APP_BASE,
  eventAllowsEdits,
  formatDateRange,
  formatDeadlineCountdown,
  computeDefaultExpiresAt,
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
  eventLocation: document.getElementById('event-location'),
  statusBar: document.getElementById('status-bar'),
  copyLink: document.getElementById('copy-link'),
  shareLinkBox: document.getElementById('share-link-box'),
  shareUrlInput: document.getElementById('share-url-input'),
  participantCount: document.getElementById('participant-count'),
  identityBar: document.getElementById('identity-bar'),
  identityGoogleView: document.getElementById('identity-google-view'),
  identityGuestDisplay: document.getElementById('identity-guest-display'),
  identityGuestEdit: document.getElementById('identity-guest-edit'),
  identityDisplayName: document.getElementById('identity-display-name'),
  guestDisplayName: document.getElementById('guest-display-name'),
  guestNameInput: document.getElementById('guest-name-input'),
  guestSaveName: document.getElementById('guest-save-name'),
  googleJoin: document.getElementById('google-join'),
  identityAvatar: document.getElementById('identity-avatar'),
  editNameBtn: document.getElementById('edit-name-btn'),
  nameCancelBtn: document.getElementById('name-cancel-btn'),
  paintSection: document.getElementById('paint-section'),
  overlapSection: document.getElementById('overlap-section'),
  paintGrid: document.getElementById('paint-grid'),
  timeStart: document.getElementById('time-start'),
  timeEnd: document.getElementById('time-end'),
  timeRangePanel: document.getElementById('time-range-panel'),
  timeRangeSummary: document.getElementById('time-range-summary'),
  timeRangeBody: document.getElementById('time-range-body'),
  timeRangeEdit: document.getElementById('time-range-edit'),
  timeRangeSave: document.getElementById('time-range-save'),
  timeRangeCancel: document.getElementById('time-range-cancel'),
  toolbar: document.getElementById('paint-toolbar'),
  brushIndicator: document.getElementById('brush-indicator'),
  saveAvailability: document.getElementById('save-availability'),
  blindGate: document.getElementById('blind-gate'),
  multiSection: document.getElementById('multi-section'),
  multiSectionPanel: document.getElementById('multi-section-panel'),
  multiSectionSummary: document.getElementById('multi-section-summary'),
  multiSectionBody: document.getElementById('multi-section-body'),
  multiSectionToggle: document.getElementById('multi-section-toggle'),
  multiGrid: document.getElementById('multi-grid'),
  refreshAvailability: document.getElementById('refresh-availability'),
  organizerViewBar: document.getElementById('organizer-view-bar'),
  organizerViewLabel: document.getElementById('organizer-view-label'),
  toggleGuestPreview: document.getElementById('toggle-guest-preview'),
  overlapList: document.getElementById('overlap-list'),
  organizerPanel: document.getElementById('organizer-panel'),
  editDeadlineInput: document.getElementById('org-edit-deadline'),
  orgLocationInput: document.getElementById('org-location'),
  orgStartDate: document.getElementById('org-start-date'),
  orgEndDate: document.getElementById('org-end-date'),
  visibilitySelect: document.getElementById('org-visibility'),
  closeToggle: document.getElementById('org-close'),
  saveOrgBtn: document.getElementById('org-save'),
  deleteBtn: document.getElementById('org-delete'),
  copyOverlapBtn: document.getElementById('copy-overlap'),
  downloadIcsBtn: document.getElementById('download-ics'),
  overlapPagination: document.getElementById('overlap-pagination'),
  overlapPrev: document.getElementById('overlap-prev'),
  overlapNext: document.getElementById('overlap-next'),
  overlapPageInfo: document.getElementById('overlap-page-info'),
  heatmapSection: document.getElementById('heatmap-section'),
  heatmapGrid: document.getElementById('heatmap-grid'),
  heatmapLegend: document.getElementById('heatmap-legend'),
  heatmapLegendDetail: document.getElementById('heatmap-legend-detail'),
  eventDescription: document.getElementById('event-description'),
};

let countdownTimer = null;

const OVERLAP_PAGE_SIZE = 7;

const BRUSH_LABELS = {
  likely: 'Likely free',
  maybe: 'Maybe free',
  erase: 'Eraser',
};

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
  hasUnsavedChanges: false,
  isSaving: false,
  overlapRanges: [],
  overlapPage: 0,
  editingGuestName: false,
  timeRangeEditing: false,
  appliedTimeStart: 10,
  appliedTimeEnd: 22,
  multiSectionExpanded: false,
};

let lastSavedSnapshot = '';

function client() {
  return getActiveClient({ session: state.session, guestToken: state.guestToken });
}

function isOrganizer() {
  return state.session && state.event?.organizer_id === state.session.user.id;
}

function hasOrganizerAccess() {
  return isOrganizer() && !isGuestPreviewActive();
}

function updateGuestPreviewUi() {
  const previewing = isGuestPreviewActive();
  const canPreview = isOrganizer();

  if (els.organizerViewBar) {
    els.organizerViewBar.hidden = !canPreview;
    els.organizerViewBar.classList.toggle('is-guest-mode', previewing);
    els.organizerViewBar.classList.toggle('is-admin-mode', !previewing);
  }
  if (els.organizerViewLabel) {
    els.organizerViewLabel.textContent = previewing ? 'Showing as Guest' : 'Showing as Admin';
    els.organizerViewLabel.classList.toggle('is-guest', previewing);
    els.organizerViewLabel.classList.toggle('is-admin', !previewing);
  }
  if (els.toggleGuestPreview) {
    els.toggleGuestPreview.textContent = previewing ? 'Back to admin' : 'View as guest';
    els.toggleGuestPreview.hidden = !canPreview;
  }
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

function updateOrganizerUi() {
  const show = hasOrganizerAccess();
  updateGuestPreviewUi();
  if (els.shareLinkBox) els.shareLinkBox.hidden = !show;
  if (els.organizerPanel) els.organizerPanel.hidden = !show;
  if (isGuestPreviewActive()) {
    renderMultiGrid();
  }
  if (show && state.event) {
    if (els.orgLocationInput) els.orgLocationInput.value = state.event.location || '';
    if (els.orgStartDate) els.orgStartDate.value = state.event.start_date;
    if (els.orgEndDate) {
      els.orgEndDate.value = state.event.end_date;
      els.orgEndDate.min = state.event.start_date;
    }
    els.editDeadlineInput.value = state.event.edit_deadline
      ? toLocalInputValue(state.event.edit_deadline, state.event.timezone)
      : '';
    els.visibilitySelect.value = state.event.visibility_mode;
    els.closeToggle.checked = state.event.is_closed;
  }
}

function renderEventHeader() {
  if (!state.event) return;

  els.title.textContent = state.event.title;

  if (els.eventDescription) {
    if (state.event.description) {
      els.eventDescription.textContent = state.event.description;
      els.eventDescription.hidden = false;
    } else {
      els.eventDescription.hidden = true;
    }
  }

  const location = state.event.location?.trim();
  if (els.eventLocation) {
    if (location) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
      els.eventLocation.innerHTML = `<span class="event-location-label">Location</span> <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(location)}</a>`;
      els.eventLocation.hidden = false;
    } else {
      els.eventLocation.hidden = true;
      els.eventLocation.textContent = '';
    }
  }

  els.meta.textContent = `${formatDateRange(state.event.start_date, state.event.end_date, state.event.timezone)} · ${state.event.timezone.replace(/_/g, ' ')}`;
}

function isGoogleParticipant() {
  return Boolean(state.session && state.participant?.user_id);
}

function isGuestParticipant() {
  return Boolean(state.participant && !state.participant.user_id);
}

function setEventSectionsEnabled(enabled) {
  if (els.paintSection) els.paintSection.hidden = !enabled;
  if (els.overlapSection) els.overlapSection.hidden = !enabled;
  if (els.heatmapSection) els.heatmapSection.hidden = !enabled;
  if (!enabled) {
    if (els.multiSection) els.multiSection.hidden = true;
    if (els.blindGate) els.blindGate.hidden = true;
  }
}

function hideAllIdentityPanels() {
  if (els.identityGoogleView) els.identityGoogleView.hidden = true;
  if (els.identityGuestDisplay) els.identityGuestDisplay.hidden = true;
  if (els.identityGuestEdit) els.identityGuestEdit.hidden = true;
}

function showGuestDisplayMode() {
  hideAllIdentityPanels();
  if (els.guestDisplayName) {
    els.guestDisplayName.textContent = state.participant?.display_name || '';
  }
  if (els.identityGuestDisplay) els.identityGuestDisplay.hidden = false;
}

function showGuestEditMode({ setup = false } = {}) {
  hideAllIdentityPanels();
  if (els.guestNameInput) {
    els.guestNameInput.value = setup ? '' : state.participant?.display_name || '';
  }
  if (els.nameCancelBtn) els.nameCancelBtn.hidden = setup;
  if (els.googleJoin) els.googleJoin.hidden = setup;
  if (els.guestSaveName) els.guestSaveName.hidden = false;
  if (els.identityGuestEdit) els.identityGuestEdit.hidden = false;
  els.guestNameInput?.focus();
}

function renderIdentityUi() {
  els.identityBar.hidden = false;

  if (isGoogleParticipant()) {
    state.editingGuestName = false;
    hideAllIdentityPanels();
    if (els.identityGoogleView) els.identityGoogleView.hidden = false;
    if (els.identityDisplayName) {
      els.identityDisplayName.textContent = state.participant.display_name;
    }
    applyAvatarImage(els.identityAvatar, state.participant.avatar_url || state.profile?.avatarUrl);
    setEventSectionsEnabled(true);
    return;
  }

  if (isGuestParticipant()) {
    if (state.editingGuestName) {
      showGuestEditMode({ setup: false });
    } else {
      showGuestDisplayMode();
    }
    setEventSectionsEnabled(true);
    return;
  }

  state.editingGuestName = false;
  showGuestEditMode({ setup: true });
  setEventSectionsEnabled(false);
}

function startGuestNameEdit() {
  if (!isGuestParticipant()) return;
  state.editingGuestName = true;
  renderIdentityUi();
}

function cancelGuestNameEdit() {
  if (!isGuestParticipant()) return;
  state.editingGuestName = false;
  renderIdentityUi();
}

function updateBrushIndicator() {
  if (!els.brushIndicator) return;
  const label = BRUSH_LABELS[state.brush] || state.brush;
  els.brushIndicator.innerHTML = `Selected: <strong>${escapeHtml(label)}</strong>`;
  els.toolbar?.querySelectorAll('[data-brush]').forEach((btn) => {
    const active = btn.dataset.brush === state.brush;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function renderOverlapPagination() {
  const total = state.overlapRanges.length;
  const totalPages = Math.max(1, Math.ceil(total / OVERLAP_PAGE_SIZE));

  if (state.overlapPage >= totalPages) state.overlapPage = totalPages - 1;
  if (state.overlapPage < 0) state.overlapPage = 0;

  const showPagination = total > OVERLAP_PAGE_SIZE;
  if (els.overlapPagination) els.overlapPagination.hidden = !showPagination;

  if (!showPagination) return;

  const page = state.overlapPage + 1;
  if (els.overlapPageInfo) {
    els.overlapPageInfo.textContent = `Page ${page} of ${totalPages} · use ← →`;
  }
  if (els.overlapPrev) els.overlapPrev.disabled = state.overlapPage <= 0;
  if (els.overlapNext) els.overlapNext.disabled = state.overlapPage >= totalPages - 1;
}

function renderOverlap() {
  const disableExport = () => {
    if (els.copyOverlapBtn) els.copyOverlapBtn.disabled = true;
    if (els.downloadIcsBtn) els.downloadIcsBtn.disabled = true;
  };

  if (!state.participant) {
    disableExport();
    state.overlapRanges = [];
    state.overlapPage = 0;
    if (els.overlapPagination) els.overlapPagination.hidden = true;
    els.overlapList.innerHTML = '<p class="muted">Enter your name above to mark your availability.</p>';
    return;
  }
  if (!state.participant.has_submitted_availability) {
    disableExport();
    state.overlapRanges = [];
    state.overlapPage = 0;
    if (els.overlapPagination) els.overlapPagination.hidden = true;
    els.overlapList.innerHTML =
      '<p class="muted">Submit your availability to see the best overlapping times.</p>';
    return;
  }

  state.overlapRanges = computeOverlap(state.event, state.participants, viewerSlots());
  const ranges = state.overlapRanges;
  const canExport = ranges.length > 0;
  if (els.copyOverlapBtn) els.copyOverlapBtn.disabled = !canExport;
  if (els.downloadIcsBtn) els.downloadIcsBtn.disabled = !canExport;
  if (!ranges.length) {
    state.overlapPage = 0;
    if (els.overlapPagination) els.overlapPagination.hidden = true;
    els.overlapList.innerHTML = '<p class="muted">No overlapping availability yet.</p>';
    return;
  }

  renderOverlapPagination();
  const start = state.overlapPage * OVERLAP_PAGE_SIZE;
  const pageRanges = ranges.slice(start, start + OVERLAP_PAGE_SIZE);

  els.overlapList.innerHTML = pageRanges
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

function renderHeatMap() {
  if (!state.participant) {
    if (els.heatmapSection) els.heatmapSection.hidden = true;
    return;
  }

  els.heatmapSection.hidden = false;

  if (!state.participant.has_submitted_availability) {
    els.heatmapGrid.innerHTML =
      '<p class="muted">Submit your availability to see which days work best for the group.</p>';
    if (els.heatmapLegend) els.heatmapLegend.hidden = true;
    return;
  }

  const { byDate, max, submittedCount } = computeDayAvailabilityCounts(
    state.participants,
    viewerSlots(),
    state.event
  );

  if (!submittedCount || max === 0) {
    els.heatmapGrid.innerHTML = '<p class="muted">No group availability yet.</p>';
    if (els.heatmapLegend) els.heatmapLegend.hidden = true;
    return;
  }

  buildGroupHeatCalendar(els.heatmapGrid, state.event, byDate, max);

  if (els.heatmapLegend) {
    els.heatmapLegend.hidden = false;
  }
  if (els.heatmapLegendDetail) {
    const maxLabel = max === 1 ? '1 person' : `${max} people`;
    els.heatmapLegendDetail.textContent = `· up to ${maxLabel} on a day · ${submittedCount} responded`;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function canOrganizerRemoveGuest(participant) {
  return hasOrganizerAccess() && !participant.user_id && !participant.is_organizer;
}

async function handleRemoveGuest(participant) {
  if (!canOrganizerRemoveGuest(participant)) return;

  const name = participant.display_name || 'this guest';
  const confirmed = await confirmAction({
    title: 'Remove guest?',
    message: `${name} and all of their availability will be permanently removed. They can rejoin the event with a new name if needed.`,
    highlight: name,
    confirmLabel: 'Remove guest',
    cancelLabel: 'Keep guest',
  });
  if (!confirmed) return;

  try {
    await deleteParticipant(participant.id);
    await reloadData();
    renderMultiGrid();
    renderOverlap();
    renderHeatMap();
    showToast(`${name} removed`);
  } catch (err) {
    console.error(err);
    showToast(formatDbError(err), 'error');
  }
}

function otherParticipants() {
  if (!state.participant) return state.participants;
  return state.participants.filter((p) => p.id !== state.participant.id);
}

function updateMultiSectionSummary() {
  if (!els.multiSectionSummary) return;
  const others = otherParticipants();
  if (!others.length) {
    els.multiSectionSummary.textContent = "You're the only participant so far";
    return;
  }
  const responded = others.filter((p) => p.has_submitted_availability).length;
  const countLabel = others.length === 1 ? '1 other person' : `${others.length} other people`;
  if (responded === 0) {
    els.multiSectionSummary.textContent = `${countLabel} · none have submitted yet`;
  } else if (responded === others.length) {
    els.multiSectionSummary.textContent = `${countLabel} · all submitted`;
  } else {
    els.multiSectionSummary.textContent = `${countLabel} · ${responded} submitted`;
  }
}

function setMultiSectionExpanded(expanded) {
  state.multiSectionExpanded = expanded;
  if (els.multiSectionPanel) {
    els.multiSectionPanel.classList.toggle('is-collapsed', !expanded);
    els.multiSectionPanel.classList.toggle('is-expanded', expanded);
  }
  if (els.multiSectionBody) els.multiSectionBody.hidden = !expanded;
  if (els.multiSectionToggle) {
    els.multiSectionToggle.textContent = expanded ? 'Hide' : 'Show';
    els.multiSectionToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
}

function renderMultiSectionCalendars() {
  const others = otherParticipants();
  if (!others.length) {
    els.multiGrid.innerHTML = '<p class="muted">You\'re the only participant so far.</p>';
    return;
  }
  const maps = slotsToParticipantMaps(viewerSlots(), state.event);
  buildMultiDayCalendar(els.multiGrid, state.event, others, maps, {
    canRemoveGuest: canOrganizerRemoveGuest,
    onRemoveGuest: handleRemoveGuest,
  });
}

function toggleMultiSection() {
  const next = !state.multiSectionExpanded;
  setMultiSectionExpanded(next);
  if (next) renderMultiSectionCalendars();
}

function renderMultiGrid() {
  if (!state.participant) {
    els.multiSection.hidden = true;
    els.blindGate.hidden = true;
    return;
  }

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
  updateMultiSectionSummary();
  if (state.multiSectionExpanded) {
    renderMultiSectionCalendars();
  } else {
    setMultiSectionExpanded(false);
    if (els.multiGrid) els.multiGrid.innerHTML = '';
  }
}

async function refreshEveryoneAvailability() {
  if (!state.event || els.refreshAvailability?.disabled) return;

  const btn = els.refreshAvailability;
  const prevLabel = btn?.textContent || 'Refresh';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Refreshing…';
  }

  try {
    await reloadData();
    renderMultiGrid();
    renderOverlap();
    renderHeatMap();
    showToast('Availability updated');
  } catch (err) {
    console.error(err);
    showToast(formatDbError(err), 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevLabel;
    }
  }
}

function syncOrgEndDateMin() {
  if (!els.orgStartDate || !els.orgEndDate) return;
  els.orgEndDate.min = els.orgStartDate.value;
  if (els.orgEndDate.value && els.orgEndDate.value < els.orgStartDate.value) {
    els.orgEndDate.value = els.orgStartDate.value;
  }
}

function formatTimeSummary(startHour, endHour) {
  return `${hourToTimeInput(startHour)} – ${hourToTimeInput(endHour)} · applies to every day you select`;
}

function updateTimeRangeSummary() {
  if (!els.timeRangeSummary) return;
  els.timeRangeSummary.textContent = formatTimeSummary(state.appliedTimeStart, state.appliedTimeEnd);
}

function setTimeRangeEditing(editing) {
  state.timeRangeEditing = editing;
  if (els.timeRangePanel) {
    els.timeRangePanel.classList.toggle('is-collapsed', !editing);
    els.timeRangePanel.classList.toggle('is-editing', editing);
  }
  if (els.timeRangeBody) els.timeRangeBody.hidden = !editing;
  if (els.timeRangeEdit) els.timeRangeEdit.hidden = editing;
  if (els.timeRangeSave) els.timeRangeSave.hidden = !editing;
  if (els.timeRangeCancel) els.timeRangeCancel.hidden = !editing;
}

function startTimeRangeEdit() {
  if (!state.participant || !eventAllowsEdits(state.event)) return;
  setTimeRangeEditing(true);
  setTimeInputs(state.appliedTimeStart, state.appliedTimeEnd, false);
  els.timeStart?.focus();
}

function cancelTimeRangeEdit() {
  setTimeInputs(state.appliedTimeStart, state.appliedTimeEnd, true);
  setTimeRangeEditing(false);
}

function applyTimeRangeEdit() {
  const startHour = parseTimeInput(els.timeStart?.value);
  const endHour = parseTimeInput(els.timeEnd?.value);
  if (endHour <= startHour) {
    showToast('End time must be after start time', 'error');
    return;
  }

  state.appliedTimeStart = startHour;
  state.appliedTimeEnd = endHour;
  setTimeInputs(startHour, endHour, true);
  updateTimeRangeSummary();
  setTimeRangeEditing(false);
  markLocalChange();
}

function setTimeInputs(startHour, endHour, readOnly) {
  if (!els.timeStart || !els.timeEnd) return;
  els.timeStart.value = hourToTimeInput(startHour);
  els.timeEnd.value = hourToTimeInput(endHour);
  const locked = readOnly || !state.timeRangeEditing;
  els.timeStart.disabled = locked;
  els.timeEnd.disabled = locked;
}

function buildSlotMapFromUi() {
  const dayMap = state.paintController?.getDays() || new Map();
  const startHour = parseTimeInput(els.timeStart?.value);
  const endHour = parseTimeInput(els.timeEnd?.value);
  return expandDaysToSlotMap(dayMap, startHour, endHour);
}

function serializeSlotMap(slotMap) {
  return JSON.stringify([...slotMap.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function captureSavedSnapshot() {
  lastSavedSnapshot = serializeSlotMap(buildSlotMapFromUi());
  state.hasUnsavedChanges = false;
  updateSaveButton();
}

function markLocalChange() {
  const dirty = serializeSlotMap(buildSlotMapFromUi()) !== lastSavedSnapshot;
  state.hasUnsavedChanges = dirty;
  updateSaveButton();
}

function updateSaveButton() {
  if (!els.saveAvailability) return;
  const canEdit = Boolean(state.participant && eventAllowsEdits(state.event));
  els.saveAvailability.hidden = !canEdit;
  els.saveAvailability.disabled = !state.hasUnsavedChanges || state.isSaving;
  els.saveAvailability.classList.toggle('save-flash', state.hasUnsavedChanges && !state.isSaving);
  els.saveAvailability.textContent = state.isSaving ? 'Saving…' : 'Save';
}

function renderPaintGrid() {
  const readOnly = !state.participant || !eventAllowsEdits(state.event);

  if (!state.participant) {
    state.appliedTimeStart = 10;
    state.appliedTimeEnd = 22;
    setTimeInputs(10, 22, true);
    updateTimeRangeSummary();
    setTimeRangeEditing(false);
    if (els.timeRangePanel) els.timeRangePanel.hidden = true;
    if (els.timeRangeEdit) els.timeRangeEdit.hidden = true;
    if (state.paintController) state.paintController.destroy();
    state.paintController = buildDayCalendar(els.paintGrid, state.event, new Map(), {
      brush: state.brush,
      readOnly: true,
      separateMonths: true,
      onChange: () => {},
    });
    updateSaveButton();
    return;
  }

  const maps = slotsToParticipantMaps(state.slots, state.event);
  const myMap = maps.get(state.participant.id) || new Map();
  const { days, startHour, endHour } = slotsToDaySelection(myMap);

  state.appliedTimeStart = startHour;
  state.appliedTimeEnd = endHour;
  setTimeInputs(startHour, endHour, readOnly);
  updateTimeRangeSummary();
  setTimeRangeEditing(false);
  if (els.timeRangePanel) els.timeRangePanel.hidden = false;
  if (els.timeRangeEdit) els.timeRangeEdit.hidden = readOnly;

  if (state.paintController) state.paintController.destroy();
  state.paintController = buildDayCalendar(els.paintGrid, state.event, days, {
    brush: state.brush,
    readOnly,
    separateMonths: true,
    onChange: readOnly ? () => {} : markLocalChange,
  });
  if (!readOnly) captureSavedSnapshot();
  else updateSaveButton();
}

async function saveAvailability() {
  if (!state.participant || !eventAllowsEdits(state.event)) return;
  if (!state.hasUnsavedChanges || state.isSaving) return;

  const startHour = parseTimeInput(els.timeStart?.value);
  const endHour = parseTimeInput(els.timeEnd?.value);
  if (endHour <= startHour) {
    showToast('End time must be after start time', 'error');
    return;
  }

  state.appliedTimeStart = startHour;
  state.appliedTimeEnd = endHour;
  updateTimeRangeSummary();

  const slotMap = buildSlotMapFromUi();
  state.isSaving = true;
  updateSaveButton();

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
    captureSavedSnapshot();
    renderOverlap();
    renderHeatMap();
    renderMultiGrid();
    showToast('Saved');
  } catch (err) {
    console.error(err);
    showToast(formatDbError(err), 'error');
  } finally {
    state.isSaving = false;
    updateSaveButton();
  }
}

async function reloadSlots() {
  state.slots = await fetchSlots(state.event.id, client());
}

async function reloadData() {
  state.participants = await fetchParticipants(state.event.id, client());
  state.slots = await fetchSlots(state.event.id, client());
  els.participantCount.textContent = `${state.participants.length} participant${state.participants.length === 1 ? '' : 's'}`;
}

function showGuestSetupUi() {
  renderIdentityUi();
  renderPaintGrid();
  renderMultiGrid();
  renderOverlap();
  renderHeatMap();
}

function showJoinedUi() {
  state.editingGuestName = false;
  renderIdentityUi();
  updateOrganizerUi();
  updateBrushIndicator();
  renderPaintGrid();
  renderMultiGrid();
  renderOverlap();
  renderHeatMap();
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
  if (recoverOAuthRedirectFromSiteRoot()) return;

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

    renderEventHeader();
    renderStatus();
    startCountdownTimer();

    await reloadData();

    els.loading.hidden = true;
    els.app.hidden = false;

    if (state.session) {
      await ensureParticipant();
      showJoinedUi();
    } else if (state.guestToken) {
      await ensureParticipant();
      showJoinedUi();
    } else {
      showGuestSetupUi();
    }

    updateOrganizerUi();

    subscribeToEvent(state.event.id, client(), {
      onSlots: async () => {
        await reloadSlots();
        if (!state.hasUnsavedChanges) renderPaintGrid();
        renderMultiGrid();
        renderOverlap();
        renderHeatMap();
      },
      onParticipants: async () => {
        await reloadData();
        renderMultiGrid();
        renderOverlap();
        renderHeatMap();
      },
      onEvent: (ev) => {
        state.event = ev;
        renderEventHeader();
        renderStatus();
        startCountdownTimer();
        if (!state.hasUnsavedChanges || !eventAllowsEdits(ev)) {
          if (!eventAllowsEdits(ev)) state.hasUnsavedChanges = false;
          renderPaintGrid();
        } else {
          updateSaveButton();
        }
        renderMultiGrid();
        renderOverlap();
        renderHeatMap();
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
      updateBrushIndicator();
      state.paintController?.setBrush(state.brush);
    });
  });
  updateBrushIndicator();

  els.timeRangeEdit?.addEventListener('click', startTimeRangeEdit);
  els.timeRangeSave?.addEventListener('click', applyTimeRangeEdit);
  els.timeRangeCancel?.addEventListener('click', cancelTimeRangeEdit);

  els.saveAvailability?.addEventListener('click', () => {
    saveAvailability();
  });
}

function setupOverlapPagination() {
  els.overlapPrev?.addEventListener('click', () => {
    if (state.overlapPage <= 0) return;
    state.overlapPage -= 1;
    renderOverlap();
  });

  els.overlapNext?.addEventListener('click', () => {
    const totalPages = Math.ceil(state.overlapRanges.length / OVERLAP_PAGE_SIZE);
    if (state.overlapPage >= totalPages - 1) return;
    state.overlapPage += 1;
    renderOverlap();
  });

  els.overlapPagination?.addEventListener('keydown', (e) => {
    if (els.overlapPagination?.hidden) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      els.overlapPrev?.click();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      els.overlapNext?.click();
    }
  });
}

async function saveGuestName() {
  const name = els.guestNameInput?.value.trim();
  if (!name) {
    showToast('Enter your name to continue', 'error');
    els.guestNameInput?.focus();
    return;
  }

  if (!state.participant) {
    const token = createGuestToken();
    setGuestToken(state.event.id, token);
    localStorage.setItem(`wth_guest_name_${state.event.id}`, name);
    state.guestToken = token;
    await ensureParticipant();
    await reloadData();
    showJoinedUi();
    showToast('Name saved');
    return;
  }

  if (!isGuestParticipant()) return;

  const db = client();
  const { data, error } = await db
    .from('event_participants')
    .update({ display_name: name })
    .eq('id', state.participant.id)
    .select()
    .single();
    if (error) {
      showToast(formatDbError(error), 'error');
      return;
    }
  state.participant = data;
  localStorage.setItem(`wth_guest_name_${state.event.id}`, name);
  state.editingGuestName = false;
  showJoinedUi();
  await reloadData();
  renderMultiGrid();
  showToast('Name updated');
}

function setupJoin() {
  els.googleJoin?.addEventListener('click', async () => {
    await signInWithGoogle(`${APP_BASE}/event?slug=${encodeURIComponent(slug)}`);
  });

  els.guestSaveName?.addEventListener('click', () => {
    saveGuestName();
  });

  els.guestNameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveGuestName();
    } else if (e.key === 'Escape' && state.editingGuestName) {
      e.preventDefault();
      cancelGuestNameEdit();
    }
  });

  els.editNameBtn?.addEventListener('click', () => {
    startGuestNameEdit();
  });

  els.nameCancelBtn?.addEventListener('click', () => {
    cancelGuestNameEdit();
  });

  els.refreshAvailability?.addEventListener('click', () => {
    refreshEveryoneAvailability();
  });

  els.toggleGuestPreview?.addEventListener('click', () => {
    if (!isOrganizer()) return;
    if (isGuestPreviewActive()) {
      exitGuestPreview(slug, state.event?.id || null);
    } else {
      navigateToGuestPreview(slug, state.event?.id || null);
    }
  });

  els.multiSectionToggle?.addEventListener('click', toggleMultiSection);

  els.orgStartDate?.addEventListener('change', syncOrgEndDateMin);

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

  els.saveOrgBtn?.addEventListener('click', async () => {
    if (!hasOrganizerAccess()) return;
    try {
      const startDate = els.orgStartDate?.value;
      const endDate = els.orgEndDate?.value;
      if (!startDate || !endDate) {
        showToast('Enter a start and end date', 'error');
        return;
      }
      if (endDate < startDate) {
        showToast('End date must be on or after start date', 'error');
        return;
      }

      const patch = {
        location: els.orgLocationInput?.value.trim() || null,
        start_date: startDate,
        end_date: endDate,
        visibility_mode: els.visibilitySelect.value,
        is_closed: els.closeToggle.checked,
        edit_deadline: els.editDeadlineInput.value
          ? new Date(els.editDeadlineInput.value).toISOString()
          : null,
      };

      if (endDate > state.event.end_date) {
        const newExpires = computeDefaultExpiresAt(endDate, state.event.timezone);
        if (new Date(state.event.expires_at) < new Date(newExpires)) {
          patch.expires_at = newExpires;
        }
      }

      state.event = await updateEvent(state.event.id, patch);
      renderEventHeader();
      renderStatus();
      renderPaintGrid();
      renderMultiGrid();
      renderOverlap();
      renderHeatMap();
      showToast('Event settings saved');
    } catch (err) {
      showToast(formatDbError(err), 'error');
    }
  });

  els.deleteBtn?.addEventListener('click', async () => {
    if (!hasOrganizerAccess()) return;
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
      showToast(formatDbError(err), 'error');
    }
  });
}

setupToolbar();
setupOverlapPagination();
setupJoin();
bootEvent();

onAuthStateChange(async (session) => {
  if (!state.event) return;
  state.session = session;
  state.profile = session ? profileFromSession(session) : null;
  if (session && !state.participant?.user_id) {
    await ensureParticipant();
    await reloadData();
    showJoinedUi();
  } else if (session) {
    updateOrganizerUi();
  } else if (!session && !state.participant && state.event) {
    showGuestSetupUi();
  }
});
