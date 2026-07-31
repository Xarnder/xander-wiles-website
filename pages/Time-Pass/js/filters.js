import { buildPrimaryView } from './time-engine.js';
import { resolveOccurrenceWindow } from './recurrence.js';

/**
 * Build list view-models, filter, and sort (Q18/Q19).
 */

export const SORT_OPTIONS = [
  { value: 'smart', label: 'Next upcoming', hint: 'Soonest upcoming, then recent past' },
  { value: 'soonest', label: 'Soonest first', hint: 'Closest in time either direction' },
  { value: 'furthest', label: 'Furthest first', hint: 'Farthest from now' },
  { value: 'newest', label: 'Newest created', hint: 'Most recently added' },
  { value: 'oldest', label: 'Oldest created', hint: 'First added' },
  { value: 'date-desc', label: 'Newest date', hint: 'By event date, newest first' },
  { value: 'date-asc', label: 'Oldest date', hint: 'By event date, oldest first' },
  { value: 'name-asc', label: 'A–Z', hint: 'Alphabetical' },
  { value: 'name-desc', label: 'Z–A', hint: 'Reverse alphabetical' },
  { value: 'updated', label: 'Recently edited', hint: 'Last updated first' },
  { value: 'colour', label: 'By colour', hint: 'Palette order' },
];

export function normalizeSort(sort) {
  if (SORT_OPTIONS.some((o) => o.value === sort)) return sort;
  return 'smart';
}

export function toViewModel(event, nowMs) {
  const freq = event.recurrence?.frequency || 'none';
  const { lastMs, nextMs } = resolveOccurrenceWindow(event, nowMs);

  if (freq === 'none') {
    const target = nextMs ?? lastMs;
    const primary = buildPrimaryView(event, target, nowMs);
    return { event, primary, secondary: null, sortKeyUpcoming: nextMs, sortKeyPast: lastMs };
  }

  let primary = null;
  let secondary = null;
  if (nextMs != null) {
    primary = buildPrimaryView(event, nextMs, nowMs);
  }
  if (lastMs != null) {
    const lastView = buildPrimaryView(event, lastMs, nowMs);
    if (primary) {
      if (event.showSinceLast !== false) secondary = lastView;
    } else {
      primary = lastView;
    }
  }

  if (!primary) {
    primary = buildPrimaryView(event, nowMs, nowMs);
  }

  return {
    event,
    primary,
    secondary,
    sortKeyUpcoming: nextMs,
    sortKeyPast: lastMs,
  };
}

function isUpcomingVm(vm) {
  const freq = vm.event.recurrence?.frequency || 'none';
  if (freq !== 'none') return vm.sortKeyUpcoming != null;
  return vm.primary?.direction === 'until';
}

export function filterViewModels(vms, filters) {
  const direction = filters?.direction || 'all';
  const recurring = filters?.recurring || 'all';
  const query = (filters?.query || '').trim().toLowerCase();

  return vms.filter((vm) => {
    const freq = vm.event.recurrence?.frequency || 'none';
    const isRecurring = freq !== 'none';

    if (recurring === 'recurring' && !isRecurring) return false;
    if (recurring === 'one-shot' && isRecurring) return false;

    if (direction === 'upcoming' && !isUpcomingVm(vm)) return false;
    if (direction === 'past' && isUpcomingVm(vm)) return false;

    if (query && !String(vm.event.name || '').toLowerCase().includes(query)) return false;
    return true;
  });
}

function createdMs(event) {
  const t = Date.parse(event?.createdAt || '');
  return Number.isFinite(t) ? t : 0;
}

function updatedMs(event) {
  const t = Date.parse(event?.updatedAt || event?.createdAt || '');
  return Number.isFinite(t) ? t : 0;
}

function eventDateKey(event) {
  const date = String(event?.date || '');
  const time = event?.time ? String(event.time).slice(0, 8) : '00:00:00';
  return `${date}T${time.length === 5 ? `${time}:00` : time}`;
}

function proximityMs(vm, nowMs) {
  const target = vm.primary?.targetMs;
  if (target == null) return Number.POSITIVE_INFINITY;
  return Math.abs(target - nowMs);
}

function colourRank(event) {
  const COLOR_ORDER = [
    '#3cf0ff',
    '#5b8cff',
    '#a78bfa',
    '#f472b6',
    '#fb923c',
    '#facc15',
    '#4ade80',
    '#2dd4bf',
    '#f87171',
    '#94a3b8',
  ];
  const i = COLOR_ORDER.indexOf(event?.color);
  return i === -1 ? 999 : i;
}

function compareName(a, b) {
  return String(a.event?.name || '').localeCompare(String(b.event?.name || ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

function sortFlat(vms, sort, nowMs) {
  const list = [...vms];
  switch (normalizeSort(sort)) {
    case 'soonest':
      list.sort((a, b) => proximityMs(a, nowMs) - proximityMs(b, nowMs) || compareName(a, b));
      break;
    case 'furthest':
      list.sort((a, b) => proximityMs(b, nowMs) - proximityMs(a, nowMs) || compareName(a, b));
      break;
    case 'newest':
      list.sort((a, b) => createdMs(b.event) - createdMs(a.event) || compareName(a, b));
      break;
    case 'oldest':
      list.sort((a, b) => createdMs(a.event) - createdMs(b.event) || compareName(a, b));
      break;
    case 'date-desc':
      list.sort(
        (a, b) =>
          eventDateKey(b.event).localeCompare(eventDateKey(a.event)) || compareName(a, b)
      );
      break;
    case 'date-asc':
      list.sort(
        (a, b) =>
          eventDateKey(a.event).localeCompare(eventDateKey(b.event)) || compareName(a, b)
      );
      break;
    case 'name-asc':
      list.sort(compareName);
      break;
    case 'name-desc':
      list.sort((a, b) => compareName(b, a));
      break;
    case 'updated':
      list.sort((a, b) => updatedMs(b.event) - updatedMs(a.event) || compareName(a, b));
      break;
    case 'colour':
      list.sort((a, b) => colourRank(a.event) - colourRank(b.event) || compareName(a, b));
      break;
    case 'smart':
    default: {
      const upcoming = [];
      const past = [];
      for (const vm of list) {
        if (isUpcomingVm(vm)) upcoming.push(vm);
        else past.push(vm);
      }
      upcoming.sort((a, b) => {
        const ta = a.sortKeyUpcoming ?? a.primary.targetMs;
        const tb = b.sortKeyUpcoming ?? b.primary.targetMs;
        return ta - tb;
      });
      past.sort((a, b) => {
        const ta = a.sortKeyPast ?? a.primary.targetMs;
        const tb = b.sortKeyPast ?? b.primary.targetMs;
        return tb - ta;
      });
      return { upcoming, past, all: [...upcoming, ...past] };
    }
  }

  const upcoming = list.filter(isUpcomingVm);
  const past = list.filter((vm) => !isUpcomingVm(vm));
  return { upcoming, past, all: list };
}

/** Upcoming soonest, then past most recent (Q19) — or alternate orders. */
export function sortViewModels(vms, sort = 'smart', nowMs = Date.now()) {
  return sortFlat(vms, sort, nowMs);
}

export function buildFilteredSortedList(events, filters, nowMs) {
  const vms = events.map((e) => toViewModel(e, nowMs));
  return sortViewModels(filterViewModels(vms, filters), filters?.sort, nowMs).all;
}

export function buildFilteredSortedSections(events, filters, nowMs) {
  const vms = events.map((e) => toViewModel(e, nowMs));
  return sortViewModels(filterViewModels(vms, filters), filters?.sort, nowMs);
}

export function listNeedsSecondTick(vms) {
  return vms.some((vm) => {
    const units = vm.primary?.visibleUnits || [];
    const units2 = vm.secondary?.visibleUnits || [];
    return units.includes('seconds') || units2.includes('seconds');
  });
}

export { isUpcomingVm };
