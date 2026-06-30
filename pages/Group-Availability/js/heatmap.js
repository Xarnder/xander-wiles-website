import { slotsToParticipantMaps } from './overlap.js';
import { slotsToDaySelection } from './utils.js';

/**
 * Count how many submitted participants marked each day (any availability).
 */
export function computeDayAvailabilityCounts(participants, slots, event) {
  const submitted = participants.filter((p) => p.has_submitted_availability);
  const maps = slotsToParticipantMaps(slots, event);
  const byDate = new Map();

  for (const p of submitted) {
    const hourlyMap = maps.get(p.id);
    if (!hourlyMap?.size) continue;
    const { days } = slotsToDaySelection(hourlyMap);
    for (const dateStr of days.keys()) {
      byDate.set(dateStr, (byDate.get(dateStr) || 0) + 1);
    }
  }

  let max = 0;
  for (const c of byDate.values()) max = Math.max(max, c);

  return { byDate, max, submittedCount: submitted.length };
}

/** @returns {number} 0–1 relative to the busiest day */
export function heatIntensity(count, max) {
  if (!max || !count) return 0;
  return count / max;
}

function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(from, to, t) {
  return [
    lerpChannel(from[0], to[0], t),
    lerpChannel(from[1], to[1], t),
    lerpChannel(from[2], to[2], t),
  ];
}

const HEAT_RED = [220, 38, 38];
const HEAT_ORANGE = [194, 65, 12];
const HEAT_GREEN = [34, 197, 94];

export function heatColor(intensity) {
  if (intensity <= 0) return 'rgba(127, 29, 29, 0.28)';

  const t = Math.max(0, Math.min(1, intensity));
  const [r, g, b] =
    t < 0.5 ? lerpRgb(HEAT_RED, HEAT_ORANGE, t * 2) : lerpRgb(HEAT_ORANGE, HEAT_GREEN, (t - 0.5) * 2);

  return `rgb(${r}, ${g}, ${b})`;
}

export function heatTextColor(intensity) {
  if (intensity >= 0.55) return '#ecfdf5';
  if (intensity > 0) return '#fff7ed';
  return 'var(--muted)';
}
