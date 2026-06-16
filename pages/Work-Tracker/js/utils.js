export function getStartOfWeekDate(d, offsetDays = 0) {
    // offsetDays: 0 = Sunday, 1 = Monday
    const date = new Date(d);
    let day = date.getDay();
    // Calculate difference to get back to the start of the defined week
    const diff = date.getDate() - day + (day < offsetDays ? -7 : 0) + offsetDays;

    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

export function formatDuration(ms) {
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
        return `${minutes}m`;
    } else if (minutes === 0) {
        return `${hours}h`;
    } else {
        return `${hours}h ${minutes}m`;
    }
}

export function formatDateTimeLocal(dateInput) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}

export function toTimestampMs(value) {
    if (value == null) return NaN;
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : NaN;
}

export function getSessionTimeRange(session) {
    const startMs = toTimestampMs(session.startTime);
    const durationMs = Number(session.durationMs);
    const explicitEndMs = toTimestampMs(session.endTime);
    const endMs = Number.isFinite(explicitEndMs)
        ? explicitEndMs
        : startMs + (Number.isFinite(durationMs) ? durationMs : 0);

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;

    return { startMs, endMs, durationMs: endMs - startMs };
}

export function getSessionOverlapMs(session, windowStart, windowEnd) {
    const range = getSessionTimeRange(session);
    if (!range) return 0;

    const windowStartMs = toTimestampMs(windowStart);
    const windowEndMs = toTimestampMs(windowEnd);
    if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs)) return 0;

    const overlapStart = Math.max(range.startMs, windowStartMs);
    const overlapEnd = Math.min(range.endMs, windowEndMs);
    return Math.max(overlapEnd - overlapStart, 0);
}
