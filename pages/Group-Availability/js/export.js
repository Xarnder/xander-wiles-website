import { localSlotToUtc } from './utils.js';

export function formatOverlapSummary(event, ranges) {
  const tz = event.timezone.replace(/_/g, ' ');
  const header = [
    `Best times — ${event.title}`,
    `${event.start_date} → ${event.end_date} (${tz})`,
    '',
  ].join('\n');

  if (!ranges.length) return `${header}No overlapping availability yet.`;

  const lines = ranges.map(
    (r, i) => `${i + 1}. ${r.label} — ${r.score} pts (${r.detail})`
  );
  return `${header}${lines.join('\n')}`;
}

function utcToIcs(iso) {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

function escapeIcs(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * @param {object} event
 * @param {Array} ranges from computeOverlap (includes start/end fields)
 */
export function overlapToIcs(event, ranges) {
  const now = utcToIcs(new Date().toISOString());
  const events = ranges.map((r, i) => {
    const start = localSlotToUtc(r.startDateStr, r.startHour, event.timezone);
    const end = localSlotToUtc(r.endDateStr, r.endHour, event.timezone);
    const uid = `wth-${event.id}-${i}@whentohang`;
    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${utcToIcs(start)}`,
      `DTEND:${utcToIcs(end)}`,
      `SUMMARY:${escapeIcs(`${event.title} — ${r.score} pts`)}`,
      `DESCRIPTION:${escapeIcs(r.detail)}`,
      'END:VEVENT',
    ].join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Group Availability//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadTextFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
