import { COLOR_PALETTE, DEFAULT_UNITS } from './constants.js';

function isoDateOffset(daysFromToday) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function stamp() {
  return new Date().toISOString();
}

function demo(partial) {
  return {
    time: null,
    timeZone: null,
    units: [...DEFAULT_UNITS],
    recurrence: { frequency: 'none' },
    category: 'Misc',
    showSinceLast: true,
    showSinceFirst: true,
    showCycleProgress: true,
    excludeFromThisWeek: false,
    pinned: false,
    hideFromTimeline: false,
    createdAt: stamp(),
    updatedAt: stamp(),
    ...partial,
  };
}

/** Guest read-only samples (never written to Firestore). */
export function createGuestDemoEvents() {
  const today = isoDateOffset(0);
  return [
    demo({
      id: 'demo-guest-1',
      name: 'Next Monday standup',
      date: '2025-01-06',
      time: '09:00',
      color: COLOR_PALETTE[0],
      recurrence: { frequency: 'weekly' },
      category: 'Work',
    }),
    demo({
      id: 'demo-guest-2',
      name: 'Site launched',
      date: '2024-01-15',
      color: COLOR_PALETTE[6],
      pinned: true,
    }),
    demo({
      id: 'demo-guest-3',
      name: 'Coffee with Sam',
      date: today,
      time: '09:00',
      color: COLOR_PALETTE[2],
      category: 'Life',
    }),
    demo({
      id: 'demo-guest-4',
      name: 'Design review',
      date: today,
      time: '09:00',
      color: COLOR_PALETTE[3],
      category: 'Work',
    }),
    demo({
      id: 'demo-guest-5',
      name: 'First apartment',
      date: isoYearsAgo(10),
      color: COLOR_PALETTE[5],
      category: 'Life',
    }),
    demo({
      id: 'demo-guest-6',
      name: 'New Year',
      date: '2020-01-01',
      color: COLOR_PALETTE[1],
      recurrence: { frequency: 'yearly' },
    }),
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
