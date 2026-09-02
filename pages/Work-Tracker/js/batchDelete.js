export const BATCH_DELETE_CONFIRM_PHRASE = 'Delete Confirmation';

export const BATCH_DELETE_RANGE_MODES = {
    MONTH: 'month',
    CUSTOM: 'custom'
};

export const FIRESTORE_BATCH_LIMIT = 500;

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function pad2(value) {
    return String(value).padStart(2, '0');
}

export function currentYearMonthValue(now = new Date()) {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function formatDateInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseYearMonthInput(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    if (!Number.isInteger(year) || month < 0 || month > 11) return null;

    return { year, month };
}

export function parseLocalDateInput(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);
    if (
        date.getFullYear() !== year
        || date.getMonth() !== month
        || date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

export function monthBoundsFromValue(value) {
    const parsed = parseYearMonthInput(value);
    if (!parsed) return null;

    const start = new Date(parsed.year, parsed.month, 1);
    const endExclusive = new Date(parsed.year, parsed.month + 1, 1);
    const lastDay = new Date(endExclusive.getTime() - 1);

    return {
        year: parsed.year,
        month: parsed.month,
        startMs: start.getTime(),
        endMs: endExclusive.getTime(),
        fromDate: formatDateInput(start),
        toDate: formatDateInput(lastDay),
        label: `${MONTH_NAMES[parsed.month]} ${parsed.year}`
    };
}

function formatDayLabel(date) {
    return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export function resolveBatchDeleteRange({
    mode = BATCH_DELETE_RANGE_MODES.MONTH,
    monthValue = '',
    fromDate = '',
    toDate = ''
} = {}) {
    if (mode === BATCH_DELETE_RANGE_MODES.CUSTOM) {
        const start = parseLocalDateInput(fromDate);
        const end = parseLocalDateInput(toDate);
        if (!start || !end) {
            return {
                ok: false,
                error: 'Choose a start date and an end date for the custom period.'
            };
        }
        if (end.getTime() < start.getTime()) {
            return {
                ok: false,
                error: 'The end date must be on or after the start date.'
            };
        }

        const endExclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
        const sameDay = start.getTime() === end.getTime();
        return {
            ok: true,
            startMs: start.getTime(),
            endMs: endExclusive.getTime(),
            label: sameDay
                ? formatDayLabel(start)
                : `${formatDayLabel(start)} – ${formatDayLabel(end)}`
        };
    }

    const bounds = monthBoundsFromValue(monthValue || currentYearMonthValue());
    if (!bounds) {
        return {
            ok: false,
            error: 'Choose a month to delete entries from.'
        };
    }

    return {
        ok: true,
        startMs: bounds.startMs,
        endMs: bounds.endMs,
        label: bounds.label
    };
}

export function getEntryStartMs(entry) {
    const value = entry?.startTime;
    if (value instanceof Date) return value.getTime();
    if (value && typeof value.toMillis === 'function') return Number(value.toMillis());
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : NaN;
}

export function filterEntriesInRange(entries, startMs, endMs) {
    if (!Array.isArray(entries) || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return [];
    }

    return entries.filter((entry) => {
        const startTime = getEntryStartMs(entry);
        return Number.isFinite(startTime) && startTime >= startMs && startTime < endMs && entry?.id;
    });
}

export function selectEntriesForBatchDelete({
    sessions = [],
    breaks = [],
    includeSessions = false,
    includeBreaks = false,
    range
} = {}) {
    if (!range?.ok) {
        return {
            sessions: [],
            breaks: [],
            sessionIds: [],
            breakIds: []
        };
    }

    const selectedSessions = includeSessions
        ? filterEntriesInRange(sessions, range.startMs, range.endMs)
        : [];
    const selectedBreaks = includeBreaks
        ? filterEntriesInRange(breaks, range.startMs, range.endMs)
        : [];

    return {
        sessions: selectedSessions,
        breaks: selectedBreaks,
        sessionIds: selectedSessions.map((entry) => entry.id),
        breakIds: selectedBreaks.map((entry) => entry.id)
    };
}

function pluralize(count, singular, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`;
}

export function describeBatchDeleteSelection(selection, range, options = {}) {
    const includeSessions = options.includeSessions === true;
    const includeBreaks = options.includeBreaks === true;
    if (!includeSessions && !includeBreaks) {
        const text = 'Choose paid sessions, breaks, or both.';
        return {
            canDelete: false,
            text,
            confirmMessage: text,
            sessionCount: 0,
            breakCount: 0
        };
    }

    if (!range?.ok) {
        return {
            canDelete: false,
            text: range?.error || 'Choose a valid date range.',
            confirmMessage: range?.error || 'Choose a valid date range.',
            sessionCount: 0,
            breakCount: 0
        };
    }

    const sessionCount = selection?.sessionIds?.length || 0;
    const breakCount = selection?.breakIds?.length || 0;
    const parts = [];
    if (sessionCount) parts.push(pluralize(sessionCount, 'paid session'));
    if (breakCount) parts.push(pluralize(breakCount, 'break'));

    if (!parts.length) {
        const text = `No matching paid sessions or breaks in ${range.label}.`;
        return {
            canDelete: false,
            text,
            confirmMessage: text,
            sessionCount,
            breakCount
        };
    }

    const joined = parts.length === 1 ? parts[0] : `${parts[0]} and ${parts[1]}`;
    return {
        canDelete: true,
        text: `This will permanently delete ${joined} in ${range.label}. Monthly pay is not deleted.`,
        confirmMessage: `This will permanently delete ${joined} in ${range.label}. Please type "${BATCH_DELETE_CONFIRM_PHRASE}" to delete those entries.`,
        sessionCount,
        breakCount
    };
}

export function isBatchDeleteConfirmPhrase(value) {
    return String(value || '').trim() === BATCH_DELETE_CONFIRM_PHRASE;
}

export function chunkItems(items, size = FIRESTORE_BATCH_LIMIT) {
    const list = Array.isArray(items) ? items : [];
    const chunkSize = Number.isInteger(size) && size > 0 ? size : FIRESTORE_BATCH_LIMIT;
    const chunks = [];
    for (let index = 0; index < list.length; index += chunkSize) {
        chunks.push(list.slice(index, index + chunkSize));
    }
    return chunks;
}
