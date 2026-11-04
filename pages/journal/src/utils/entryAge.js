import { addMonths, differenceInCalendarDays, differenceInMonths, isValid, parseISO } from 'date-fns';

export function formatEntryAge(dateKey, todayKey) {
    const entry = parseISO(dateKey || '');
    const today = parseISO(todayKey || '');
    if (!isValid(entry) || !isValid(today) || today < entry) return '';
    if (differenceInCalendarDays(today, entry) === 0) return 'Today';
    const months = differenceInMonths(today, entry);
    const remainingDays = differenceInCalendarDays(today, addMonths(entry, months));
    const weeks = Math.floor(remainingDays / 7);
    const days = remainingDays % 7;
    return [[months, 'month'], [weeks, 'week'], [days, 'day']]
        .filter(([value]) => value > 0)
        .map(([value, unit]) => `${value} ${unit}${value === 1 ? '' : 's'}`)
        .join(', ');
}
