export const STATS_PERIOD_MODES = {
    CALENDAR: 'calendar',
    ROLLING: 'rolling'
};

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export function getMonthlyStatsConfig(mode, now = new Date()) {
    if (mode === STATS_PERIOD_MODES.ROLLING) {
        const start = new Date(now);
        start.setDate(now.getDate() - 30);
        start.setHours(0, 0, 0, 0);

        return {
            start,
            end: now,
            shortLabel: 'Last 30 Days',
            hoursLabel: "Last 30 Days' Hours",
            earningsLabel: "Last 30 Days' Earnings",
            cutStatsLabel: 'Last 30 Days',
            hint: 'Rolling total for the past 30 days, updated continuously.'
        };
    }

    const start = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
        start,
        end: now,
        shortLabel: 'Month to Date',
        hoursLabel: 'Month to Date Hours',
        earningsLabel: 'Month to Date Earnings',
        cutStatsLabel: 'Month to Date',
        hint: `Totals since ${MONTH_NAMES[now.getMonth()]} 1 — the start of this calendar month.`
    };
}

export function calculateRollingPeriodTotals(sessions, start, end) {
    let totalMs = 0;
    let totalEarnings = 0;

    sessions.forEach((data) => {
        const overlapMs = getSessionOverlapMs(data, start, end);
        if (overlapMs > 0) {
            const sessionDurationMs = Number(data.durationMs) || overlapMs;
            const overlapRatio = sessionDurationMs > 0 ? overlapMs / sessionDurationMs : 1;
            totalMs += overlapMs;
            totalEarnings += (Number(data.earnings) || 0) * overlapRatio;
        }
    });

    return { totalMs, totalEarnings };
}

const STATS_PERIOD_UNIT_LABELS = {
    minutes: ['minute', 'minutes'],
    hours: ['hour', 'hours'],
    days: ['day', 'days'],
    weeks: ['week', 'weeks'],
    months: ['month', 'months'],
    years: ['year', 'years']
};

export function formatStatsPeriodUnit(amount, unit) {
    const labels = STATS_PERIOD_UNIT_LABELS[unit] || STATS_PERIOD_UNIT_LABELS.days;
    const label = amount === 1 ? labels[0] : labels[1];
    return `${amount} ${label}`;
}

export function getCustomStatsPeriodConfig(period, now = new Date()) {
    const amount = Number(period.amount) || 0;
    const unit = period.unit || 'days';
    const end = now;
    const start = new Date(now);

    switch (unit) {
        case 'minutes':
            start.setTime(now.getTime() - amount * 60 * 1000);
            break;
        case 'hours':
            start.setTime(now.getTime() - amount * 60 * 60 * 1000);
            break;
        case 'days':
            start.setDate(now.getDate() - amount);
            start.setHours(0, 0, 0, 0);
            break;
        case 'weeks':
            start.setDate(now.getDate() - amount * 7);
            start.setHours(0, 0, 0, 0);
            break;
        case 'months':
            start.setMonth(now.getMonth() - amount);
            start.setHours(0, 0, 0, 0);
            break;
        case 'years':
            start.setFullYear(now.getFullYear() - amount);
            start.setHours(0, 0, 0, 0);
            break;
        default:
            start.setDate(now.getDate() - amount);
            start.setHours(0, 0, 0, 0);
            break;
    }

    const unitLabel = formatStatsPeriodUnit(amount, unit);
    const shortLabel = `Last ${unitLabel}`;

    return {
        start,
        end,
        shortLabel,
        hoursLabel: `${shortLabel} Hours`,
        earningsLabel: `${shortLabel} Earnings`,
        hint: `Rolling total for the past ${unitLabel}.`
    };
}

export function formatClockTimeFromMs(ms) {
    if (!Number.isFinite(ms)) return '—';
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatWorkPatternDay(dayKey) {
    if (!dayKey) return '—';
    const [year, month, day] = dayKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatAverageClockTime(totalMinutes) {
    if (!Number.isFinite(totalMinutes)) return '—';

    const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hours = Math.floor(normalized / 60);
    const minutes = Math.round(normalized % 60);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getDayKeyFromMs(ms) {
    const date = new Date(ms);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getStartOfDayMs(ms) {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

export function computeWorkPatternAnalytics(sessions, windowStart, windowEnd, afterCutsFn = (amount) => amount) {
    const emptyResult = {
        daysWorked: 0,
        totalMs: 0,
        avgHoursPerWeek: null,
        avgDaysPerWeek: null,
        avgHoursPerDay: null,
        avgFirstStartMinutes: null,
        avgLastEndMinutes: null,
        earliestStartMs: null,
        earliestStartDayKey: null,
        latestEndMs: null,
        latestEndDayKey: null,
        avgEarningsBefore: null,
        avgEarningsAfter: null
    };

    const windowStartMs = toTimestampMs(windowStart);
    const windowEndMs = toTimestampMs(windowEnd);
    if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs) || windowEndMs <= windowStartMs) {
        return emptyResult;
    }

    const dayMap = new Map();

    sessions.forEach((session) => {
        const range = getSessionTimeRange(session);
        if (!range) return;

        const overlapStart = Math.max(range.startMs, windowStartMs);
        const overlapEnd = Math.min(range.endMs, windowEndMs);
        if (overlapEnd <= overlapStart) return;

        const sessionDurationMs = Number(session.durationMs) || (range.endMs - range.startMs);
        let dayCursorMs = getStartOfDayMs(overlapStart);

        while (dayCursorMs < overlapEnd) {
            const dayEndMs = dayCursorMs + 86400000;
            const segmentStart = Math.max(overlapStart, dayCursorMs);
            const segmentEnd = Math.min(overlapEnd, dayEndMs);

            if (segmentEnd > segmentStart) {
                const key = getDayKeyFromMs(dayCursorMs);
                const entry = dayMap.get(key) || {
                    ms: 0,
                    earnings: 0,
                    firstStartMs: null,
                    lastEndMs: null,
                    dayStartMs: dayCursorMs,
                    dayKey: key
                };

                const overlapRatio = sessionDurationMs > 0
                    ? (segmentEnd - segmentStart) / sessionDurationMs
                    : 1;

                entry.ms += segmentEnd - segmentStart;
                entry.earnings += (Number(session.earnings) || 0) * overlapRatio;

                if (getDayKeyFromMs(range.startMs) === key) {
                    entry.firstStartMs = entry.firstStartMs === null
                        ? range.startMs
                        : Math.min(entry.firstStartMs, range.startMs);
                }

                entry.lastEndMs = entry.lastEndMs === null
                    ? range.endMs
                    : Math.max(entry.lastEndMs, range.endMs);

                dayMap.set(key, entry);
            }

            dayCursorMs = dayEndMs;
        }
    });

    const workedDays = Array.from(dayMap.values()).filter(day => day.ms > 0);
    const daysWorked = workedDays.length;
    const totalMs = workedDays.reduce((sum, day) => sum + day.ms, 0);

    if (daysWorked === 0) {
        return emptyResult;
    }

    const periodWeeks = Math.max((windowEndMs - windowStartMs) / (7 * 86400000), 1 / 7);
    const avgHoursPerWeek = (totalMs / (1000 * 60 * 60)) / periodWeeks;
    const avgDaysPerWeek = daysWorked / periodWeeks;
    const avgHoursPerDay = (totalMs / (1000 * 60 * 60)) / daysWorked;

    const startMinutesList = workedDays
        .filter(day => day.firstStartMs !== null)
        .map(day => (day.firstStartMs - getStartOfDayMs(day.firstStartMs)) / 60000);

    const endMinutesList = workedDays
        .filter(day => day.lastEndMs !== null)
        .map(day => (day.lastEndMs - day.dayStartMs) / 60000);

    const avgFirstStartMinutes = startMinutesList.length
        ? startMinutesList.reduce((sum, value) => sum + value, 0) / startMinutesList.length
        : null;

    const avgLastEndMinutes = endMinutesList.length
        ? endMinutesList.reduce((sum, value) => sum + value, 0) / endMinutesList.length
        : null;

    const daysWithStart = workedDays.filter(day => day.firstStartMs !== null);
    const earliestDay = daysWithStart.reduce(
        (best, day) => (!best || day.firstStartMs < best.firstStartMs ? day : best),
        null
    );

    const daysWithEnd = workedDays.filter(day => day.lastEndMs !== null);
    const latestDay = daysWithEnd.reduce(
        (best, day) => (!best || day.lastEndMs > best.lastEndMs ? day : best),
        null
    );

    const totalEarningsBefore = workedDays.reduce((sum, day) => sum + day.earnings, 0);
    const totalEarningsAfter = workedDays.reduce(
        (sum, day) => sum + afterCutsFn(day.earnings),
        0
    );

    return {
        daysWorked,
        totalMs,
        avgHoursPerWeek,
        avgDaysPerWeek,
        avgHoursPerDay,
        avgFirstStartMinutes,
        avgLastEndMinutes,
        earliestStartMs: earliestDay?.firstStartMs ?? null,
        earliestStartDayKey: earliestDay?.dayKey ?? null,
        latestEndMs: latestDay?.lastEndMs ?? null,
        latestEndDayKey: latestDay?.dayKey ?? null,
        avgEarningsBefore: totalEarningsBefore / daysWorked,
        avgEarningsAfter: totalEarningsAfter / daysWorked
    };
}

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
