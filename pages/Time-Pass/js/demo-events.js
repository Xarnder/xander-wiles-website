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
      date: isoDateOffset(0),
      time: '09:00',
      timeZone: null,
      color: COLOR_PALETTE[0],
      units: [...DEFAULT_UNITS],
      recurrence: { frequency: 'weekly' },
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
      date: `${new Date().getFullYear() + 1}-01-01`,
      time: null,
      timeZone: null,
      color: COLOR_PALETTE[0],
      units: [...DEFAULT_UNITS],
      recurrence: { frequency: 'yearly' },
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
      createdAt: now,
      updatedAt: now,
    },
  ];
}
