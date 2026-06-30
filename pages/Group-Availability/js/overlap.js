import {
  enumerateDates,
  formatHourLabel,
  formatSlotLabel,
  utcToSlotKey,
} from './utils.js';

/**
 * @param {Map<string, 'likely'|'maybe'>} slotMap keyed by participant_id -> slot_start iso -> confidence
 */
export function computeOverlap(event, participants, slots) {
  const byUtc = new Map();

  for (const slot of slots) {
    if (!byUtc.has(slot.slot_start)) {
      byUtc.set(slot.slot_start, { likely: 0, maybe: 0, participantIds: new Set() });
    }
    const entry = byUtc.get(slot.slot_start);
    if (slot.confidence === 'likely') entry.likely += 1;
    else entry.maybe += 1;
    entry.participantIds.add(slot.participant_id);
  }

  const scored = [];
  for (const [utc, counts] of byUtc.entries()) {
    const key = utcToSlotKey(utc, event.timezone);
    const [dateStr, hourStr] = key.split('|');
    const hour = parseInt(hourStr, 10);
    scored.push({
      utc,
      dateStr,
      hour,
      label: formatSlotLabel(dateStr, hour, event.timezone),
      likely: counts.likely,
      maybe: counts.maybe,
      score: counts.likely * 2 + counts.maybe,
      total: counts.likely + counts.maybe,
      participantIds: counts.participantIds,
    });
  }

  scored.sort((a, b) => b.score - a.score || b.likely - a.likely || a.utc.localeCompare(b.utc));
  return mergeAdjacent(scored, event);
}

function mergeAdjacent(scored, event) {
  if (!scored.length) return [];
  const sorted = [...scored].sort((a, b) => a.utc.localeCompare(b.utc));
  const ranges = [];
  let cur = null;

  for (const slot of sorted) {
    if (!cur) {
      cur = { ...slot, endHour: slot.hour + 1, endDateStr: slot.dateStr };
      continue;
    }

    const sameSet =
      cur.participantIds.size === slot.participantIds.size &&
      [...cur.participantIds].every((id) => slot.participantIds.has(id));
    const nextHour = cur.endDateStr === slot.dateStr && cur.endHour === slot.hour;

    if (sameSet && nextHour && cur.score === slot.score) {
      cur.endHour = slot.hour + 1;
      if (cur.endHour >= 24) {
        const d = new Date(`${cur.endDateStr}T12:00:00`);
        d.setDate(d.getDate() + 1);
        cur.endDateStr = d.toISOString().slice(0, 10);
        cur.endHour = 0;
      }
    } else {
      ranges.push(formatRange(cur, event));
      cur = { ...slot, endHour: slot.hour + 1, endDateStr: slot.dateStr };
    }
  }
  if (cur) ranges.push(formatRange(cur, event));
  ranges.sort(
    (a, b) =>
      b.score - a.score ||
      b.likely - a.likely ||
      a.startDateStr.localeCompare(b.startDateStr) ||
      a.startHour - b.startHour ||
      (a.utc || '').localeCompare(b.utc || '')
  );
  return ranges.slice(0, 20);
}

function formatRange(cur, event) {
  const startLabel = formatSlotLabel(cur.dateStr, cur.hour, event.timezone);
  let endLabel;
  if (cur.endDateStr === cur.dateStr) {
    endLabel = formatHourLabel(cur.endHour);
  } else {
    endLabel = formatSlotLabel(cur.endDateStr, cur.endHour, event.timezone);
  }
  const timePart =
    cur.endDateStr === cur.dateStr
      ? startLabel.replace(/, [^,]+$/, '') + `, ${formatHourLabel(cur.hour)} – ${endLabel}`
      : `${startLabel} – ${endLabel}`;

  return {
    score: cur.score,
    likely: cur.likely,
    maybe: cur.maybe,
    total: cur.total,
    label: timePart,
    detail: `${cur.likely} green, ${cur.maybe} yellow`,
    startDateStr: cur.dateStr,
    startHour: cur.hour,
    endDateStr: cur.endDateStr,
    endHour: cur.endHour,
    utc: cur.utc,
  };
}

export function slotsToParticipantMaps(slots, event) {
  const byParticipant = new Map();
  for (const slot of slots) {
    if (!byParticipant.has(slot.participant_id)) {
      byParticipant.set(slot.participant_id, new Map());
    }
    const key = utcToSlotKey(slot.slot_start, event.timezone);
    byParticipant.get(slot.participant_id).set(key, slot.confidence);
  }
  return byParticipant;
}

export function canSeeIndividualGrids(event, currentParticipant, session) {
  const previewGuest =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === 'guest';
  const isOrganizerAdmin =
    session && event.organizer_id === session.user.id && !previewGuest;

  if (isOrganizerAdmin) {
    return event.visibility_mode !== 'overlap_only';
  }

  if (!currentParticipant?.has_submitted_availability) return false;
  if (event.visibility_mode === 'overlap_only') return false;
  if (event.visibility_mode === 'organizer_only') {
    return false;
  }
  return true;
}
