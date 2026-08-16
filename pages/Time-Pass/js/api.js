/**
 * Firestore CRUD for Time Pass.
 * Paths: users/{uid}/events/{id}, users/{uid}/settings/app
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db, isFirebaseConfigured } from '../firebase-config.js';
import {
  COLOR_PALETTE,
  COMPACT_CUE_UNITS_DEFAULT,
  COMPACT_CUE_FORMAT_DEFAULT,
  DEFAULT_UNITS,
  HARD_EVENT_CAP,
  NAME_MAX,
  RECURRENCE_FREQUENCIES,
  SCHEMA_VERSION,
  isValidColor,
  normalizeCompactCueUnits,
  normalizeCompactCueFormat,
  normalizeEventsView,
  normalizeUnits,
} from './constants.js';
import {
  DEFAULT_CATEGORY,
  DEFAULT_QUICK_CATEGORY_SLOTS,
  applyCategoryRename,
  categoriesEqual,
  normalizeCategories,
  normalizeCategoryName,
  normalizeQuickCategorySlots,
  storedQuickCategories,
} from './categories.js';
import { normalizeEventEmoji } from './emoji-from-title.js';

function eventsCol(uid) {
  return collection(db, 'users', uid, 'events');
}

function settingsDoc(uid) {
  return doc(db, 'users', uid, 'settings', 'app');
}

export function assertConfigured() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured. See README.md to add your project config.');
  }
}

export function validateEventInput(raw) {
  const name = String(raw.name || '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  if (name.length > NAME_MAX) return { ok: false, error: `Name must be ≤ ${NAME_MAX} characters.` };

  const date = String(raw.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Date must be YYYY-MM-DD.' };

  let time = raw.time == null || raw.time === '' ? null : String(raw.time).trim();
  if (time && !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    return { ok: false, error: 'Time must be HH:mm or HH:mm:ss.' };
  }

  let timeZone = raw.timeZone == null || String(raw.timeZone).trim() === ''
    ? null
    : String(raw.timeZone).trim();

  const color = raw.color || COLOR_PALETTE[0];
  if (!isValidColor(color)) return { ok: false, error: 'Colour must be from the palette.' };

  const units = normalizeUnits(raw.units);
  const frequency = raw.recurrence?.frequency || 'none';
  if (!RECURRENCE_FREQUENCIES.includes(frequency)) {
    return { ok: false, error: 'Invalid recurrence.' };
  }

  /** Recurring only: optional extra stats. Default on. */
  const showSinceLast = frequency === 'none' ? true : raw.showSinceLast !== false;
  const showSinceFirst = frequency === 'none' ? true : raw.showSinceFirst !== false;
  const showCycleProgress = frequency === 'none' ? true : raw.showCycleProgress !== false;
  const category = normalizeCategoryName(raw.category);
  const emoji = normalizeEventEmoji(raw.emoji);

  /** Skip “This week’s events” pin. Default on for daily/weekly when unset. */
  let excludeFromThisWeek;
  if (raw.excludeFromThisWeek === true) excludeFromThisWeek = true;
  else if (raw.excludeFromThisWeek === false) excludeFromThisWeek = false;
  else excludeFromThisWeek = frequency === 'daily' || frequency === 'weekly';

  /** User pin: stay at the top of the list regardless of sort. */
  const pinned = raw.pinned === true;
  const hideFromTimeline = raw.hideFromTimeline === true;

  return {
    ok: true,
    value: {
      name,
      date,
      time,
      timeZone,
      color,
      units,
      recurrence: { frequency },
      showSinceLast,
      showSinceFirst,
      showCycleProgress,
      category,
      emoji,
      excludeFromThisWeek,
      pinned,
      hideFromTimeline,
    },
  };
}

export function subscribeEvents(uid, onData, onError) {
  assertConfigured();
  return onSnapshot(
    eventsCol(uid),
    (snap) => {
      const events = [];
      snap.forEach((d) => {
        // Doc id must win over any stored `id` field
        events.push({ ...d.data(), id: d.id });
      });
      onData(events);
    },
    onError
  );
}

function quickCategoryPersistFields(settings) {
  const categories = normalizeCategories(settings?.categories);
  const quickCategorySlots = normalizeQuickCategorySlots(
    settings?.quickCategorySlots ?? DEFAULT_QUICK_CATEGORY_SLOTS
  );
  return {
    quickCategorySlots,
    quickCategories: storedQuickCategories(
      categories,
      quickCategorySlots,
      settings?.quickCategories
    ),
  };
}

function eventsViewField(settings) {
  return { eventsView: normalizeEventsView(settings?.eventsView) };
}

export function subscribeSettings(uid, onData, onError) {
  assertConfigured();
  return onSnapshot(
    settingsDoc(uid),
    (snap) => {
      if (!snap.exists()) {
        onData({
          schemaVersion: SCHEMA_VERSION,
          hasSeededDemo: false,
          fullColourCards: false,
          cardDensity: 'expanded',
          compactCueUnits: COMPACT_CUE_UNITS_DEFAULT,
          compactCueFormat: COMPACT_CUE_FORMAT_DEFAULT,
          theme: 'atmosphere',
          categories: [DEFAULT_CATEGORY],
          quickCategorySlots: DEFAULT_QUICK_CATEGORY_SLOTS,
          quickCategories: null,
          eventsView: 'list',
          filters: {
            direction: 'all',
            recurring: 'all',
            query: '',
            sort: 'smart',
            category: 'all',
          },
        });
        return;
      }
      onData(snap.data());
    },
    onError
  );
}

export async function ensureSettings(uid, partial = {}) {
  assertConfigured();
  const ref = settingsDoc(uid);
  await setDoc(
    ref,
    {
      schemaVersion: SCHEMA_VERSION,
      hasSeededDemo: false,
      fullColourCards: false,
      cardDensity: 'expanded',
      compactCueUnits: COMPACT_CUE_UNITS_DEFAULT,
      compactCueFormat: COMPACT_CUE_FORMAT_DEFAULT,
      theme: 'atmosphere',
      categories: [DEFAULT_CATEGORY],
      quickCategorySlots: DEFAULT_QUICK_CATEGORY_SLOTS,
      quickCategories: null,
      eventsView: 'list',
      filters: {
        direction: 'all',
        recurring: 'all',
        query: '',
        sort: 'smart',
        category: 'all',
      },
      ...partial,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveSettings(uid, patch) {
  assertConfigured();
  await setDoc(
    settingsDoc(uid),
    { ...patch, schemaVersion: SCHEMA_VERSION, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function createEvent(uid, raw, currentCount) {
  assertConfigured();
  if (currentCount >= HARD_EVENT_CAP) {
    throw new Error(`Event limit reached (${HARD_EVENT_CAP}). Delete some events first.`);
  }
  const checked = validateEventInput(raw);
  if (!checked.ok) throw new Error(checked.error);

  const id = raw.id || crypto.randomUUID();
  const payload = {
    id,
    ...checked.value,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(eventsCol(uid), id), payload);
  return payload;
}

export async function updateEvent(uid, eventId, raw) {
  assertConfigured();
  if (!uid) throw new Error('Not signed in.');
  if (!eventId) throw new Error('Missing event id — cannot save.');
  const checked = validateEventInput(raw);
  if (!checked.ok) throw new Error(checked.error);
  const payload = {
    id: eventId,
    ...checked.value,
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(doc(eventsCol(uid), eventId), payload);
  return payload;
}

/**
 * Multi-edit: patch only allowed fields on many events.
 * Never writes name, date, time, timeZone, id, or createdAt.
 * `patch` may include: color, units, category, recurrence, showSinceLast,
 * showSinceFirst, showCycleProgress, excludeFromThisWeek, pinned, hideFromTimeline.
 * Optional `options.colorById` maps event id → palette colour (overrides patch.color per event).
 */
export async function batchUpdateEvents(uid, eventIds, patch, existingEvents = [], options = {}) {
  assertConfigured();
  if (!uid) throw new Error('Not signed in.');
  if (!Array.isArray(eventIds) || !eventIds.length) {
    throw new Error('Select at least one event.');
  }

  const colorById =
    options.colorById && typeof options.colorById === 'object' ? options.colorById : null;
  if (colorById) {
    for (const [id, color] of Object.entries(colorById)) {
      if (!isValidColor(color)) {
        throw new Error(`Invalid colour for event ${id}.`);
      }
    }
  }

  const byId = new Map((existingEvents || []).map((e) => [e.id, e]));
  const safe = sanitizeMultiEditPatch(patch);
  const hasShared = Object.keys(safe).length > 0;
  const hasPerColor = Boolean(colorById && Object.keys(colorById).length);
  if (!hasShared && !hasPerColor) {
    throw new Error('Change at least one field before saving.');
  }

  const now = new Date().toISOString();
  const writes = [];

  for (const id of eventIds) {
    const existing = byId.get(id);
    if (!existing) {
      throw new Error(`Event missing locally (${id}). Refresh and try again.`);
    }

    const eventSafe = { ...safe };
    if (colorById && Object.prototype.hasOwnProperty.call(colorById, id)) {
      eventSafe.color = colorById[id];
    }

    // Identity fields always come from the stored event — never from the patch.
    const merged = {
      name: existing.name,
      date: existing.date,
      time: existing.time ?? null,
      timeZone: existing.timeZone ?? null,
      color: existing.color,
      units: existing.units,
      category: existing.category,
      emoji: existing.emoji ?? null,
      recurrence: existing.recurrence || { frequency: 'none' },
      showSinceLast: existing.showSinceLast !== false,
      showSinceFirst: existing.showSinceFirst !== false,
      showCycleProgress: existing.showCycleProgress !== false,
      excludeFromThisWeek: existing.excludeFromThisWeek,
      pinned: existing.pinned === true,
      hideFromTimeline: existing.hideFromTimeline === true,
      ...eventSafe,
    };

    const checked = validateEventInput(merged);
    if (!checked.ok) {
      throw new Error(`“${existing.name || id}”: ${checked.error}`);
    }

    const v = checked.value;
    const firestorePatch = {
      updatedAt: now,
    };
    if ('color' in eventSafe) firestorePatch.color = v.color;
    if ('units' in eventSafe) firestorePatch.units = v.units;
    if ('category' in eventSafe) firestorePatch.category = v.category;
    if ('recurrence' in eventSafe) firestorePatch.recurrence = v.recurrence;
    if ('showSinceLast' in eventSafe || 'recurrence' in eventSafe) {
      firestorePatch.showSinceLast = v.showSinceLast;
    }
    if ('showSinceFirst' in eventSafe || 'recurrence' in eventSafe) {
      firestorePatch.showSinceFirst = v.showSinceFirst;
    }
    if ('showCycleProgress' in eventSafe || 'recurrence' in eventSafe) {
      firestorePatch.showCycleProgress = v.showCycleProgress;
    }
    if ('excludeFromThisWeek' in eventSafe) {
      firestorePatch.excludeFromThisWeek = v.excludeFromThisWeek;
    }
    if ('pinned' in eventSafe) {
      firestorePatch.pinned = v.pinned;
    }
    if ('hideFromTimeline' in eventSafe) {
      firestorePatch.hideFromTimeline = v.hideFromTimeline;
    }
    // When frequency becomes daily/weekly and exclude wasn't explicitly patched, default on.
    if (
      'recurrence' in eventSafe &&
      !('excludeFromThisWeek' in eventSafe) &&
      (v.recurrence?.frequency === 'daily' || v.recurrence?.frequency === 'weekly')
    ) {
      firestorePatch.excludeFromThisWeek = true;
    }

    // When switching to one-time, always clear recurring stats flags to defaults.
    if (eventSafe.recurrence?.frequency === 'none') {
      firestorePatch.showSinceLast = true;
      firestorePatch.showSinceFirst = true;
      firestorePatch.showCycleProgress = true;
    }

    writes.push({ id, data: firestorePatch });
  }

  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.update(doc(eventsCol(uid), op.id), op.data);
    }
    await batch.commit();
  }

  return writes.length;
}

/** Strip identity / unknown keys from a multi-edit patch. */
export function sanitizeMultiEditPatch(patch = {}) {
  const out = {};
  if (!patch || typeof patch !== 'object') return out;

  if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
    if (!isValidColor(patch.color)) throw new Error('Colour must be from the palette.');
    out.color = patch.color;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'units')) {
    out.units = normalizeUnits(patch.units);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'category')) {
    out.category = normalizeCategoryName(patch.category);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'recurrence')) {
    const frequency = patch.recurrence?.frequency || 'none';
    if (!RECURRENCE_FREQUENCIES.includes(frequency)) {
      throw new Error('Invalid recurrence.');
    }
    out.recurrence = { frequency };
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'showSinceLast')) {
    out.showSinceLast = patch.showSinceLast !== false;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'showSinceFirst')) {
    out.showSinceFirst = patch.showSinceFirst !== false;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'showCycleProgress')) {
    out.showCycleProgress = patch.showCycleProgress !== false;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'excludeFromThisWeek')) {
    out.excludeFromThisWeek = patch.excludeFromThisWeek === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'pinned')) {
    out.pinned = patch.pinned === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'hideFromTimeline')) {
    out.hideFromTimeline = patch.hideFromTimeline === true;
  }
  return out;
}

export async function deleteEvent(uid, eventId) {
  assertConfigured();
  await deleteDoc(doc(eventsCol(uid), eventId));
}

/** Move events out of a category, then remove it from settings. Misc cannot be deleted. */
export async function deleteCategory(uid, categoryName, events, settings) {
  assertConfigured();
  const name = normalizeCategoryName(categoryName);
  if (categoriesEqual(name, DEFAULT_CATEGORY)) {
    throw new Error('Misc cannot be deleted.');
  }

  const affected = (Array.isArray(events) ? events : []).filter((e) =>
    categoriesEqual(e.category || DEFAULT_CATEGORY, name)
  );

  for (let i = 0; i < affected.length; i += 400) {
    const chunk = affected.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const e of chunk) {
      batch.update(doc(eventsCol(uid), e.id), {
        category: DEFAULT_CATEGORY,
        updatedAt: new Date().toISOString(),
      });
    }
    await batch.commit();
  }

  const nextCategories = normalizeCategories(settings?.categories).filter(
    (c) => !categoriesEqual(c, name)
  );
  const filters = { ...(settings?.filters || {}) };
  if (filters.category && categoriesEqual(filters.category, name)) {
    filters.category = 'all';
  }

  await saveSettings(uid, {
    categories: nextCategories,
    filters: {
      direction: filters.direction || 'all',
      recurring: filters.recurring || 'all',
      query: filters.query || '',
      sort: filters.sort || 'smart',
      category: filters.category || 'all',
    },
    hasSeededDemo: Boolean(settings?.hasSeededDemo),
    fullColourCards: Boolean(settings?.fullColourCards),
    cardDensity: settings?.cardDensity === 'compact' ? 'compact' : 'expanded',
    compactCueUnits: normalizeCompactCueUnits(
      settings?.compactCueUnits ?? COMPACT_CUE_UNITS_DEFAULT
    ),
    compactCueFormat: normalizeCompactCueFormat(
      settings?.compactCueFormat ?? COMPACT_CUE_FORMAT_DEFAULT
    ),
    theme:
      settings?.theme === 'oled' || settings?.theme === 'light' || settings?.theme === 'atmosphere'
        ? settings.theme
        : 'atmosphere',
    ...quickCategoryPersistFields({
      categories: nextCategories,
      quickCategorySlots: settings?.quickCategorySlots,
      quickCategories: settings?.quickCategories,
    }),
    ...eventsViewField(settings),
  });

  return { reassigned: affected.length, categories: nextCategories };
}

/** Rename a category and retarget events, filters, and one-click pins. Misc cannot be renamed. */
export async function renameCategory(uid, fromName, toName, events, settings) {
  assertConfigured();
  const planned = applyCategoryRename(settings?.categories, fromName, toName);
  if (!planned.ok) throw new Error(planned.error);
  if (planned.unchanged) {
    return { renamed: 0, merged: false, name: planned.name, categories: planned.categories };
  }

  const from = planned.from;
  const nextName = planned.name;
  const nextCategories = planned.categories;
  const affected = (Array.isArray(events) ? events : []).filter((e) =>
    categoriesEqual(e.category || DEFAULT_CATEGORY, from)
  );

  for (let i = 0; i < affected.length; i += 400) {
    const chunk = affected.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const e of chunk) {
      batch.update(doc(eventsCol(uid), e.id), {
        category: nextName,
        updatedAt: new Date().toISOString(),
      });
    }
    await batch.commit();
  }

  const filters = { ...(settings?.filters || {}) };
  if (filters.category && categoriesEqual(filters.category, from)) {
    filters.category = nextName;
  }

  const prevQuick = settings?.quickCategories;
  const nextQuick = Array.isArray(prevQuick)
    ? prevQuick.map((c) => (categoriesEqual(c, from) ? nextName : c))
    : prevQuick;

  await saveSettings(uid, {
    categories: nextCategories,
    filters: {
      direction: filters.direction || 'all',
      recurring: filters.recurring || 'all',
      query: filters.query || '',
      sort: filters.sort || 'smart',
      category: filters.category || 'all',
    },
    hasSeededDemo: Boolean(settings?.hasSeededDemo),
    fullColourCards: Boolean(settings?.fullColourCards),
    cardDensity: settings?.cardDensity === 'compact' ? 'compact' : 'expanded',
    compactCueUnits: normalizeCompactCueUnits(
      settings?.compactCueUnits ?? COMPACT_CUE_UNITS_DEFAULT
    ),
    compactCueFormat: normalizeCompactCueFormat(
      settings?.compactCueFormat ?? COMPACT_CUE_FORMAT_DEFAULT
    ),
    theme:
      settings?.theme === 'oled' || settings?.theme === 'light' || settings?.theme === 'atmosphere'
        ? settings.theme
        : 'atmosphere',
    ...quickCategoryPersistFields({
      categories: nextCategories,
      quickCategorySlots: settings?.quickCategorySlots,
      quickCategories: nextQuick,
    }),
    ...eventsViewField(settings),
  });

  return {
    renamed: affected.length,
    merged: planned.merged,
    name: nextName,
    categories: nextCategories,
  };
}

export async function seedEventsIfNeeded(uid, events, settings) {
  assertConfigured();
  if (settings?.hasSeededDemo) return false;
  if (events.length > 0) {
    await saveSettings(uid, { hasSeededDemo: true });
    return false;
  }
  const { createSeedEvents } = await import('./demo-events.js');
  const seeds = createSeedEvents();
  const batch = writeBatch(db);
  for (const e of seeds) {
    batch.set(doc(eventsCol(uid), e.id), e);
  }
      batch.set(
    settingsDoc(uid),
    {
      schemaVersion: SCHEMA_VERSION,
      hasSeededDemo: true,
      fullColourCards: Boolean(settings?.fullColourCards),
      cardDensity: settings?.cardDensity === 'compact' ? 'compact' : 'expanded',
      compactCueUnits: normalizeCompactCueUnits(
        settings?.compactCueUnits ?? COMPACT_CUE_UNITS_DEFAULT
      ),
      compactCueFormat: normalizeCompactCueFormat(
        settings?.compactCueFormat ?? COMPACT_CUE_FORMAT_DEFAULT
      ),
      theme:
        settings?.theme === 'oled' || settings?.theme === 'light' || settings?.theme === 'atmosphere'
          ? settings.theme
          : 'atmosphere',
      categories: normalizeCategories(settings?.categories),
      ...quickCategoryPersistFields(settings),
      ...eventsViewField(settings),
      filters: settings?.filters || {
        direction: 'all',
        recurring: 'all',
        query: '',
        sort: 'smart',
        category: 'all',
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
  return true;
}

export async function importEvents(uid, events, { replace = false, existing = [] } = {}) {
  assertConfigured();
  if (!Array.isArray(events)) throw new Error('Import must be an array of events.');

  let nextCount = replace ? 0 : existing.length;
  const batchWrites = [];
  const seen = new Set();

  if (replace) {
    for (const e of existing) {
      batchWrites.push({ type: 'delete', id: e.id });
    }
  }

  for (const raw of events) {
    const checked = validateEventInput(raw);
    if (!checked.ok) throw new Error(`Invalid event "${raw?.name || '?'}": ${checked.error}`);
    const id = raw.id && typeof raw.id === 'string' ? raw.id : crypto.randomUUID();
    if (seen.has(id)) continue;
    seen.add(id);
    nextCount += 1;
    if (nextCount > HARD_EVENT_CAP) {
      throw new Error(`Import would exceed the ${HARD_EVENT_CAP} event limit.`);
    }
    batchWrites.push({
      type: 'set',
      id,
      data: {
        id,
        ...checked.value,
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  }

  // Chunk ≤400
  for (let i = 0; i < batchWrites.length; i += 400) {
    const chunk = batchWrites.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = doc(eventsCol(uid), op.id);
      if (op.type === 'delete') batch.delete(ref);
      else batch.set(ref, op.data);
    }
    await batch.commit();
  }
  return seen.size;
}

export function exportPayload(events, settings) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      filters: settings?.filters || {
        direction: 'all',
        recurring: 'all',
        query: '',
        sort: 'smart',
        category: 'all',
      },
      categories: normalizeCategories(settings?.categories),
      fullColourCards: Boolean(settings?.fullColourCards),
      cardDensity: settings?.cardDensity === 'compact' ? 'compact' : 'expanded',
      compactCueUnits: normalizeCompactCueUnits(
        settings?.compactCueUnits ?? COMPACT_CUE_UNITS_DEFAULT
      ),
      compactCueFormat: normalizeCompactCueFormat(
        settings?.compactCueFormat ?? COMPACT_CUE_FORMAT_DEFAULT
      ),
      theme:
        settings?.theme === 'oled' || settings?.theme === 'light' || settings?.theme === 'atmosphere'
          ? settings.theme
          : 'atmosphere',
      ...quickCategoryPersistFields(settings),
      ...eventsViewField(settings),
    },
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      time: e.time ?? null,
      timeZone: e.timeZone ?? null,
      color: e.color,
      units: normalizeUnits(e.units),
      category: normalizeCategoryName(e.category),
      emoji: normalizeEventEmoji(e.emoji),
      recurrence: { frequency: e.recurrence?.frequency || 'none' },
      showSinceLast: e.showSinceLast !== false,
      showSinceFirst: e.showSinceFirst !== false,
      showCycleProgress: e.showCycleProgress !== false,
      excludeFromThisWeek: e.excludeFromThisWeek === true,
      pinned: e.pinned === true,
      hideFromTimeline: e.hideFromTimeline === true,
      createdAt: e.createdAt || null,
      updatedAt: e.updatedAt || null,
    })),
  };
}

export { DEFAULT_UNITS, COLOR_PALETTE };
