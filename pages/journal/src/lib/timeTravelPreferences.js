const STORAGE_KEY = 'journal-time-travel-period';

function defaults() {
    return { offset: { years: 0, months: 4, weeks: 2, days: 0 }, direction: 'backward' };
}

function normalize(value) {
    if (!value || !['backward', 'forward'].includes(value.direction)) return defaults();
    const offset = {};
    for (const unit of ['years', 'months', 'weeks', 'days']) {
        const amount = value.offset?.[unit];
        if (!Number.isSafeInteger(amount) || amount < 0 || amount > 10000) return defaults();
        offset[unit] = amount;
    }
    // Store the period only: today's date must be recalculated on every visit.
    return { offset, direction: value.direction };
}

export function loadTimeTravelPeriod() {
    try {
        return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch {
        return defaults();
    }
}

export function saveTimeTravelPeriod(offset, direction) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize({ offset, direction })));
    } catch {
        // Storage may be unavailable; calculations must still work in memory.
    }
}
