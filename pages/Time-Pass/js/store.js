import { createGuestDemoEvents } from './demo-events.js';
import {
  buildFilteredSortedList,
  buildFilteredSortedSections,
  listNeedsSecondTick,
  normalizeSort,
} from './filters.js';
import { applyTheme, normalizeTheme, readStoredTheme } from './theme.js';

const listeners = new Set();

export function defaultSettings() {
  return {
    schemaVersion: 1,
    hasSeededDemo: false,
    fullColourCards: false,
    /** 'expanded' = unit pills; 'compact' = cue-only smaller cards */
    cardDensity: 'expanded',
    /** 'atmosphere' | 'oled' | 'light' */
    theme: 'atmosphere',
    filters: { direction: 'all', recurring: 'all', query: '', sort: 'smart' },
  };
}

export const state = {
  user: null,
  mode: 'guest',
  view: 'list',
  events: createGuestDemoEvents(),
  settings: {
    ...defaultSettings(),
    theme: readStoredTheme(),
  },
  ready: true,
  authError: null,
  firebaseReady: false,
  seeding: false,
  syncReady: true,
  syncing: false,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  for (const fn of listeners) fn(state);
}

export function setUser(user) {
  state.user = user;
  state.mode = user ? 'signed-in' : 'guest';
  if (!user) {
    state.events = createGuestDemoEvents();
    state.settings = {
      ...defaultSettings(),
      theme: readStoredTheme(),
    };
    state.view = 'list';
    state.syncReady = true;
    state.syncing = false;
    applyTheme(state.settings.theme);
  } else {
    state.syncReady = false;
    state.syncing = true;
  }
  notify();
}

export function setView(view) {
  if (view === 'settings' || view === 'calculator') state.view = view;
  else state.view = 'list';
  notify();
}

export function setFirebaseReady(ready) {
  state.firebaseReady = ready;
  notify();
}

export function setEvents(events) {
  state.events = Array.isArray(events) ? events : [];
  notify();
}

export function setSettings(settings) {
  const base = defaultSettings();
  state.settings = {
    ...base,
    ...settings,
    filters: {
      ...base.filters,
      ...(settings?.filters || {}),
      sort: normalizeSort(settings?.filters?.sort ?? base.filters.sort),
    },
    fullColourCards: Boolean(settings?.fullColourCards),
    cardDensity: settings?.cardDensity === 'compact' ? 'compact' : 'expanded',
    theme: normalizeTheme(settings?.theme ?? readStoredTheme()),
  };
  applyTheme(state.settings.theme);
  notify();
}

export function setFilters(partial) {
  const next = { ...state.settings.filters, ...partial };
  if (partial.sort !== undefined) next.sort = normalizeSort(partial.sort);
  state.settings = {
    ...state.settings,
    filters: next,
  };
  notify();
}

export function patchSettings(partial) {
  const next = { ...state.settings, ...partial };
  if (partial.theme !== undefined) next.theme = normalizeTheme(partial.theme);
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
    Boolean((f.query || '').trim())
  );
}
