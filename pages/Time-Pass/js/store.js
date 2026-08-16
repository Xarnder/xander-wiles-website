import { createGuestDemoEvents } from './demo-events.js';
import {
  buildFilteredSortedList,
  buildFilteredSortedSections,
  filterViewModels,
  isHiddenFromTimeline,
  listNeedsSecondTick,
  normalizeSort,
  toViewModel,
} from './filters.js';
import { applyTheme, normalizeTheme, readStoredTheme } from './theme.js';
import {
  DEFAULT_CATEGORY,
  DEFAULT_QUICK_CATEGORY_SLOTS,
  mergeCategoriesFromEvents,
  normalizeCategories,
  normalizeCategoryName,
  normalizeQuickCategorySlots,
  storedQuickCategories,
} from './categories.js';
import {
  COMPACT_CUE_UNITS_DEFAULT,
  COMPACT_CUE_FORMAT_DEFAULT,
  EVENTS_VIEW_LIST,
  EVENTS_VIEW_STORAGE_KEY,
  normalizeCompactCueUnits,
  normalizeCompactCueFormat,
  normalizeEventsView,
} from './constants.js';

const listeners = new Set();
let lastContentView = EVENTS_VIEW_LIST;

export function readGuestEventsView() {
  try {
    return normalizeEventsView(sessionStorage.getItem(EVENTS_VIEW_STORAGE_KEY));
  } catch {
    return EVENTS_VIEW_LIST;
  }
}

export function writeGuestEventsView(view) {
  try {
    sessionStorage.setItem(EVENTS_VIEW_STORAGE_KEY, normalizeEventsView(view));
  } catch {
    /* ignore quota / private mode */
  }
}

export function isContentView(view = state.view) {
  return view === 'list' || view === 'timeline';
}

export function getLastContentView() {
  return lastContentView === 'timeline' ? 'timeline' : 'list';
}

export function defaultSettings() {
  return {
    schemaVersion: 1,
    hasSeededDemo: false,
    fullColourCards: false,
    /** 'expanded' = unit pills; 'compact' = cue-only smaller cards */
    cardDensity: 'expanded',
    /** How many leading units compact relative cues show (1–5, default 2). */
    compactCueUnits: COMPACT_CUE_UNITS_DEFAULT,
    /** Compact relative cue writing: 'words' | 'comma' | 'short' | 'short-space' */
    compactCueFormat: COMPACT_CUE_FORMAT_DEFAULT,
    /** 'atmosphere' | 'oled' | 'light' */
    theme: 'atmosphere',
    categories: [DEFAULT_CATEGORY],
    /** 2, 4, 6, or 8 permanent one-click filter slots in the header/footer. */
    quickCategorySlots: DEFAULT_QUICK_CATEGORY_SLOTS,
    /** Explicit picks when there are more categories than slots; null = auto. */
    quickCategories: null,
    /** 'list' | 'timeline' */
    eventsView: EVENTS_VIEW_LIST,
    filters: {
      direction: 'all',
      recurring: 'all',
      query: '',
      sort: 'smart',
      category: 'all',
    },
  };
}

const guestEvents = createGuestDemoEvents();

export const state = {
  user: null,
  mode: 'guest',
  view: readGuestEventsView(),
  events: guestEvents,
  settings: {
    ...defaultSettings(),
    theme: readStoredTheme(),
    categories: mergeCategoriesFromEvents([DEFAULT_CATEGORY], guestEvents),
  },
  ready: true,
  authError: null,
  firebaseReady: false,
  seeding: false,
  syncReady: true,
  syncing: false,
};

lastContentView = isContentView(state.view) ? state.view : EVENTS_VIEW_LIST;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  for (const fn of listeners) fn(state);
}

export function setUser(user) {
  const prevUid = state.user?.uid || null;
  const nextUid = user?.uid || null;
  state.user = user;
  state.mode = user ? 'signed-in' : 'guest';
  if (!user) {
    state.events = createGuestDemoEvents();
    state.settings = {
      ...defaultSettings(),
      theme: readStoredTheme(),
      categories: mergeCategoriesFromEvents([DEFAULT_CATEGORY], state.events),
    };
    state.view = readGuestEventsView();
    lastContentView = isContentView(state.view) ? state.view : EVENTS_VIEW_LIST;
    state.syncReady = true;
    state.syncing = false;
    applyTheme(state.settings.theme);
  } else if (prevUid !== nextUid) {
    // Only reset sync flags when the signed-in account actually changes
    state.syncReady = false;
    state.syncing = true;
  }
  notify();
}

export function setView(view) {
  if (view === 'settings' || view === 'calculator') {
    if (isContentView(state.view)) lastContentView = state.view;
    state.view = view;
  } else {
    state.view = normalizeEventsView(view);
    lastContentView = state.view;
  }
  notify();
}

export function setFirebaseReady(ready) {
  state.firebaseReady = ready;
  notify();
}

export function setEvents(events) {
  const next = Array.isArray(events) ? events : [];
  // Skip identical snapshots (Firestore can re-emit) — avoids pointless UI work while scrolling.
  if (eventsFingerprint(state.events) === eventsFingerprint(next)) {
    state.events = next;
    return;
  }
  state.events = next;
  state.settings = {
    ...state.settings,
    categories: mergeCategoriesFromEvents(state.settings.categories, state.events),
  };
  notify();
}

function eventsFingerprint(events) {
  if (!Array.isArray(events) || !events.length) return String(events?.length || 0);
  let out = String(events.length);
  for (const e of events) {
    out += `|${e?.id || ''}:${e?.updatedAt || e?.updated || e?.name || ''}:${e?.date || ''}:${e?.time || ''}:${e?.pinned ? '1' : '0'}`;
  }
  return out;
}

export function setSettings(settings) {
  const base = defaultSettings();
  const categories = mergeCategoriesFromEvents(
    settings?.categories ?? base.categories,
    state.events
  );
  const filtersIn = {
    ...base.filters,
    ...(settings?.filters || {}),
    sort: normalizeSort(settings?.filters?.sort ?? base.filters.sort),
  };
  if (filtersIn.category && filtersIn.category !== 'all') {
    const stillExists = categories.some(
      (c) => c.toLowerCase() === String(filtersIn.category).toLowerCase()
    );
    if (!stillExists) filtersIn.category = 'all';
  } else {
    filtersIn.category = 'all';
  }

  state.settings = {
    ...base,
    ...settings,
    filters: filtersIn,
    categories,
    fullColourCards: Boolean(settings?.fullColourCards),
    cardDensity: settings?.cardDensity === 'compact' ? 'compact' : 'expanded',
    compactCueUnits: normalizeCompactCueUnits(
      settings?.compactCueUnits ?? base.compactCueUnits
    ),
    compactCueFormat: normalizeCompactCueFormat(
      settings?.compactCueFormat ?? base.compactCueFormat
    ),
    theme: normalizeTheme(settings?.theme ?? readStoredTheme()),
    quickCategorySlots: normalizeQuickCategorySlots(
      settings?.quickCategorySlots ?? base.quickCategorySlots
    ),
    quickCategories: storedQuickCategories(
      categories,
      settings?.quickCategorySlots ?? base.quickCategorySlots,
      Object.prototype.hasOwnProperty.call(settings || {}, 'quickCategories')
        ? settings.quickCategories
        : base.quickCategories
    ),
    eventsView: normalizeEventsView(settings?.eventsView ?? base.eventsView),
  };
  applyTheme(state.settings.theme);
  if (isContentView(state.view)) {
    state.view = state.settings.eventsView;
    lastContentView = state.view;
  }
  notify();
}

export function setFilters(partial, { silent = false } = {}) {
  const next = { ...state.settings.filters, ...partial };
  if (partial.sort !== undefined) next.sort = normalizeSort(partial.sort);
  if (partial.category !== undefined) {
    next.category =
      partial.category === 'all' ? 'all' : normalizeCategoryName(partial.category);
  }
  state.settings = {
    ...state.settings,
    filters: next,
  };
  if (!silent) notify();
}

export function patchSettings(partial) {
  const next = { ...state.settings, ...partial };
  if (partial.theme !== undefined) next.theme = normalizeTheme(partial.theme);
  if (partial.categories !== undefined) {
    next.categories = normalizeCategories(partial.categories);
  }
  if (partial.compactCueUnits !== undefined) {
    next.compactCueUnits = normalizeCompactCueUnits(partial.compactCueUnits);
  }
  if (partial.compactCueFormat !== undefined) {
    next.compactCueFormat = normalizeCompactCueFormat(partial.compactCueFormat);
  }
  if (partial.quickCategorySlots !== undefined) {
    next.quickCategorySlots = normalizeQuickCategorySlots(partial.quickCategorySlots);
  }
  if (partial.quickCategories !== undefined || partial.categories !== undefined) {
    next.quickCategories = storedQuickCategories(
      next.categories,
      next.quickCategorySlots,
      partial.quickCategories !== undefined ? partial.quickCategories : next.quickCategories
    );
  }
  if (partial.eventsView !== undefined) {
    next.eventsView = normalizeEventsView(partial.eventsView);
  }
  state.settings = next;
  if (partial.theme !== undefined) applyTheme(state.settings.theme);
  notify();
}

export function setAuthError(msg) {
  state.authError = msg;
  notify();
}

export function setSeeding(v) {
  state.seeding = v;
  notify();
}

export function setSyncStatus({ syncReady, syncing } = {}) {
  if (syncReady !== undefined) state.syncReady = syncReady;
  if (syncing !== undefined) state.syncing = syncing;
  notify();
}

export function getViewList(nowMs = Date.now()) {
  return buildFilteredSortedList(state.events, state.settings.filters, nowMs);
}

export function getViewSections(nowMs = Date.now()) {
  return buildFilteredSortedSections(state.events, state.settings.filters, nowMs);
}

export function needsSecondTick(nowMs = Date.now()) {
  return listNeedsSecondTick(getViewList(nowMs));
}

export function filtersAreActive() {
  const f = state.settings.filters;
  return (
    f.direction !== 'all' ||
    f.recurring !== 'all' ||
    normalizeSort(f.sort) !== 'smart' ||
    (f.category && f.category !== 'all') ||
    Boolean((f.query || '').trim())
  );
}

export function getTimelineViewModels(nowMs = Date.now()) {
  const vms = state.events.map((e) => toViewModel(e, nowMs));
  return filterViewModels(vms, state.settings.filters).filter((vm) => !isHiddenFromTimeline(vm.event));
}

export function getCategories() {
  return normalizeCategories(state.settings.categories);
}
