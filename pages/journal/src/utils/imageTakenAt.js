const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;
const PHOTO_WINDOW_DAYS = 24;
const TAKEN_AT_FIELDS = ['DateTimeOriginal', 'CreateDate'];

function pad(value) {
    return String(value).padStart(2, '0');
}

function calendarUtc(year, month, day) {
    const utc = Date.UTC(year, month - 1, day);
    const check = new Date(utc);
    if (
        check.getUTCFullYear() !== year
        || check.getUTCMonth() !== month - 1
        || check.getUTCDate() !== day
    ) {
        return null;
    }
    return utc;
}

function partsFromNumbers(year, month, day, hour, minute, second = 0) {
    if (
        !Number.isInteger(year)
        || !Number.isInteger(month)
        || !Number.isInteger(day)
        || !Number.isInteger(hour)
        || !Number.isInteger(minute)
        || !Number.isInteger(second)
    ) {
        return null;
    }
    if (hour > 23 || minute > 59 || second > 59) return null;
    const utcDay = calendarUtc(year, month, day);
    if (utcDay === null) return null;
    return { year, month, day, hour, minute, second, utcDay };
}

/**
 * Camera dates are the clock time on the photo, not a UTC instant.
 * Keep that wall-clock time so the label does not shift with timezone.
 */
export function exifValueToTakenAt(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const parts = partsFromNumbers(
            value.getFullYear(),
            value.getMonth() + 1,
            value.getDate(),
            value.getHours(),
            value.getMinutes(),
            value.getSeconds()
        );
        return parts ? formatTakenAt(parts) : null;
    }

    if (typeof value !== 'string') return null;
    const match = value.trim().match(
        /^(\d{4})[-:](\d{2})[-:](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
    );
    if (!match) return null;

    const parts = partsFromNumbers(
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6] || 0)
    );
    return parts ? formatTakenAt(parts) : null;
}

export function takenAtFromExif(tags) {
    if (!tags || typeof tags !== 'object') return null;
    for (const field of TAKEN_AT_FIELDS) {
        const takenAt = exifValueToTakenAt(tags[field]);
        if (takenAt) return takenAt;
    }
    return null;
}

export function normalizeStoredTakenAt(value) {
    return exifValueToTakenAt(value);
}

function formatTakenAt(parts) {
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function parseTakenAt(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
    );
    if (!match) return null;
    return partsFromNumbers(
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6] || 0)
    );
}

function parseEntryDate(entryDate) {
    if (typeof entryDate !== 'string') return null;
    const match = entryDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utcDay = calendarUtc(year, month, day);
    if (utcDay === null) return null;
    return { year, month, day, utcDay };
}

function formatTime12(parts) {
    const period = parts.hour >= 12 ? 'PM' : 'AM';
    const hour12 = parts.hour % 12 || 12;
    return `${hour12}:${pad(parts.minute)} ${period}`;
}

function formatDateLabel(parts, entry) {
    const month = MONTHS[parts.month - 1];
    if (parts.year !== entry.year) return `${parts.day} ${month} ${parts.year}`;
    return `${parts.day} ${month}`;
}

/**
 * Label under a photo, compared with the journal entry's calendar date.
 * Same day is the time only. The day before includes Yesterday.
 * Older photos show the date, and only when they were taken within 24 days.
 */
export function formatImageTakenLabel(takenAt, entryDate) {
    const taken = parseTakenAt(takenAt);
    const entry = parseEntryDate(entryDate);
    if (!taken || !entry) return null;

    const daysBeforeEntry = Math.round((entry.utcDay - taken.utcDay) / DAY_MS);
    if (daysBeforeEntry < 0 || daysBeforeEntry > PHOTO_WINDOW_DAYS) return null;

    const time = formatTime12(taken);
    if (daysBeforeEntry === 0) return time;
    if (daysBeforeEntry === 1) return `Yesterday ${time}`;
    return `${formatDateLabel(taken, entry)}, ${time}`;
}

/** Plain image record that Firestore can store, including a valid camera time. */
export function imageForSave(image) {
    if (!image || typeof image !== 'object') return null;
    const url = typeof image.url === 'string' ? image.url.trim() : '';
    if (!url) return null;

    const record = {
        url,
        path: typeof image.path === 'string' && image.path ? image.path : null,
        size: Number.isFinite(Number(image.size)) ? Number(image.size) : 0,
        caption: typeof image.caption === 'string' ? image.caption : ''
    };
    const takenAt = normalizeStoredTakenAt(image.takenAt);
    if (takenAt) record.takenAt = takenAt;
    return record;
}

export function imagesForSave(images) {
    if (!Array.isArray(images)) return [];
    return images.map(imageForSave).filter(Boolean);
}

function imageCaption(image) {
    return typeof image?.caption === 'string' ? image.caption.trim() : '';
}

/**
 * Readable photo lines for text, markdown, and backup exports.
 * `text` joins with semicolons. `lines` and `markdown` use one photo per line.
 */
export function formatImageList(images, entryDate, style = 'text') {
    if (!Array.isArray(images) || images.length === 0) return '';

    const lines = images.map((image, index) => {
        const caption = imageCaption(image);
        const when = formatImageTakenLabel(image?.takenAt, entryDate);

        if (style === 'markdown') {
            const bits = [];
            if (when) bits.push(when);
            if (caption) bits.push(`*${caption}*`);
            const detail = bits.join(' — ');
            const link = typeof image?.url === 'string' && image.url ? ` ([link](${image.url}))` : '';
            return `- 📷 Attachment ${index + 1}${detail ? `: ${detail}` : ''}${link}`;
        }

        const detail = [when, caption].filter(Boolean).join(' — ');
        return detail ? `Photo ${index + 1}: ${detail}` : `Photo ${index + 1}`;
    });

    if (style === 'markdown' || style === 'lines') return lines.join('\n');
    return lines.join('; ');
}

export function formatImageExportSection(images, entryDate, fmt) {
    const markdown = fmt === 'md' || fmt === 'markdown';
    const list = formatImageList(images, entryDate, markdown ? 'markdown' : 'lines');
    if (!list) return '';
    if (markdown) return `\n\n## Photos\n\n${list}`;
    return `\n\nPhotos\n------\n${list}`;
}

export async function extractImageTakenAt(file) {
    if (!file) return null;
    try {
        const exifr = await import('exifr');
        const parse = exifr.parse || exifr.default?.parse;
        if (typeof parse !== 'function') return null;
        const buffer = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file;
        const tags = await parse(buffer, {
            pick: TAKEN_AT_FIELDS,
            reviveValues: false
        });
        return takenAtFromExif(tags);
    } catch (error) {
        console.warn('Could not read when this photo was taken:', error);
        return null;
    }
}
