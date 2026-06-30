import { slotsToParticipantMaps } from './overlap.js';
import { enumerateDates, slotsToDaySelection } from './utils.js';

export function formatDayLabel(dateStr, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${dateStr}T12:00:00`));
}

export function formatDayShort(dateStr, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${dateStr}T12:00:00`));
}

/**
 * @param {Array} participants
 * @param {Map<string, Map<string, 'likely'|'maybe'>>} maps from slotsToParticipantMaps
 * @param {string} dateStr
 */
export function computeDayBreakdown(participants, maps, dateStr) {
  const likely = [];
  const maybe = [];
  const notFree = [];
  const awaiting = [];

  for (const p of participants) {
    if (!p.has_submitted_availability) {
      awaiting.push(p);
      continue;
    }

    const hourlyMap = maps.get(p.id);
    if (!hourlyMap?.size) {
      notFree.push(p);
      continue;
    }

    const { days } = slotsToDaySelection(hourlyMap);
    const conf = days.get(dateStr);
    if (conf === 'likely') likely.push(p);
    else if (conf === 'maybe') maybe.push(p);
    else notFree.push(p);
  }

  likely.sort((a, b) => a.display_name.localeCompare(b.display_name));
  maybe.sort((a, b) => a.display_name.localeCompare(b.display_name));
  notFree.sort((a, b) => a.display_name.localeCompare(b.display_name));
  awaiting.sort((a, b) => a.display_name.localeCompare(b.display_name));

  const score = likely.length * 2 + maybe.length;

  return {
    dateStr,
    likely,
    maybe,
    notFree,
    awaiting,
    score,
    likelyCount: likely.length,
    maybeCount: maybe.length,
    notFreeCount: notFree.length,
    awaitingCount: awaiting.length,
    respondedCount: likely.length + maybe.length + notFree.length,
  };
}

/**
 * Rank every day in the event by group availability score.
 */
export function computeRankedDays(event, participants, slots) {
  const maps = slotsToParticipantMaps(slots, event);
  const dates = enumerateDates(event.start_date, event.end_date);

  const ranked = dates.map((dateStr) => {
    const breakdown = computeDayBreakdown(participants, maps, dateStr);
    return {
      ...breakdown,
      label: formatDayLabel(dateStr, event.timezone),
      shortLabel: formatDayShort(dateStr, event.timezone),
    };
  });

  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.likelyCount - a.likelyCount ||
      a.dateStr.localeCompare(b.dateStr)
  );

  return ranked;
}

export function getTopDayDateStr(rankedDays) {
  if (!rankedDays?.length) return null;
  const withAvailability = rankedDays.find((d) => d.score > 0);
  return withAvailability?.dateStr ?? rankedDays[0]?.dateStr ?? null;
}
