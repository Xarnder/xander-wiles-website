import { getCalendarDateKey, getStartOfWeekDate, parseCsvExportDate, toTimestampMs } from './utils.js';

export const PAY_SCALES = {
    HOUR: 'hour',
    DAY: 'day',
    WEEK: 'week',
    MONTH: 'month',
    YEAR: 'year'
};

export const PAY_SCALE_ORDER = [
    PAY_SCALES.HOUR,
    PAY_SCALES.DAY,
    PAY_SCALES.WEEK,
    PAY_SCALES.MONTH,
    PAY_SCALES.YEAR
];

const PAY_SCALE_LABELS = {
    [PAY_SCALES.HOUR]: ['hour', 'hours'],
    [PAY_SCALES.DAY]: ['day', 'days'],
    [PAY_SCALES.WEEK]: ['week', 'weeks'],
    [PAY_SCALES.MONTH]: ['month', 'months'],
    [PAY_SCALES.YEAR]: ['year', 'years']
};

const UNIT_PROGRESS_LABELS = {
    [PAY_SCALES.HOUR]: 'This week',
    [PAY_SCALES.DAY]: 'Today',
    [PAY_SCALES.WEEK]: 'This week',
    [PAY_SCALES.MONTH]: 'This month',
    [PAY_SCALES.YEAR]: 'This year'
};

export function createPayPeriodId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function formatPayScaleLabel(scale, amount = 1) {
    const labels = PAY_SCALE_LABELS[scale] || PAY_SCALE_LABELS[PAY_SCALES.MONTH];
    return Number(amount) === 1 ? labels[0] : labels[1];
}

export function formatPayRate(amount, scale, currency = '£') {
    const value = Number(amount);
    const safeAmount = Number.isFinite(value) ? value : 0;
    return `${currency}${safeAmount.toFixed(2)} / ${formatPayScaleLabel(scale)}`;
}

export function getDefaultPayPeriodName(scale) {
    const labels = {
        [PAY_SCALES.HOUR]: 'Hourly pay',
        [PAY_SCALES.DAY]: 'Daily pay',
        [PAY_SCALES.WEEK]: 'Weekly pay',
        [PAY_SCALES.MONTH]: 'Monthly pay',
        [PAY_SCALES.YEAR]: 'Yearly pay'
    };
    return labels[scale] || labels[PAY_SCALES.MONTH];
}

export function formatDateKey(date) {
    return getCalendarDateKey(date instanceof Date ? date : new Date(date));
}

export function parseDateKey(dateKey) {
    return parseCsvExportDate(dateKey);
}

export function getStartOfDayMs(date = new Date()) {
    const value = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    value.setHours(0, 0, 0, 0);
    return value.getTime();
}

function clampWorkHours(hours) {
    const parsed = Number(hours);
    if (!Number.isFinite(parsed) || parsed <= 0) return 8;
    return Math.min(Math.max(parsed, 0.25), 24);
}

function clampWorkingDays(days) {
    const parsed = Number(days);
    if (!Number.isFinite(parsed)) return 5;
    return Math.min(Math.max(parsed, 1), 7);
}

export function sanitizePayPeriod(period = {}, fallback = {}) {
    const scale = PAY_SCALE_ORDER.includes(period.scale) ? period.scale : PAY_SCALES.MONTH;
    const amount = Number(period.amount);
    const startDate = typeof period.startDate === 'string' && parseDateKey(period.startDate)
        ? period.startDate
        : (fallback.startDate || formatDateKey(new Date()));
    const rawEnd = period.endDate == null || period.endDate === '' ? null : String(period.endDate);
    const endDate = rawEnd && parseDateKey(rawEnd) ? rawEnd : null;
    const startMs = parseDateKey(startDate)?.getTime();
    const endMs = endDate ? parseDateKey(endDate)?.getTime() : null;
    const orderedEndDate = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs
        ? startDate
        : endDate;

    return {
        id: period.id || fallback.id || createPayPeriodId(),
        name: String(period.name || '').trim(),
        amount: Number.isFinite(amount) ? Math.min(Math.max(amount, 0), 100000000) : 0,
        scale,
        startDate,
        endDate: orderedEndDate,
        company: String(period.company || '').trim(),
        dailyHours: clampWorkHours(period.dailyHours ?? fallback.dailyHours),
        workingDaysPerWeek: clampWorkingDays(period.workingDaysPerWeek ?? fallback.workingDaysPerWeek)
    };
}

export function sanitizePayPeriods(periods) {
    if (!Array.isArray(periods)) return [];
    return periods.map((period) => sanitizePayPeriod(period)).filter((period) => period.amount > 0);
}

export function getPayPeriodDisplayName(period) {
    const sanitized = sanitizePayPeriod(period);
    return sanitized.name || getDefaultPayPeriodName(sanitized.scale);
}

export function getPayPeriodBounds(period) {
    const sanitized = sanitizePayPeriod(period);
    const start = parseDateKey(sanitized.startDate);
    if (!start) {
        return { startMs: NaN, endMs: NaN };
    }

    start.setHours(0, 0, 0, 0);
    if (!sanitized.endDate) {
        return { startMs: start.getTime(), endMs: Infinity };
    }

    const end = parseDateKey(sanitized.endDate);
    if (!end) {
        return { startMs: start.getTime(), endMs: Infinity };
    }

    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    return { startMs: start.getTime(), endMs: end.getTime() };
}

export function isPayPeriodActive(period, now = new Date()) {
    const nowMs = toTimestampMs(now);
    if (!Number.isFinite(nowMs)) return false;
    const { startMs, endMs } = getPayPeriodBounds(period);
    return Number.isFinite(startMs) && nowMs >= startMs && nowMs < endMs;
}

function getAccrualSpec(period) {
    const sanitized = sanitizePayPeriod(period);
    if (sanitized.scale === PAY_SCALES.HOUR) {
        return {
            scale: PAY_SCALES.WEEK,
            amount: sanitized.amount * sanitized.dailyHours * sanitized.workingDaysPerWeek
        };
    }
    return { scale: sanitized.scale, amount: sanitized.amount };
}

export function getPayUnitBounds(scale, date, startOfWeek = 0) {
    const source = date instanceof Date ? date : new Date(date);

    if (scale === PAY_SCALES.DAY) {
        const start = new Date(source);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { start, end };
    }

    if (scale === PAY_SCALES.WEEK) {
        const start = getStartOfWeekDate(source, startOfWeek);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        return { start, end };
    }

    if (scale === PAY_SCALES.YEAR) {
        const start = new Date(source.getFullYear(), 0, 1);
        const end = new Date(source.getFullYear() + 1, 0, 1);
        return { start, end };
    }

    const start = new Date(source.getFullYear(), source.getMonth(), 1);
    const end = new Date(source.getFullYear(), source.getMonth() + 1, 1);
    return { start, end };
}

function overlapMs(startA, endA, startB, endB) {
    return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function forEachPayUnit(scale, fromMs, toMs, startOfWeek, onUnit) {
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return;

    let cursorMs = fromMs;
    let guard = 0;

    while (cursorMs < toMs && guard < 20000) {
        guard += 1;
        const { start, end } = getPayUnitBounds(scale, new Date(cursorMs), startOfWeek);
        const unitStart = start.getTime();
        const unitEnd = end.getTime();
        if (!Number.isFinite(unitStart) || !Number.isFinite(unitEnd) || unitEnd <= unitStart) break;

        if (unitEnd > fromMs && unitStart < toMs) {
            onUnit(unitStart, unitEnd);
        }

        cursorMs = unitEnd;
    }
}

export function computePayPeriodEarnings(period, windowStart, windowEnd, now = new Date(), options = {}) {
    const sanitized = sanitizePayPeriod(period);
    if (sanitized.amount <= 0) return 0;

    const nowMs = toTimestampMs(now);
    if (!Number.isFinite(nowMs)) return 0;

    const { startMs: periodStartMs, endMs: periodEndMs } = getPayPeriodBounds(sanitized);
    if (!Number.isFinite(periodStartMs)) return 0;

    const windowStartMs = windowStart == null ? -Infinity : toTimestampMs(windowStart);
    const windowEndMs = windowEnd == null ? nowMs : toTimestampMs(windowEnd);
    if (windowStart != null && !Number.isFinite(windowStartMs)) return 0;
    if (windowEnd != null && !Number.isFinite(windowEndMs)) return 0;

    const fromMs = Math.max(periodStartMs, windowStartMs);
    const toMs = Math.min(periodEndMs, windowEndMs, nowMs);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return 0;

    const { scale, amount } = getAccrualSpec(sanitized);
    const startOfWeek = options.startOfWeek ?? 0;
    let total = 0;

    forEachPayUnit(scale, fromMs, toMs, startOfWeek, (unitStart, unitEnd) => {
        const unitMs = unitEnd - unitStart;
        if (unitMs <= 0) return;
        total += amount * (overlapMs(fromMs, toMs, unitStart, unitEnd) / unitMs);
    });

    return total;
}

export function computePayEarningsInWindow(periods, windowStart, windowEnd, now = new Date(), options = {}) {
    return (Array.isArray(periods) ? periods : []).reduce((sum, period) => (
        sum + computePayPeriodEarnings(period, windowStart, windowEnd, now, options)
    ), 0);
}

export function getCurrentPayUnitProgress(period, now = new Date(), options = {}) {
    const sanitized = sanitizePayPeriod(period);
    const { scale, amount } = getAccrualSpec(sanitized);
    const { start, end } = getPayUnitBounds(scale, now, options.startOfWeek ?? 0);
    const unitStart = start.getTime();
    const unitEnd = end.getTime();
    const unitMs = Math.max(unitEnd - unitStart, 1);
    const nowMs = toTimestampMs(now);
    const { startMs: periodStartMs, endMs: periodEndMs } = getPayPeriodBounds(sanitized);

    const coveredMs = overlapMs(periodStartMs, periodEndMs, unitStart, unitEnd);
    const accruedMs = Number.isFinite(nowMs)
        ? overlapMs(periodStartMs, Math.min(periodEndMs, nowMs), unitStart, Math.min(unitEnd, nowMs))
        : 0;

    return {
        scale,
        amount,
        start,
        end,
        contracted: amount * (coveredMs / unitMs),
        accrued: amount * (accruedMs / unitMs),
        label: UNIT_PROGRESS_LABELS[sanitized.scale] || UNIT_PROGRESS_LABELS[PAY_SCALES.MONTH]
    };
}

export function getCurrentUnitAccrued(period, now = new Date(), options = {}) {
    if (!isPayPeriodActive(period, now)) return 0;
    return getCurrentPayUnitProgress(period, now, options).accrued;
}

export function sumCurrentUnitAccrued(periods, now = new Date(), options = {}) {
    return (Array.isArray(periods) ? periods : []).reduce((sum, period) => (
        sum + getCurrentUnitAccrued(period, now, options)
    ), 0);
}

export function getEquivalentHourlyRate(period, now = new Date()) {
    const sanitized = sanitizePayPeriod(period);
    const hoursPerWeek = sanitized.dailyHours * sanitized.workingDaysPerWeek;
    if (hoursPerWeek <= 0) return 0;

    if (sanitized.scale === PAY_SCALES.HOUR) return sanitized.amount;
    if (sanitized.scale === PAY_SCALES.DAY) return sanitized.amount / sanitized.dailyHours;
    if (sanitized.scale === PAY_SCALES.WEEK) return sanitized.amount / hoursPerWeek;
    if (sanitized.scale === PAY_SCALES.YEAR) return sanitized.amount / (hoursPerWeek * (365.25 / 7));

    const { start, end } = getPayUnitBounds(PAY_SCALES.MONTH, now);
    const daysInMonth = (end.getTime() - start.getTime()) / 86400000;
    const weeksInMonth = daysInMonth / 7;
    return sanitized.amount / (hoursPerWeek * weeksInMonth);
}

export function getCombinedEquivalentHourlyRate(periods, now = new Date()) {
    return (Array.isArray(periods) ? periods : [])
        .filter((period) => isPayPeriodActive(period, now))
        .reduce((sum, period) => sum + getEquivalentHourlyRate(period, now), 0);
}

export function filterPayPeriods(periods, { company = '', project = '' } = {}) {
    const list = Array.isArray(periods) ? periods : [];
    if (project) return [];

    if (!company) return [...list];

    return list.filter((period) => String(period.company || '').trim() === company);
}

export function payPeriodCoversDay(period, day) {
    const dayStart = getStartOfDayMs(day);
    const dayEnd = dayStart + 86400000;
    const { startMs, endMs } = getPayPeriodBounds(period);
    return Number.isFinite(startMs) && dayEnd > startMs && dayStart < endMs;
}

export function accumulateDailyPayEarnings(periods, rangeStart, rangeEnd, now = new Date(), options = {}) {
    const daily = {};
    const start = rangeStart instanceof Date ? new Date(rangeStart.getTime()) : new Date(rangeStart);
    const end = rangeEnd instanceof Date ? new Date(rangeEnd.getTime()) : new Date(rangeEnd);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    for (let cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
        const dayStart = new Date(cursor);
        const dayEnd = new Date(cursor);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const amount = computePayEarningsInWindow(periods, dayStart, dayEnd, now, options);
        if (amount > 0) {
            daily[formatDateKey(dayStart)] = amount;
        }
    }

    return daily;
}

export function getPayCompanyLabel(period) {
    const company = String(period?.company || '').trim();
    return company || 'Unassigned';
}

export function getPayPeriodDateLabel(period) {
    const sanitized = sanitizePayPeriod(period);
    const start = parseDateKey(sanitized.startDate);
    if (!start) return '';

    const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    if (!sanitized.endDate) return `From ${startLabel}`;

    const end = parseDateKey(sanitized.endDate);
    if (!end) return `From ${startLabel}`;
    const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startLabel} – ${endLabel}`;
}

export function serializePayPeriod(period) {
    const sanitized = sanitizePayPeriod(period);
    return {
        name: sanitized.name,
        amount: sanitized.amount,
        scale: sanitized.scale,
        startDate: sanitized.startDate,
        endDate: sanitized.endDate,
        company: sanitized.company,
        dailyHours: sanitized.dailyHours,
        workingDaysPerWeek: sanitized.workingDaysPerWeek
    };
}

export function getWorkSettingsFromState(appState = {}) {
    return {
        dailyHours: clampWorkHours(appState.tcDailyHours),
        workingDaysPerWeek: clampWorkingDays(appState.tcWorkingDaysPerWeek),
        startOfWeek: Number.isFinite(Number(appState.startOfWeek)) ? Number(appState.startOfWeek) : 0
    };
}
