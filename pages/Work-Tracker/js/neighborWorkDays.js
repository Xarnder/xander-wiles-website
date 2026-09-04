import {
    calculateRollingPeriodTotals,
    getCalendarDateKey,
    sessionOverlapsDay
} from './utils.js';
import {
    computeUncoveredSessionEarnings,
    formatDateKey,
    getCombinedHourlyRateForDay,
    getPayPeriodDisplayName,
    payPeriodCoversDay
} from './payPeriods.js';
import {
    getEnabledScheduleDay,
    getScheduleDayHours,
    parseTimeOfDay,
    WEEKDAY_LABELS
} from './workSchedule.js';

const SEARCH_LIMIT_DAYS = 45;

function startOfDay(date) {
    const value = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
}

function addDays(date, amount) {
    const value = startOfDay(date);
    value.setDate(value.getDate() + amount);
    return value;
}

function dayBounds(date) {
    const start = startOfDay(date);
    const end = addDays(start, 1);
    return { start, end };
}

export function getScheduledWorkWindow(day, options = {}) {
    const date = day instanceof Date ? day : new Date(day);
    if (Number.isNaN(date.getTime())) return null;

    const scheduleDay = options.schedule ? getEnabledScheduleDay(options.schedule, date) : null;
    if (options.schedule && !scheduleDay) return null;

    let hours;
    let startLabel;
    if (scheduleDay) {
        hours = getScheduleDayHours(scheduleDay);
        if (hours <= 0) return null;
        startLabel = scheduleDay.start;
    } else {
        hours = Number(options.dailyHours);
        if (!Number.isFinite(hours) || hours <= 0) return null;
        const workingDays = Number(options.workingDaysPerWeek);
        if (Number.isFinite(workingDays) && workingDays < 7) {
            const mondayBased = (date.getDay() + 6) % 7;
            if (mondayBased >= workingDays) return null;
        }
        startLabel = options.defaultStartTime || '09:00';
    }

    const parsedStart = parseTimeOfDay(startLabel, '09:00');
    const start = startOfDay(date);
    start.setHours(parsedStart.hours, parsedStart.minutes, 0, 0);
    const durationMs = hours * 60 * 60 * 1000;
    const end = new Date(start.getTime() + durationMs);
    const endLabel = scheduleDay?.end || `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

    return {
        dateKey: formatDateKey(date),
        startTime: start.getTime(),
        endTime: end.getTime(),
        durationMs,
        hours,
        startLabel: parsedStart.label,
        endLabel
    };
}

export function findNeighborScheduledWorkDay(now, direction, options = {}) {
    const current = now instanceof Date ? now : new Date(now);
    const nowMs = current.getTime();
    if (!Number.isFinite(nowMs)) return null;

    const step = direction === 'previous' ? -1 : 1;
    const today = startOfDay(current);

    for (let offset = 0; offset < SEARCH_LIMIT_DAYS; offset++) {
        const day = addDays(today, offset * step);
        const window = getScheduledWorkWindow(day, options);
        if (!window) continue;

        if (direction === 'previous') {
            if (window.endTime > nowMs) continue;
        } else if (window.startTime <= nowMs) {
            continue;
        }

        return { day, window };
    }

    return null;
}

export function getNeighborDayRelativeLabel(day, now = new Date()) {
    const target = startOfDay(day);
    const today = startOfDay(now);
    if (Number.isNaN(target.getTime()) || Number.isNaN(today.getTime())) return '';

    const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
    const weekday = WEEKDAY_LABELS[target.getDay()] || '';
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff < 7) return weekday;
    if (diff < 0 && diff > -7) return weekday ? `Last ${weekday}` : '';
    return weekday;
}

function coveringPayNames(periods, day) {
    return (Array.isArray(periods) ? periods : [])
        .filter((period) => payPeriodCoversDay(period, day))
        .map((period) => getPayPeriodDisplayName(period))
        .filter(Boolean);
}

export function summarizeScheduledWorkDay({
    day,
    window,
    sessions = [],
    breaks = [],
    periods = [],
    fallbackHourlyRate = 0,
    now = new Date(),
    options = {}
} = {}) {
    if (!day || !window) return null;

    const { start, end } = dayBounds(day);
    const dateKey = window.dateKey || getCalendarDateKey(day);
    const daySessions = (Array.isArray(sessions) ? sessions : []).filter((session) => sessionOverlapsDay(session, day));
    const totals = calculateRollingPeriodTotals(daySessions, start, end, breaks);
    const uncoveredEarnings = computeUncoveredSessionEarnings(daySessions, breaks, periods, start, end);
    const hourlyFromPay = getCombinedHourlyRateForDay(periods, day, options);
    const hasPay = hourlyFromPay > 0;
    const hourlyRate = hasPay ? hourlyFromPay : Math.max(Number(fallbackHourlyRate) || 0, 0);
    const scheduledHours = Number(window.hours) || 0;
    const workedHours = totals.totalMs > 0 ? totals.totalMs / 3600000 : 0;
    const grossHours = totals.totalGrossMs > 0 ? totals.totalGrossMs / 3600000 : 0;
    const breakHours = totals.totalBreakMs > 0 ? totals.totalBreakMs / 3600000 : 0;
    const hasLogged = workedHours > 0 || grossHours > 0;
    const hoursWorked = hasLogged ? workedHours : scheduledHours;
    const scheduledEarnings = hourlyRate * scheduledHours;
    const earnings = hasPay
        ? scheduledEarnings + uncoveredEarnings
        : (hasLogged ? Number(totals.totalEarnings) || 0 : scheduledEarnings);
    const payNames = coveringPayNames(periods, day);
    const nowMs = now instanceof Date ? now.getTime() : Date.now();

    return {
        dateKey,
        date: startOfDay(day),
        weekday: WEEKDAY_LABELS[startOfDay(day).getDay()] || '',
        relativeLabel: getNeighborDayRelativeLabel(day, now),
        startTime: window.startTime,
        endTime: window.endTime,
        startLabel: window.startLabel,
        endLabel: window.endLabel,
        scheduledHours,
        hoursWorked,
        workedHours,
        grossHours,
        breakHours,
        hasLogged,
        hasPay,
        sessionCount: daySessions.length,
        hourlyRate,
        earnings,
        uncoveredEarnings,
        source: hasLogged ? (hasPay ? 'logged-salary' : 'logged') : (hasPay ? 'scheduled-salary' : 'scheduled'),
        payNames,
        isFuture: window.startTime > nowMs,
        isComplete: window.endTime <= nowMs
    };
}

export function getNeighborWorkDaySummary(direction, {
    now = new Date(),
    schedule,
    sessions = [],
    breaks = [],
    periods = [],
    fallbackHourlyRate = 0,
    dailyHours,
    workingDaysPerWeek,
    defaultStartTime
} = {}) {
    const options = { schedule, dailyHours, workingDaysPerWeek, defaultStartTime };
    const found = findNeighborScheduledWorkDay(now, direction, options);
    if (!found) return null;
    return summarizeScheduledWorkDay({
        ...found,
        sessions,
        breaks,
        periods,
        fallbackHourlyRate,
        now,
        options
    });
}
