import {
    subYears,
    subMonths,
    subWeeks,
    subDays,
    addYears,
    addMonths,
    addWeeks,
    addDays,
    differenceInCalendarDays,
    format,
    parseISO,
    isValid
} from 'date-fns';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    documentId
} from 'firebase/firestore';

const DEFAULT_TIMEOUT_MS = 10000;

function withTimeout(promise, timeoutMs = DEFAULT_TIMEOUT_MS) {
    let timeoutId;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => {
                const error = new Error('Request timed out');
                error.code = 'journal/timeout';
                reject(error);
            }, timeoutMs);
        })
    ]).finally(() => window.clearTimeout(timeoutId));
}

/**
 * Calculates the exact target date by adding or subtracting years, months, weeks, and days from a base date.
 */
export function calculateTargetDate(baseDate, { years = 0, months = 0, weeks = 0, days = 0 }, direction = 'backward') {
    let current = baseDate instanceof Date && isValid(baseDate) ? new Date(baseDate.getTime()) : new Date();
    current.setHours(0, 0, 0, 0);

    const safeYears = Math.max(0, parseInt(years, 10) || 0);
    const safeMonths = Math.max(0, parseInt(months, 10) || 0);
    const safeWeeks = Math.max(0, parseInt(weeks, 10) || 0);
    const safeDays = Math.max(0, parseInt(days, 10) || 0);

    if (direction === 'forward') {
        if (safeYears > 0) current = addYears(current, safeYears);
        if (safeMonths > 0) current = addMonths(current, safeMonths);
        if (safeWeeks > 0) current = addWeeks(current, safeWeeks);
        if (safeDays > 0) current = addDays(current, safeDays);
    } else {
        if (safeYears > 0) current = subYears(current, safeYears);
        if (safeMonths > 0) current = subMonths(current, safeMonths);
        if (safeWeeks > 0) current = subWeeks(current, safeWeeks);
        if (safeDays > 0) current = subDays(current, safeDays);
    }

    return current;
}

/**
 * Formats a human-readable description of an offset (e.g. "1 year, 2 months, and 3 weeks ago", or "4 months and 2 weeks forward").
 */
export function formatOffsetDescription({ years = 0, months = 0, weeks = 0, days = 0 }, direction = 'backward', baseDateText = '') {
    const safeYears = Math.max(0, parseInt(years, 10) || 0);
    const safeMonths = Math.max(0, parseInt(months, 10) || 0);
    const safeWeeks = Math.max(0, parseInt(weeks, 10) || 0);
    const safeDays = Math.max(0, parseInt(days, 10) || 0);

    const parts = [];
    if (safeYears > 0) parts.push(`${safeYears} year${safeYears !== 1 ? 's' : ''}`);
    if (safeMonths > 0) parts.push(`${safeMonths} month${safeMonths !== 1 ? 's' : ''}`);
    if (safeWeeks > 0) parts.push(`${safeWeeks} week${safeWeeks !== 1 ? 's' : ''}`);
    if (safeDays > 0) parts.push(`${safeDays} day${safeDays !== 1 ? 's' : ''}`);

    const baseSuffix = baseDateText ? ` ${direction === 'forward' ? 'after' : 'before'} ${baseDateText}` : '';

    if (parts.length === 0) return baseDateText ? `On ${baseDateText}` : 'Today';

    const durationText = parts.length === 1
        ? parts[0]
        : parts.length === 2
            ? `${parts[0]} and ${parts[1]}`
            : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;

    if (baseDateText) {
        return `${durationText}${baseSuffix}`;
    }

    return direction === 'forward'
        ? `${durationText} forward`
        : `${durationText} ago`;
}

/**
 * Parses natural language or shorthand offset strings such as:
 * - "1 year 2 months 3 weeks ago"
 * - "4 months 2 weeks forward"
 * - "1y 2m 3w"
 * - "100 days ahead"
 */
export function parseOffsetString(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        return null;
    }

    const lower = rawText.toLowerCase();
    const isForward = /\b(forward|ahead|after|later|future|next|\+)\b/.test(lower);
    const isBackward = /\b(ago|back|backward|before|past|prior|-)\b/.test(lower);
    const direction = isForward && !isBackward ? 'forward' : 'backward';

    const text = lower
        .replace(/\b(forward|ahead|after|later|future|next|ago|back|backward|before|past|prior)\b/g, '')
        .replace(/\band\b/g, ' ')
        .replace(/[+]/g, '')
        .trim();

    if (!text) return null;

    let years = 0;
    let months = 0;
    let weeks = 0;
    let days = 0;
    let matchedAny = false;

    // Match patterns like "1 year", "2 years", "1y", "1 yr", "1 yrs"
    const yearMatch = text.match(/(\d+)\s*(?:years?|yrs?|y)\b/);
    if (yearMatch) {
        years = parseInt(yearMatch[1], 10) || 0;
        matchedAny = true;
    }

    // Match patterns like "2 months", "2m", "2 mo", "2 mos"
    const monthMatch = text.match(/(\d+)\s*(?:months?|mos?|m)\b/);
    if (monthMatch) {
        months = parseInt(monthMatch[1], 10) || 0;
        matchedAny = true;
    }

    // Match patterns like "3 weeks", "3w", "3 wk", "3 wks"
    const weekMatch = text.match(/(\d+)\s*(?:weeks?|wks?|w)\b/);
    if (weekMatch) {
        weeks = parseInt(weekMatch[1], 10) || 0;
        matchedAny = true;
    }

    // Match patterns like "4 days", "4d"
    const dayMatch = text.match(/(\d+)\s*(?:days?|d)\b/);
    if (dayMatch) {
        days = parseInt(dayMatch[1], 10) || 0;
        matchedAny = true;
    }

    // If no unit keywords matched, check if it's just a single number (treat as days)
    if (!matchedAny) {
        const pureNumberMatch = text.match(/^(\d+)$/);
        if (pureNumberMatch) {
            days = parseInt(pureNumberMatch[1], 10) || 0;
            matchedAny = true;
        }
    }

    if (!matchedAny) return null;

    return { years, months, weeks, days, direction };
}

/**
 * Formats a description of how off an entry date is from the target date.
 * diffDays = entryDate - targetDate (in calendar days).
 * diffDays === 0: exact match
 * diffDays > 0: entry is after target date (N days later)
 * diffDays < 0: entry is before target date (N days earlier)
 */
export function formatDateDiscrepancy(diffDays) {
    if (diffDays === 0) {
        return {
            exact: true,
            diffDays: 0,
            badgeLabel: 'Exact match',
            summary: 'Exact date match (0 days off)',
            detail: 'Matches your exact target date.'
        };
    }

    const abs = Math.abs(diffDays);
    const dayWord = abs === 1 ? 'day' : 'days';
    const direction = diffDays > 0 ? 'later' : 'earlier';
    const sign = diffDays > 0 ? `+${abs}` : `-${abs}`;

    return {
        exact: false,
        diffDays,
        badgeLabel: `Off by ${sign} ${dayWord}`,
        summary: `Off by ${abs} ${dayWord} (${abs} ${dayWord} ${direction})`,
        detail: `${abs} ${dayWord} ${direction} than your target date.`
    };
}

function parseEntrySummary(docSnapshot) {
    if (!docSnapshot || !docSnapshot.exists()) return null;
    const data = docSnapshot.data() || {};
    const content = data.content || data.text || '';
    const title = data.title || '';

    // Extract title pattern ++Title++ if present
    let displayTitle = title;
    if (!displayTitle && content) {
        const match = content.match(/(?:\*\*)?\+\+(.*?)\+\+(?:\*\*)?/);
        if (match && match[1]) {
            const parts = match[1].split(' - ');
            displayTitle = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : match[1].trim();
        }
    }

    const cleanContent = content.replace(/[#*`_~]/g, ' ').trim();
    const wordCount = cleanContent.length > 0 ? (cleanContent.match(/\b\w+\b/g) || []).length : 0;
    const preview = cleanContent.slice(0, 140) + (cleanContent.length > 140 ? '...' : '');

    return {
        id: docSnapshot.id,
        title: displayTitle || 'Untitled Entry',
        wordCount,
        preview,
        isSpecial: Boolean(data.isSpecial),
        imageCount: Array.isArray(data.images) ? data.images.length : (data.imageUrl || data.imageMetadata ? 1 : 0)
    };
}

/**
 * Searches Firestore for:
 * 1. An exact entry matching targetDateStr (yyyy-MM-dd)
 * 2. The closest entry strictly before targetDateStr
 * 3. The closest entry strictly after targetDateStr
 *
 * Compares before and after to determine the closest entry with an entry,
 * along with the exact calendar day discrepancy.
 */
export async function findClosestEntry(db, userId, targetDateStr) {
    if (!db || !userId || !targetDateStr) {
        return {
            targetDateStr,
            exactMatch: null,
            closestEntry: null,
            diffDays: 0,
            discrepancy: formatDateDiscrepancy(0),
            alternativeEntry: null,
            altDiffDays: null
        };
    }

    const entriesCol = collection(db, 'users', userId, 'entries');
    const targetDateObj = parseISO(targetDateStr);

    // 1. Check exact date
    const exactDocRef = doc(db, 'users', userId, 'entries', targetDateStr);
    const exactSnapshotPromise = withTimeout(getDoc(exactDocRef)).catch(() => null);

    // 2. Query closest before (documentId < targetDateStr, desc, limit 1)
    const beforeQuery = query(
        entriesCol,
        where(documentId(), '<', targetDateStr),
        orderBy(documentId(), 'desc'),
        limit(1)
    );
    const beforePromise = withTimeout(getDocs(beforeQuery)).catch(() => null);

    // 3. Query closest after (documentId > targetDateStr, asc, limit 1)
    const afterQuery = query(
        entriesCol,
        where(documentId(), '>', targetDateStr),
        orderBy(documentId(), 'asc'),
        limit(1)
    );
    const afterPromise = withTimeout(getDocs(afterQuery)).catch(() => null);

    const [exactSnap, beforeSnap, afterSnap] = await Promise.all([
        exactSnapshotPromise,
        beforePromise,
        afterPromise
    ]);

    // Check exact match
    if (exactSnap && exactSnap.exists()) {
        const exactEntry = parseEntrySummary(exactSnap);
        return {
            targetDateStr,
            targetFormatted: format(targetDateObj, 'EEEE, d MMMM yyyy'),
            exactMatch: exactEntry,
            closestEntry: exactEntry,
            diffDays: 0,
            discrepancy: formatDateDiscrepancy(0),
            alternativeEntry: null,
            altDiffDays: null
        };
    }

    // Exact match does not exist: evaluate before and after
    const beforeEntry = beforeSnap && !beforeSnap.empty ? parseEntrySummary(beforeSnap.docs[0]) : null;
    const afterEntry = afterSnap && !afterSnap.empty ? parseEntrySummary(afterSnap.docs[0]) : null;

    let beforeDiff = null;
    let afterDiff = null;

    if (beforeEntry) {
        beforeDiff = differenceInCalendarDays(parseISO(beforeEntry.id), targetDateObj); // negative number
    }
    if (afterEntry) {
        afterDiff = differenceInCalendarDays(parseISO(afterEntry.id), targetDateObj); // positive number
    }

    let closestEntry = null;
    let diffDays = 0;
    let alternativeEntry = null;
    let altDiffDays = null;

    if (beforeEntry && afterEntry) {
        const beforeAbs = Math.abs(beforeDiff);
        const afterAbs = Math.abs(afterDiff);

        if (beforeAbs <= afterAbs) {
            closestEntry = beforeEntry;
            diffDays = beforeDiff;
            alternativeEntry = afterEntry;
            altDiffDays = afterDiff;
        } else {
            closestEntry = afterEntry;
            diffDays = afterDiff;
            alternativeEntry = beforeEntry;
            altDiffDays = beforeDiff;
        }
    } else if (beforeEntry) {
        closestEntry = beforeEntry;
        diffDays = beforeDiff;
    } else if (afterEntry) {
        closestEntry = afterEntry;
        diffDays = afterDiff;
    }

    const discrepancy = formatDateDiscrepancy(diffDays);

    return {
        targetDateStr,
        targetFormatted: format(targetDateObj, 'EEEE, d MMMM yyyy'),
        exactMatch: null,
        closestEntry,
        diffDays,
        discrepancy,
        alternativeEntry,
        altDiffDays
    };
}
