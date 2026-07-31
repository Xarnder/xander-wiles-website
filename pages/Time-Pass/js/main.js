import { initAuth, signInWithGoogle, signOutUser } from './auth.js';
import {
  createEvent,
  updateEvent,
  deleteEvent,
  subscribeEvents,
  subscribeSettings,
  saveSettings,
  seedEventsIfNeeded,
  exportPayload,
  importEvents,
} from './api.js';
import {
  state,
  subscribe,
  setEvents,
  setSettings,
  setFilters,
  setSeeding,
  setSyncStatus,
  setView,
  needsSecondTick,
} from './store.js';
import { renderAll, patchListDigits, setUIHandlers, focusSearch, openEventModal } from './ui.js';
import { toast } from './format.js';
import { isFirebaseConfigured } from '../firebase-config.js';
import { COLOR_PALETTE, DEFAULT_UNITS, SOFT_EVENT_CAP } from './constants.js';
import { applyTheme, readStoredTheme } from './theme.js';

let unsubEvents = null;
let unsubSettings = null;
let tickTimer = null;
let seedAttempted = false;
let filterPersistTimer = null;
let lastA11yMinute = -1;

function clearListeners() {
  if (unsubEvents) {
    unsubEvents();
    unsubEvents = null;
  }
  if (unsubSettings) {
    unsubSettings();
    unsubSettings = null;
  }
  seedAttempted = false;
}

function scheduleTick() {
  if (tickTimer) clearTimeout(tickTimer);
  const delay = needsSecondTick() ? 1000 : 15000;
  tickTimer = setTimeout(() => {
    const now = Date.now();
    patchListDigits(now);
    updateA11ySummary(now);
    scheduleTick();
  }, delay);
}

function updateA11ySummary(nowMs) {
  const live = document.getElementById('a11y-live');
  if (!live || state.view !== 'list') return;
  const minute = Math.floor(nowMs / 60000);
  if (minute === lastA11yMinute) return;
  lastA11yMinute = minute;
  const n = state.events.length;
  live.textContent = n
    ? `Time Pass showing ${n} event${n === 1 ? '' : 's'}.`
    : 'Time Pass has no events.';
}

async function maybeSeed(uid, events, settings) {
  if (!uid || seedAttempted || state.seeding) return;
  if (!isFirebaseConfigured) return;
  seedAttempted = true;
  try {
    setSeeding(true);
    await seedEventsIfNeeded(uid, events, settings);
  } catch (err) {
    console.warn('Seed failed', err);
    seedAttempted = false;
    toast(`Could not seed demo events: ${err.message}`, 'error');
  } finally {
    setSeeding(false);
  }
}

function persistSettingsSoon(extra = {}) {
  if (!(state.user && isFirebaseConfigured)) return;
  clearTimeout(filterPersistTimer);
  filterPersistTimer = setTimeout(async () => {
    try {
      await saveSettings(state.user.uid, {
        filters: state.settings.filters,
        hasSeededDemo: state.settings.hasSeededDemo,
        fullColourCards: state.settings.fullColourCards,
        cardDensity: state.settings.cardDensity === 'compact' ? 'compact' : 'expanded',
        theme: state.settings.theme,
        ...extra,
      });
    } catch (err) {
      console.warn('Settings persist failed', err);
    }
  }, 400);
}

function attachFirestore(uid) {
  clearListeners();
  setSyncStatus({ syncReady: false, syncing: true });

  let eventsReady = false;
  let settingsReady = false;
  let latestEvents = [];
  let latestSettings = state.settings;

  const markReady = () => {
    if (eventsReady && settingsReady) {
      setSyncStatus({ syncReady: true, syncing: false });
      maybeSeed(uid, latestEvents, latestSettings);
    }
  };

  unsubEvents = subscribeEvents(
    uid,
    (events) => {
      latestEvents = events;
      setEvents(events);
      eventsReady = true;
      markReady();
    },
    (err) => {
      console.error(err);
      setSyncStatus({ syncing: false, syncReady: true });
      toast(`Events sync error: ${err.message}`, 'error');
    }
  );

  unsubSettings = subscribeSettings(
    uid,
    (settings) => {
      latestSettings = settings;
      setSettings(settings);
      settingsReady = true;
      markReady();
    },
    (err) => {
      console.error(err);
      toast(`Settings sync error: ${err.message}`, 'error');
    }
  );
}

setUIHandlers({
  onSignIn: () => signInWithGoogle(),
  onSignOut: async () => {
    clearListeners();
    await signOutUser();
    toast('Signed out', 'success');
  },
  onFilters: (partial) => {
    setFilters(partial);
    // Debounce Firestore writes especially for search typing
    const delay = partial.query !== undefined ? 450 : 0;
    clearTimeout(filterPersistTimer);
    filterPersistTimer = setTimeout(() => persistSettingsSoon(), delay);
  },
  onSaveSettings: async (partial) => {
    if (state.user && isFirebaseConfigured) {
      await saveSettings(state.user.uid, {
        hasSeededDemo: state.settings.hasSeededDemo,
        filters: state.settings.filters,
        fullColourCards:
          partial.fullColourCards !== undefined
            ? partial.fullColourCards
            : state.settings.fullColourCards,
        cardDensity:
          partial.cardDensity !== undefined
            ? partial.cardDensity === 'compact'
              ? 'compact'
              : 'expanded'
            : state.settings.cardDensity === 'compact'
              ? 'compact'
              : 'expanded',
        theme:
          partial.theme !== undefined
            ? partial.theme
            : state.settings.theme,
        ...partial,
      });
    }
    renderAll(Date.now());
  },
  onAdd: async (payload) => {
    try {
      await createEvent(state.user.uid, payload, state.events.length);
      if (state.events.length + 1 === SOFT_EVENT_CAP) {
        toast(`Soft limit of ${SOFT_EVENT_CAP} events reached.`, 'info');
      }
      toast('Event created', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  },
  onEdit: async (id, payload) => {
    try {
      await updateEvent(state.user.uid, id, payload);
      toast('Event saved', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  },
  onDelete: async (id) => {
    try {
      await deleteEvent(state.user.uid, id);
      toast('Event deleted', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  },
  onDuplicate: async (event) => {
    if (!state.user) {
      toast('Sign in to duplicate events.', 'info');
      return;
    }
    try {
      const payload = {
        name: `${event.name} (copy)`.slice(0, 80),
        date: event.date,
        time: event.time ?? null,
        timeZone: event.timeZone ?? null,
        color: COLOR_PALETTE.includes(event.color) ? event.color : COLOR_PALETTE[0],
        units: event.units?.length ? [...event.units] : [...DEFAULT_UNITS],
        recurrence: { frequency: event.recurrence?.frequency || 'none' },
        showSinceLast: event.showSinceLast !== false,
      };
      await createEvent(state.user.uid, payload, state.events.length);
      toast('Event duplicated', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  },
  onExport: () => {
    const data = exportPayload(state.events, state.settings);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `time-pass-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Export downloaded', 'success');
  },
  onImport: async (events) => {
    const replace = window.confirm(
      'Replace all existing events with the import?\n\nOK = replace\nCancel = merge (add/update by id)'
    );
    try {
      const n = await importEvents(state.user.uid, events, {
        replace,
        existing: state.events,
      });
      toast(`Imported ${n} events`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  },
});

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const modalOpen = Boolean(document.querySelector('#modal-root .modal-backdrop'));

    if (e.key === 'Escape') {
      if (modalOpen) return; // modal trap handles Esc
      if (state.view === 'settings' || state.view === 'calculator') {
        e.preventDefault();
        setView('list');
      }
      return;
    }

    if (isTypingTarget(document.activeElement) || modalOpen) return;

    if (e.key === '/' || e.key === '?') {
      e.preventDefault();
      if (state.view !== 'list') setView('list');
      requestAnimationFrame(() => focusSearch());
      return;
    }

    if (e.key === 'n' || e.key === 'N') {
      if (state.mode !== 'signed-in') {
        toast('Sign in to add events.', 'info');
        return;
      }
      e.preventDefault();
      if (state.view !== 'list') setView('list');
      openEventModal(null);
      return;
    }

    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      setView(state.view === 'settings' ? 'list' : 'settings');
    }
  });
}

subscribe(() => {
  renderAll(Date.now());
  scheduleTick();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    patchListDigits(Date.now());
    scheduleTick();
  }
});

async function boot() {
  applyTheme(state.settings?.theme || readStoredTheme());
  renderAll(Date.now());
  scheduleTick();
  setupKeyboardShortcuts();

  await initAuth((user) => {
    clearListeners();
    if (user) {
      if (!isFirebaseConfigured) {
        toast('Firebase config missing — cannot sync.', 'error');
        setSyncStatus({ syncReady: true, syncing: false });
        return;
      }
      attachFirestore(user.uid);
    } else {
      setSyncStatus({ syncReady: true, syncing: false });
      renderAll(Date.now());
    }
  });

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (err) {
      console.warn('SW registration failed', err);
    }
  }
}

boot();
