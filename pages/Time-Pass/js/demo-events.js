import { COLOR_PALETTE, DEFAULT_UNITS } from './constants.js';

function isoDateOffset(daysFromToday) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Guest read-only samples (never written to Firestore). */
export function createGuestDemoEvents() {
  return [
    {
      id: 'demo-guest-1',
      name: 'Next Monday standup',
      date: '2025-01-06',
      time: '09:00',
      timeZone: null,
      color: COLOR_PALETTE[0],
      units: [...DEFAULT_UNITS],
      recurrence: { frequency: 'weekly' },
      category: 'Work',
      showSinceLast: true,
      showSinceFirst: true,
      showCycleProgress: true,
      excludeFromThisWeek: false,
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'demo-guest-2',
      name: 'Site launched',
      date: '2024-01-15',
      time: null,
      timeZone: null,
      color: COLOR_PALETTE[6],
      units: [...DEFAULT_UNITS],
      recurrence: { frequency: 'none' },
      category: 'Misc',
      pinned: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

/** First-sign-in Firestore seed (Q21). */
export function createSeedEvents() {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      name: 'New Year',
      date: '2020-01-01',
      time: null,
      timeZone: null,
      color: COLOR_PALETTE[0],
      units: [...DEFAULT_UNITS],
      recurrence: { frequency: 'yearly' },
      category: 'Misc',
      showSinceLast: true,
      showSinceFirst: true,
      showCycleProgress: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: 'First day with Time Pass',
      date: isoDateOffset(0),
      time: null,
      timeZone: null,
      color: COLOR_PALETTE[2],
      units: [...DEFAULT_UNITS],
      recurrence: { frequency: 'none' },
      category: 'Misc',
      createdAt: now,
      updatedAt: now,
    },
  ];
}
