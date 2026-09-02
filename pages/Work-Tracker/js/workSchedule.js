export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MIN_DURATION_MINUTES = 15;
const MAX_END_MINUTES = (24 * 60) - 1;

function padTimePart(value) {
    return String(value).padStart(2, '0');
}

export function parseTimeOfDay(value, fallback = '09:00') {
    const tryParse = (raw) => {
        const match = /^(\d{1,2}):(\d{2})$/.exec(String(raw || ''));
        if (!match) return null;
        const hours = Math.min(Math.max(Number(match[1]), 0), 23);
        const minutes = Math.min(Math.max(Number(match[2]), 0), 59);
        return { hours, minutes, label: `${padTimePart(hours)}:${padTimePart(minutes)}` };
    };
    return tryParse(value) || tryParse(fallback) || { hours: 9, minutes: 0, label: '09:00' };
}

export function timeToMinutes(value, fallback = '09:00') {
    const parsed = parseTimeOfDay(value, fallback);
    return (parsed.hours * 60) + parsed.minutes;
}

export function minutesToTime(totalMinutes) {
    const clamped = Math.min(Math.max(Number(totalMinutes) || 0, 0), MAX_END_MINUTES);
    const hours = Math.floor(clamped / 60);
    const minutes = Math.round(clamped % 60);
    return `${padTimePart(Math.min(hours, 23))}:${padTimePart(minutes === 60 ? 59 : minutes)}`;
}

export function addHoursToTime(start, hours) {
    const startMinutes = timeToMinutes(start);
    const durationMinutes = Math.max(Number(hours) || 0, 0) * 60;
    const endMinutes = Math.min(startMinutes + durationMinutes, MAX_END_MINUTES);
    if (endMinutes <= startMinutes) {
        return minutesToTime(Math.min(startMinutes + MIN_DURATION_MINUTES, MAX_END_MINUTES));
    }
    return minutesToTime(endMinutes);
}

export function getScheduleDayHours(day) {
    if (!day?.enabled) return 0;
    const startMinutes = timeToMinutes(day.start);
    const endMinutes = timeToMinutes(day.end, '17:00');
    if (endMinutes <= startMinutes) return 0;
    return (endMinutes - startMinutes) / 60;
}

function sanitizeDay(dayIndex, raw = {}, fallback = {}) {
    const enabled = Boolean(raw.enabled ?? fallback.enabled);
    const start = parseTimeOfDay(raw.start || fallback.start, '09:00').label;
    let end = parseTimeOfDay(raw.end || fallback.end, addHoursToTime(start, 8)).label;
    if (timeToMinutes(end, '17:00') <= timeToMinutes(start)) {
        end = addHoursToTime(start, 8);
        if (timeToMinutes(end) <= timeToMinutes(start)) {
            end = minutesToTime(Math.min(timeToMinutes(start) + MIN_DURATION_MINUTES, MAX_END_MINUTES));
        }
    }
    return {
        day: dayIndex,
        enabled,
        start,
        end
    };
}

export function createDefaultWorkSchedule({
    dailyHours = 8,
    workingDaysPerWeek = 5,
    defaultStartTime = '09:00'
} = {}) {
    const start = parseTimeOfDay(defaultStartTime).label;
    const end = addHoursToTime(start, dailyHours);
    const parsedDays = Number(workingDaysPerWeek);
    const daysCount = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 0), 7) : 5;
    const days = [0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
        const mondayBased = (dayIndex + 6) % 7;
        return {
            day: dayIndex,
            enabled: daysCount >= 7 ? true : mondayBased < daysCount,
            start,
            end
        };
    });
    return { days };
}

export function sanitizeWorkSchedule(raw, fallback = {}) {
    const fallbackSchedule = fallback?.days
        ? fallback
        : createDefaultWorkSchedule(fallback);
    const sourceDays = Array.isArray(raw?.days) ? raw.days : [];
    const usesDayIndex = sourceDays.some((day) => Number.isInteger(Number(day?.day)));
    const days = [0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
        const fromRaw = usesDayIndex
            ? sourceDays.find((day) => Number(day?.day) === dayIndex)
            : sourceDays[dayIndex];
        const fromFallback = fallbackSchedule.days[dayIndex];
        return sanitizeDay(dayIndex, fromRaw || {}, fromFallback || {});
    });
    return { days };
}

export function serializeWorkSchedule(schedule) {
    const sanitized = sanitizeWorkSchedule(schedule);
    return {
        days: sanitized.days.map((day) => ({
            day: day.day,
            enabled: day.enabled,
            start: day.start,
            end: day.end
        }))
    };
}

export function getScheduleDayConfig(schedule, date) {
    const sanitized = sanitizeWorkSchedule(schedule);
    const dayIndex = date instanceof Date ? date.getDay() : Number(date);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return null;
    return sanitized.days[dayIndex];
}

export function getEnabledScheduleDay(schedule, date) {
    const day = getScheduleDayConfig(schedule, date);
    if (!day?.enabled || getScheduleDayHours(day) <= 0) return null;
    return day;
}

export function getScheduleWorkingDayCount(schedule) {
    return sanitizeWorkSchedule(schedule).days.filter((day) => day.enabled && getScheduleDayHours(day) > 0).length;
}

export function getScheduleHoursPerWeek(schedule) {
    return sanitizeWorkSchedule(schedule).days.reduce((sum, day) => sum + getScheduleDayHours(day), 0);
}

export function getScheduleAverageDailyHours(schedule) {
    const count = getScheduleWorkingDayCount(schedule);
    if (count <= 0) return 0;
    return getScheduleHoursPerWeek(schedule) / count;
}

export function getSchedulePrimaryStartTime(schedule) {
    const enabled = sanitizeWorkSchedule(schedule).days.find((day) => day.enabled && getScheduleDayHours(day) > 0);
    return enabled?.start || '09:00';
}

export function orderedWeekdayIndexes(startOfWeek = 0) {
    const start = ((Number(startOfWeek) || 0) % 7 + 7) % 7;
    return [0, 1, 2, 3, 4, 5, 6].map((offset) => (start + offset) % 7);
}

export function formatScheduleSummary(schedule) {
    const hours = getScheduleHoursPerWeek(schedule);
    const days = getScheduleWorkingDayCount(schedule);
    if (days <= 0) return 'No working days set';
    const hourLabel = Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
    return `${days} day${days === 1 ? '' : 's'} · ${hourLabel} / week`;
}
