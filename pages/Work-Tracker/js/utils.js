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

export function computeWorkPatternAnalytics(sessions, windowStart, windowEnd, afterCutsFn = (amount) => amount, breaks = []) {
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
                const segmentBreakMs = getBreakOverlapMs(breaks, segmentStart, segmentEnd);
                const segmentMs = Math.max(0, (segmentEnd - segmentStart) - segmentBreakMs);

                entry.ms += segmentMs;
                entry.earnings += (Number(session.earnings) || 0) * overlapRatio * (
                    segmentEnd - segmentStart > 0
                        ? segmentMs / (segmentEnd - segmentStart)
                        : 0
                );

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

export function formatDurationDetailed(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "0s";

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(" ");
}

export function formatDateTimeLocal(dateInput) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}

export function formatCsvDate(dateInput) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function formatCsvTime(dateInput) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
}

export function msToDecimalHours(ms) {
    if (!Number.isFinite(ms)) return "0.00";
    return (ms / (1000 * 60 * 60)).toFixed(2);
}

export function escapeCsvValue(val) {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export function getSessionEndTime(session) {
    const range = getSessionTimeRange(session);
    return range ? range.endMs : toTimestampMs(session.startTime);
}

export function formatCsvDateTime(dateInput) {
    const ms = toTimestampMs(dateInput);
    if (!Number.isFinite(ms)) return "";
    return `${formatCsvDate(ms)} ${formatCsvTime(ms)}`;
}

export function getSessionBreakPeriods(session, breaks) {
    const range = getSessionTimeRange(session);
    if (!range || !Array.isArray(breaks)) return [];

    return breaks
        .map((breakItem) => {
            const breakRange = getSessionTimeRange(breakItem);
            if (!breakRange) return null;

            const overlapStart = Math.max(range.startMs, breakRange.startMs);
            const overlapEnd = Math.min(range.endMs, breakRange.endMs);
            if (overlapEnd <= overlapStart) return null;

            return {
                startMs: overlapStart,
                endMs: overlapEnd,
                durationMs: overlapEnd - overlapStart,
                label: breakItem.label || "Break"
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.startMs - b.startMs);
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

function getTimeRangeFromRecord(record) {
    return getSessionTimeRange(record);
}

export function getMergedBreakRanges(breaks) {
    if (!Array.isArray(breaks) || breaks.length === 0) return [];

    const ranges = breaks
        .map(getTimeRangeFromRecord)
        .filter(Boolean)
        .map(({ startMs, endMs }) => ({ startMs, endMs }))
        .sort((a, b) => a.startMs - b.startMs);

    if (!ranges.length) return [];

    const merged = [{ ...ranges[0] }];
    for (let i = 1; i < ranges.length; i += 1) {
        const current = ranges[i];
        const last = merged[merged.length - 1];
        if (current.startMs <= last.endMs) {
            last.endMs = Math.max(last.endMs, current.endMs);
        } else {
            merged.push({ ...current });
        }
    }

    return merged;
}

export function getBreakOverlapMs(breaks, rangeStartMs, rangeEndMs) {
    const startMs = toTimestampMs(rangeStartMs);
    const endMs = toTimestampMs(rangeEndMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;

    return getMergedBreakRanges(breaks).reduce((total, breakRange) => {
        const overlapStart = Math.max(breakRange.startMs, startMs);
        const overlapEnd = Math.min(breakRange.endMs, endMs);
        return total + Math.max(overlapEnd - overlapStart, 0);
    }, 0);
}

export function getEffectiveSessionMetrics(session, breaks = []) {
    const range = getSessionTimeRange(session);
    if (!range) {
        return {
            grossDurationMs: 0,
            effectiveDurationMs: 0,
            breakMs: 0,
            grossEarnings: 0,
            effectiveEarnings: 0
        };
    }

    const breakMs = getBreakOverlapMs(breaks, range.startMs, range.endMs);
    const grossDurationMs = range.durationMs;
    const effectiveDurationMs = Math.max(0, grossDurationMs - breakMs);
    const grossEarnings = Number(session.earnings) || 0;
    const ratio = grossDurationMs > 0 ? effectiveDurationMs / grossDurationMs : 0;

    return {
        grossDurationMs,
        effectiveDurationMs,
        breakMs,
        grossEarnings,
        effectiveEarnings: grossEarnings * ratio
    };
}

export function getEffectiveSessionOverlapMs(session, breaks, windowStart, windowEnd) {
    const grossOverlapMs = getSessionOverlapMs(session, windowStart, windowEnd);
    if (grossOverlapMs <= 0) return 0;

    const range = getSessionTimeRange(session);
    if (!range) return 0;

    const windowStartMs = toTimestampMs(windowStart);
    const windowEndMs = toTimestampMs(windowEnd);
    const overlapStart = Math.max(range.startMs, windowStartMs);
    const overlapEnd = Math.min(range.endMs, windowEndMs);
    const breakMs = getBreakOverlapMs(breaks, overlapStart, overlapEnd);

    return Math.max(0, grossOverlapMs - breakMs);
}

export function calculateRollingPeriodTotals(sessions, start, end, breaks = []) {
    let totalMs = 0;
    let totalGrossMs = 0;
    let totalEarnings = 0;
    let totalGrossEarnings = 0;
    let totalBreakMs = 0;

    sessions.forEach((data) => {
        const grossOverlapMs = getSessionOverlapMs(data, start, end);
        if (grossOverlapMs <= 0) return;

        const effectiveOverlapMs = getEffectiveSessionOverlapMs(data, breaks, start, end);
        const sessionDurationMs = Number(data.durationMs) || grossOverlapMs;
        const grossRatio = sessionDurationMs > 0 ? grossOverlapMs / sessionDurationMs : 1;
        const effectiveRatio = sessionDurationMs > 0 ? effectiveOverlapMs / sessionDurationMs : 1;

        totalGrossMs += grossOverlapMs;
        totalMs += effectiveOverlapMs;
        totalBreakMs += grossOverlapMs - effectiveOverlapMs;
        totalGrossEarnings += (Number(data.earnings) || 0) * grossRatio;
        totalEarnings += (Number(data.earnings) || 0) * effectiveRatio;
    });

    return { totalMs, totalGrossMs, totalEarnings, totalGrossEarnings, totalBreakMs };
}

export function calculateCalendarPeriodTotals(sessions, periodStart, breaks = []) {
    let totalMs = 0;
    let totalGrossMs = 0;
    let totalEarnings = 0;
    let totalGrossEarnings = 0;
    let totalBreakMs = 0;

    sessions.forEach((session) => {
        const dateObj = new Date(session.startTime);
        if (dateObj < periodStart) return;

        const metrics = getEffectiveSessionMetrics(session, breaks);
        totalGrossMs += metrics.grossDurationMs;
        totalMs += metrics.effectiveDurationMs;
        totalBreakMs += metrics.breakMs;
        totalGrossEarnings += metrics.grossEarnings;
        totalEarnings += metrics.effectiveEarnings;
    });

    return { totalMs, totalGrossMs, totalEarnings, totalGrossEarnings, totalBreakMs };
}

const CSV_MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export function computeMonthlyTotals(sessions, breaks = []) {
    const monthKeys = new Set();

    sessions.forEach((session) => {
        const range = getSessionTimeRange(session);
        if (!range) return;

        const cursor = new Date(range.startMs);
        cursor.setDate(1);
        cursor.setHours(0, 0, 0, 0);

        while (cursor.getTime() < range.endMs) {
            monthKeys.add(`${cursor.getFullYear()}-${cursor.getMonth()}`);
            cursor.setMonth(cursor.getMonth() + 1);
        }
    });

    return Array.from(monthKeys)
        .map((key) => {
            const [yearStr, monthStr] = key.split('-');
            const year = Number(yearStr);
            const month = Number(monthStr);
            const start = new Date(year, month, 1, 0, 0, 0, 0);
            const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
            const lastDay = new Date(year, month + 1, 0);
            const totals = calculateRollingPeriodTotals(sessions, start, end, breaks);

            return {
                label: `${CSV_MONTH_NAMES[month]} ${year}`,
                periodStart: formatCsvDate(start),
                periodEnd: formatCsvDate(lastDay),
                totalNetMs: totals.totalMs,
                totalNetEarnings: totals.totalEarnings
            };
        })
        .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
}

export function parseCsvExportDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;

    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day, 0, 0, 0, 0);

    if (
        date.getFullYear() !== year
        || date.getMonth() !== month
        || date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

export function computeCustomPeriodTotals(sessions, breaks, fromDateStr, toDateStr) {
    const fromDate = parseCsvExportDate(fromDateStr);
    const toDate = parseCsvExportDate(toDateStr);
    if (!fromDate || !toDate) return null;

    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(toDate);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);

    if (end <= start) return null;

    const lastInclusiveDay = new Date(toDate);
    lastInclusiveDay.setHours(0, 0, 0, 0);
    const totals = calculateRollingPeriodTotals(sessions, start, end, breaks);

    return {
        label: `${formatCsvDate(start)} to ${formatCsvDate(lastInclusiveDay)}`,
        periodStart: formatCsvDate(start),
        periodEnd: formatCsvDate(lastInclusiveDay),
        totalNetMs: totals.totalMs,
        totalNetEarnings: totals.totalEarnings
    };
}

export function normalizeSessionCompany(session) {
    const company = String(session.company || '').trim();
    return company || 'Unassigned';
}

export const CSV_UNASSIGNED_COMPANY = '__unassigned__';

export function filterSessionsForCsvExport(sessions, companyFilter = '') {
    if (!companyFilter) return [...sessions];

    return sessions.filter((session) => {
        const company = normalizeSessionCompany(session);
        if (companyFilter === CSV_UNASSIGNED_COMPANY) {
            return company === 'Unassigned';
        }
        return company === companyFilter;
    });
}

export function computeCompanyTotalsForPeriod(sessions, breaks, start, end) {
    const companyMap = new Map();

    sessions.forEach((session) => {
        const grossOverlapMs = getSessionOverlapMs(session, start, end);
        if (grossOverlapMs <= 0) return;

        const effectiveOverlapMs = getEffectiveSessionOverlapMs(session, breaks, start, end);
        const sessionDurationMs = Number(session.durationMs) || grossOverlapMs;
        const effectiveRatio = sessionDurationMs > 0 ? effectiveOverlapMs / sessionDurationMs : 1;
        const company = normalizeSessionCompany(session);

        const entry = companyMap.get(company) || { totalNetMs: 0, totalNetEarnings: 0 };
        entry.totalNetMs += effectiveOverlapMs;
        entry.totalNetEarnings += (Number(session.earnings) || 0) * effectiveRatio;
        companyMap.set(company, entry);
    });

    return Array.from(companyMap.entries())
        .map(([company, totals]) => ({ company, ...totals }))
        .sort((a, b) => b.totalNetEarnings - a.totalNetEarnings || a.company.localeCompare(b.company));
}

export function computeCompanyTotalsAll(sessions, breaks = []) {
    const companyMap = new Map();

    sessions.forEach((session) => {
        const metrics = getEffectiveSessionMetrics(session, breaks);
        const company = normalizeSessionCompany(session);

        const entry = companyMap.get(company) || { totalNetMs: 0, totalNetEarnings: 0 };
        entry.totalNetMs += metrics.effectiveDurationMs;
        entry.totalNetEarnings += metrics.effectiveEarnings;
        companyMap.set(company, entry);
    });

    return Array.from(companyMap.entries())
        .map(([company, totals]) => ({ company, ...totals }))
        .sort((a, b) => b.totalNetEarnings - a.totalNetEarnings || a.company.localeCompare(b.company));
}

export function computeMonthlyTotalsByCompany(sessions, breaks = []) {
    const months = computeMonthlyTotals(sessions, breaks);
    const rows = [];

    months.forEach((month) => {
        const start = parseCsvExportDate(month.periodStart);
        const end = new Date(parseCsvExportDate(month.periodEnd));
        end.setDate(end.getDate() + 1);
        end.setHours(0, 0, 0, 0);

        computeCompanyTotalsForPeriod(sessions, breaks, start, end).forEach((entry) => {
            rows.push({
                month: month.label,
                periodStart: month.periodStart,
                periodEnd: month.periodEnd,
                company: entry.company,
                totalNetMs: entry.totalNetMs,
                totalNetEarnings: entry.totalNetEarnings
            });
        });
    });

    return rows;
}

export function computeCustomPeriodTotalsByCompany(sessions, breaks, fromDateStr, toDateStr) {
    const fromDate = parseCsvExportDate(fromDateStr);
    const toDate = parseCsvExportDate(toDateStr);
    if (!fromDate || !toDate) return [];

    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(toDate);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);

    if (end <= start) return [];

    const lastInclusiveDay = new Date(toDate);
    lastInclusiveDay.setHours(0, 0, 0, 0);
    const periodStart = formatCsvDate(start);
    const periodEnd = formatCsvDate(lastInclusiveDay);
    const label = `${periodStart} to ${periodEnd}`;

    return computeCompanyTotalsForPeriod(sessions, breaks, start, end).map((entry) => ({
        label,
        periodStart,
        periodEnd,
        company: entry.company,
        totalNetMs: entry.totalNetMs,
        totalNetEarnings: entry.totalNetEarnings
    }));
}
