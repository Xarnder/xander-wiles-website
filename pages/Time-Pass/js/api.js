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
  DEFAULT_UNITS,
  HARD_EVENT_CAP,
  NAME_MAX,
  RECURRENCE_FREQUENCIES,
  SCHEMA_VERSION,
  isValidColor,
  normalizeUnits,
} from './constants.js';

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

  /** Recurring only: show secondary “since last” block. Default on. */
  const showSinceLast = frequency === 'none' ? true : raw.showSinceLast !== false;

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
          theme: 'atmosphere',
          filters: { direction: 'all', recurring: 'all', query: '', sort: 'smart' },
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
      theme: 'atmosphere',
      filters: { direction: 'all', recurring: 'all', query: '', sort: 'smart' },
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

export async function deleteEvent(uid, eventId) {
  assertConfigured();
  await deleteDoc(doc(eventsCol(uid), eventId));
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
      theme:
        settings?.theme === 'oled' || settings?.theme === 'light' || settings?.theme === 'atmosphere'
          ? settings.theme
          : 'atmosphere',
      filters: settings?.filters || { direction: 'all', recurring: 'all', query: '', sort: 'smart' },
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
      filters: settings?.filters || { direction: 'all', recurring: 'all', query: '', sort: 'smart' },
      fullColourCards: Boolean(settings?.fullColourCards),
      cardDensity: settings?.cardDensity === 'compact' ? 'compact' : 'expanded',
      theme:
        settings?.theme === 'oled' || settings?.theme === 'light' || settings?.theme === 'atmosphere'
          ? settings.theme
          : 'atmosphere',
    },
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      time: e.time ?? null,
      timeZone: e.timeZone ?? null,
      color: e.color,
      units: normalizeUnits(e.units),
      recurrence: { frequency: e.recurrence?.frequency || 'none' },
      showSinceLast: e.showSinceLast !== false,
      createdAt: e.createdAt || null,
      updatedAt: e.updatedAt || null,
    })),
  };
}

export { DEFAULT_UNITS, COLOR_PALETTE };
