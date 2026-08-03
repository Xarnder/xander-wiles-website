import { initAuth, signInWithGoogle, signOutUser } from './auth.js';
import {
  createEvent,
  updateEvent,
  batchUpdateEvents,
  deleteEvent,
  deleteCategory,
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
  patchSettings,
  setSeeding,
  setSyncStatus,
  setView,
  needsSecondTick,
} from './store.js';
import { normalizeCategories, normalizeCategoryName, canDeleteCategory, categoriesEqual, DEFAULT_CATEGORY, applyBirthdayCategoryIfNeeded } from './categories.js';
import { renderAll, renderToolbar, renderList, patchListDigits, setUIHandlers, focusSearch, openEventModal } from './ui.js';
import { toast } from './format.js';
import { isFirebaseConfigured } from '../firebase-config.js';
import { COLOR_PALETTE, DEFAULT_UNITS, SOFT_EVENT_CAP } from './constants.js';
import { applyTheme, readStoredTheme } from './theme.js';

let unsubEvents = null;
let unsubSettings = null;
let attachedUid = null;
let tickTimer = null;
let seedAttempted = false;
let filterPersistTimer = null;
let lastA11yMinute = -1;

function isBenignFirestoreError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return (
    code === 'cancelled' ||
    code === 'aborted' ||
    msg.includes('client has already been terminated') ||
    msg.includes('client is terminated') ||
    msg.includes('the client has been terminated')
  );
}

function clearListeners() {
  if (unsubEvents) {
    unsubEvents();
    unsubEvents = null;
  }
  if (unsubSettings) {
    unsubSettings();
    unsubSettings = null;
  }
  attachedUid = null;
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
        categories: normalizeCategories(state.settings.categories),
        ...extra,
      });
    } catch (err) {
      console.warn('Settings persist failed', err);
    }
  }, 400);
}

async function syncCategoriesAfterEvent(category, modalCategories) {
  const next = normalizeCategories([
    ...(state.settings.categories || []),
    ...(Array.isArray(modalCategories) ? modalCategories : []),
    category,
  ]);
  const prev = normalizeCategories(state.settings.categories);
  if (next.join('\0') === prev.join('\0')) return;
  patchSettings({ categories: next });
  if (state.user && isFirebaseConfigured) {
    await saveSettings(state.user.uid, {
      categories: next,
      filters: state.settings.filters,
      hasSeededDemo: state.settings.hasSeededDemo,
      fullColourCards: state.settings.fullColourCards,
      cardDensity: state.settings.cardDensity === 'compact' ? 'compact' : 'expanded',
      theme: state.settings.theme,
    });
  }
}

function attachFirestore(uid) {
  if (!uid) return;
  if (attachedUid === uid && unsubEvents && unsubSettings) return;

  clearListeners();
  attachedUid = uid;
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
      if (isBenignFirestoreError(err)) {
        console.warn('Events listener closed', err);
        return;
      }
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
      if (isBenignFirestoreError(err)) {
        console.warn('Settings listener closed', err);
        return;
      }
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
    const keys = Object.keys(partial);
    const queryOnly = keys.length === 1 && keys[0] === 'query';

    // Typing in search must not full-notify (that rebuilds the input and steals focus).
    if (queryOnly) {
      setFilters(partial, { silent: true });
      renderToolbar(Date.now());
      renderList(Date.now());
      scheduleTick();
    } else {
      setFilters(partial);
    }

    // Debounce Firestore writes especially for search typing
    const delay = partial.query !== undefined ? 450 : 0;
    clearTimeout(filterPersistTimer);
    filterPersistTimer = setTimeout(() => persistSettingsSoon(), delay);
  },
  onSaveSettings: async (partial) => {
    if (state.user && isFirebaseConfigured) {
      try {
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
          theme: partial.theme !== undefined ? partial.theme : state.settings.theme,
          ...partial,
          categories: normalizeCategories(
            partial.categories !== undefined ? partial.categories : state.settings.categories
          ),
        });
      } catch (err) {
        if (isBenignFirestoreError(err)) {
          console.warn('Settings save ignored', err);
          return;
        }
        throw err;
      }
    }
  },
  onAdd: async (payload) => {
    try {
      const { _categories, ...rest } = payload;
      const applied = applyBirthdayCategoryIfNeeded(
        rest.name,
        rest.category,
        _categories || state.settings.categories
      );
      const eventPayload = { ...rest, category: applied.category };
      await createEvent(state.user.uid, eventPayload, state.events.length);
      await syncCategoriesAfterEvent(eventPayload.category, applied.categories);
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
      const { _categories, ...eventPayload } = payload;
      await updateEvent(state.user.uid, id, eventPayload);
      await syncCategoriesAfterEvent(eventPayload.category, _categories);
      toast('Event saved', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  },
  onBatchEdit: async (ids, patch, meta = {}) => {
    const { _categories, colorById } = meta;
    try {
      const n = await batchUpdateEvents(state.user.uid, ids, patch, state.events, { colorById });
      if (Object.prototype.hasOwnProperty.call(patch, 'category')) {
        await syncCategoriesAfterEvent(patch.category, _categories);
      }
      toast(`Updated ${n} event${n === 1 ? '' : 's'}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
      throw err;
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
  onDeleteCategory: async (name) => {
    try {
      if (state.user && isFirebaseConfigured) {
        await deleteCategory(state.user.uid, name, state.events, state.settings);
      } else {
        if (!canDeleteCategory(name)) throw new Error('Misc cannot be deleted.');
        const nextEvents = state.events.map((e) =>
          categoriesEqual(e.category || DEFAULT_CATEGORY, name)
            ? { ...e, category: DEFAULT_CATEGORY, updatedAt: new Date().toISOString() }
            : e
        );
        const nextCategories = normalizeCategories(state.settings.categories).filter(
          (c) => !categoriesEqual(c, name)
        );
        const filters = { ...state.settings.filters };
        if (filters.category && categoriesEqual(filters.category, name)) {
          filters.category = 'all';
        }
        setEvents(nextEvents);
        patchSettings({ categories: nextCategories, filters });
      }
      toast(`Category “${name}” deleted`, 'success');
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
        category: normalizeCategoryName(event.category),
        recurrence: { frequency: event.recurrence?.frequency || 'none' },
        showSinceLast: event.showSinceLast !== false,
        showSinceFirst: event.showSinceFirst !== false,
        showCycleProgress: event.showCycleProgress !== false,
        excludeFromThisWeek: event.excludeFromThisWeek,
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
  onImport: async (events, opts = {}) => {
    const replace =
      typeof opts.replace === 'boolean'
        ? opts.replace
        : window.confirm(
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
    const uid = user?.uid || null;

    if (!uid) {
      clearListeners();
      setSyncStatus({ syncReady: true, syncing: false });
      renderAll(Date.now());
      return;
    }

    // Token refresh / duplicate auth callbacks — keep existing listeners
    if (attachedUid === uid && unsubEvents && unsubSettings) {
      return;
    }

    if (!isFirebaseConfigured) {
      toast('Firebase config missing — cannot sync.', 'error');
      setSyncStatus({ syncReady: true, syncing: false });
      return;
    }

    attachFirestore(uid);
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
