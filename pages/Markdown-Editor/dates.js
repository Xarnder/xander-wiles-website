/**
 * Hidden date tags: visible in Raw, hidden in Preview unless Show dates is on.
 *
 * Custom format: {{date:…}}
 * Inner value is smart-detected (ISO, slash dates, named months, today/yesterday/tomorrow).
 */

import { SHOW_DATES_DEFAULT, SHOW_DATES_KEY } from './config.js';

/** Match {{date: … }} including optional whitespace. */
export function dateTagRe() {
    return /\{\{\s*date\s*:\s*([^}]+?)\s*\}\}/gi;
}

/** Whole-line date tag (trimmed). */
export const DATE_TAG_LINE_RE = /^\{\{\s*date\s*:\s*([^}]+?)\s*\}\}$/i;

const MONTHS = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
};

/**
 * @returns {boolean}
 */
export function readShowDatesEnabled() {
    try {
        const raw = localStorage.getItem(SHOW_DATES_KEY);
        if (raw === '1') return true;
        if (raw === '0') return false;
    } catch {
        // ignore
    }
    return SHOW_DATES_DEFAULT;
}

/**
 * @param {boolean} enabled
 * @returns {boolean}
 */
export function writeShowDatesEnabled(enabled) {
    const next = Boolean(enabled);
    try {
        localStorage.setItem(SHOW_DATES_KEY, next ? '1' : '0');
    } catch {
        // ignore
    }
    return next;
}

/**
 * Canonical tag for insert (local calendar date).
 * @param {Date} [date]
 * @returns {string}
 */
export function buildDateTag(date = new Date()) {
    const d = date instanceof Date ? date : new Date();
    if (Number.isNaN(d.getTime())) {
        return buildDateTag(new Date());
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `{{date:${y}-${m}-${day}}}`;
}

/**
 * True when text is only a date tag (optional surrounding whitespace).
 * @param {string} text
 * @returns {boolean}
 */
export function isDateTagOnlyText(text) {
    return DATE_TAG_LINE_RE.test(String(text ?? '').trim());
}

/**
 * First `{{date:…}}` tag in text, or null.
 * @param {string} text
 * @returns {string | null}
 */
export function extractDateTag(text) {
    const match = dateTagRe().exec(String(text ?? ''));
    return match ? match[0] : null;
}

/**
 * Body text for list-item editors (date tags hidden; Raw still has them).
 * @param {string} text
 * @returns {string}
 */
export function listItemBodyForEdit(text) {
    return stripDateTags(text).replace(/[ \t]+$/g, '');
}

/**
 * Reassemble item text after editing the body only.
 * Keeps at most one date tag (prefers a tag typed into the body, else the
 * preserved tag from before edit). Never appends a second stamp.
 * @param {string} editedBody
 * @param {string | null | undefined} preservedTag
 * @returns {string}
 */
export function commitListItemText(editedBody, preservedTag = null) {
    const rawBody = String(editedBody ?? '');
    const typedTag = extractDateTag(rawBody);
    const body = stripDateTags(rawBody)
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]+$/g, '');
    const tag = typedTag || (preservedTag ? String(preservedTag) : null);
    if (!tag) return body;
    const trimmed = body.trim();
    if (!trimmed) return ` ${tag}`;
    return `${trimmed} ${tag}`;
}

/**
 * Friendly label for a `{{date:…}}` tag (or empty string).
 * @param {string | null | undefined} tag
 * @returns {string}
 */
export function formatDateTagLabel(tag) {
    if (!tag) return '';
    const match = dateTagRe().exec(String(tag));
    if (!match) return '';
    const parsed = parseSmartDate(match[1]);
    return parsed ? parsed.label : String(match[1]).trim();
}

/**
 * Local calendar `YYYY-MM-DD` for an `<input type="date">`, or null.
 * @param {string | null | undefined} tag
 * @returns {string | null}
 */
export function dateTagToIsoDate(tag) {
    if (!tag) return null;
    const match = dateTagRe().exec(String(tag));
    if (!match) return null;
    const parsed = parseSmartDate(match[1]);
    if (!parsed?.date || Number.isNaN(parsed.date.getTime())) return null;
    const d = parsed.date;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Build a canonical tag from a `YYYY-MM-DD` string (local calendar day).
 * @param {string} isoDate
 * @returns {string | null}
 */
export function buildDateTagFromIsoDate(isoDate) {
    const raw = String(isoDate ?? '').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) return null;
    const date = makeLocalDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return date ? buildDateTag(date) : null;
}

/**
 * Commit a mini-edit (or list-row edit): refresh the date tag to today only when
 * the visible item body actually changed. Accidental open/close keeps the old date.
 * @param {string} previousFullText
 * @param {string} editedBody
 * @returns {string}
 */
export function commitMiniEditListItemText(previousFullText, editedBody) {
    const beforeBody = listItemBodyForEdit(previousFullText);
    const afterBody = listItemBodyForEdit(editedBody);
    const preserved = extractDateTag(previousFullText);
    if (beforeBody === afterBody) {
        return commitListItemText(afterBody, preserved);
    }
    return commitListItemText(afterBody, buildDateTag());
}

/**
 * Effective date tag while mini-editing (today if body dirty, else original).
 * @param {string} previousFullText
 * @param {string} editedBody
 * @returns {string | null}
 */
export function previewMiniEditDateTag(previousFullText, editedBody) {
    const beforeBody = listItemBodyForEdit(previousFullText);
    const afterBody = listItemBodyForEdit(editedBody);
    if (beforeBody === afterBody) return extractDateTag(previousFullText);
    return buildDateTag();
}

/**
 * Stamp a new list item with today’s date tag (idempotent if already tagged).
 * Empty items get a leading space so the caret can sit at 0 and typing
 * lands before the tag: "Buy milk {{date:…}}".
 * @param {string} [text]
 * @returns {string}
 */
export function stampNewItemText(text = '') {
    const raw = String(text ?? '');
    const existing = extractDateTag(raw);
    if (existing) {
        // Normalize to a single trailing tag (avoids accidental duplicates).
        return commitListItemText(raw, existing);
    }
    const body = raw.trim();
    const tag = buildDateTag();
    if (!body) return ` ${tag}`;
    return `${body} ${tag}`;
}

/**
 * Build a canonical tag from Drive `createdTime` (or any ISO timestamp).
 * Uses the local calendar day of that instant.
 * @param {string | null | undefined} iso
 * @returns {string | null}
 */
export function buildDateTagFromCreatedTime(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return buildDateTag(d);
}

/**
 * Resolve user / menu input into a single `{{date:YYYY-MM-DD}}` tag.
 * Accepts smart date strings, ISO timestamps, or an existing tag.
 * @param {string} raw
 * @returns {string | null}
 */
export function resolveDateTagInput(raw) {
    const input = String(raw ?? '').trim();
    if (!input) return null;

    const asTag = extractDateTag(input);
    if (asTag && isDateTagOnlyText(input)) {
        const inner = asTag.replace(/^\{\{\s*date\s*:\s*/i, '').replace(/\s*\}\}$/, '');
        const parsedTag = parseSmartDate(inner);
        return parsedTag ? buildDateTag(parsedTag.date) : buildDateTagFromCreatedTime(inner) || asTag;
    }

    const parsed = parseSmartDate(input);
    if (parsed) return buildDateTag(parsed.date);

    const fromIso = buildDateTagFromCreatedTime(input);
    if (fromIso) return fromIso;

    return null;
}

/**
 * Focus a list-item text input. Empty / date-only bodies keep the caret at
 * the start; otherwise select all for quick rewrite of the visible body.
 * @param {HTMLInputElement | HTMLTextAreaElement | null | undefined} input
 */
export function focusItemTextInput(input) {
    if (!input) return;
    try {
        input.focus({ preventScroll: true });
    } catch {
        input.focus();
    }
    const value = String(input.value ?? '');
    if (!value.trim() || isDateTagOnlyText(value)) {
        try {
            input.setSelectionRange(0, 0);
        } catch {
            // ignore
        }
        return;
    }
    try {
        input.select();
    } catch {
        // ignore
    }
}

/**
 * @param {number} y
 * @param {number} m 0-based
 * @param {number} d
 * @param {number} [hh]
 * @param {number} [mm]
 * @returns {Date | null}
 */
function makeLocalDate(y, m, d, hh = 0, mm = 0) {
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    if (m < 0 || m > 11 || d < 1 || d > 31) return null;
    const date = new Date(y, m, d, hh || 0, mm || 0, 0, 0);
    if (
        date.getFullYear() !== y ||
        date.getMonth() !== m ||
        date.getDate() !== d
    ) {
        return null;
    }
    return date;
}

/**
 * @param {string} raw
 * @returns {{ date: Date, hasTime: boolean } | null}
 */
function parseTimeSuffix(rest) {
    const s = String(rest || '').trim();
    if (!s) return { hasTime: false, hh: 0, mm: 0 };
    const m = s.match(/^T?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m) return null;
    let hh = Number(m[1]);
    const mm = Number(m[2]);
    const ap = (m[4] || '').toLowerCase();
    if (ap === 'pm' && hh < 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) return null;
    return { hasTime: true, hh, mm };
}

/**
 * Smart-parse the inner text of a {{date:…}} tag.
 * @param {string} raw
 * @returns {{ iso: string, label: string, date: Date, hasTime: boolean } | null}
 */
export function parseSmartDate(raw) {
    const input = String(raw ?? '').trim();
    if (!input) return null;

    const lower = input.toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (lower === 'today') {
        return formatParsed(startOfToday, false, input);
    }
    if (lower === 'yesterday') {
        const d = new Date(startOfToday);
        d.setDate(d.getDate() - 1);
        return formatParsed(d, false, input);
    }
    if (lower === 'tomorrow') {
        const d = new Date(startOfToday);
        d.setDate(d.getDate() + 1);
        return formatParsed(d, false, input);
    }

    // ISO / SQL-ish: 2026-08-03[ T| ]14:30[:ss]
    let m = input.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]) - 1;
        const d = Number(m[3]);
        const hasTime = m[4] != null;
        const hh = hasTime ? Number(m[4]) : 0;
        const mm = hasTime ? Number(m[5]) : 0;
        const date = makeLocalDate(y, mo, d, hh, mm);
        if (date) return formatParsed(date, hasTime, input);
    }

    // Slash dates: D/M/Y or M/D/Y (prefer D/M when day > 12; else prefer D/M for this app)
    m = input.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s+(.+))?$/);
    if (m) {
        let a = Number(m[1]);
        let b = Number(m[2]);
        let y = Number(m[3]);
        if (y < 100) y += y >= 70 ? 1900 : 2000;
        const time = parseTimeSuffix(m[4] || '');
        if (time) {
            let day;
            let month;
            if (a > 12 && b <= 12) {
                day = a;
                month = b - 1;
            } else if (b > 12 && a <= 12) {
                month = a - 1;
                day = b;
            } else {
                // Ambiguous: prefer day/month/year (common outside US)
                day = a;
                month = b - 1;
            }
            const date = makeLocalDate(y, month, day, time.hh, time.mm);
            if (date) return formatParsed(date, time.hasTime, input);
        }
    }

    // Named month: 3 Aug 2026 | Aug 3, 2026 | August 3rd 2026
    m = input.match(
        /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{2}|\d{4})(?:\s+(.+))?$/
    );
    if (m) {
        const day = Number(m[1]);
        const month = MONTHS[m[2].toLowerCase()];
        let y = Number(m[3]);
        if (y < 100) y += y >= 70 ? 1900 : 2000;
        const time = parseTimeSuffix(m[4] || '');
        if (month != null && time) {
            const date = makeLocalDate(y, month, day, time.hh, time.mm);
            if (date) return formatParsed(date, time.hasTime, input);
        }
    }

    m = input.match(
        /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2}|\d{4})(?:\s+(.+))?$/
    );
    if (m) {
        const month = MONTHS[m[1].toLowerCase()];
        const day = Number(m[2]);
        let y = Number(m[3]);
        if (y < 100) y += y >= 70 ? 1900 : 2000;
        const time = parseTimeSuffix(m[4] || '');
        if (month != null && time) {
            const date = makeLocalDate(y, month, day, time.hh, time.mm);
            if (date) return formatParsed(date, time.hasTime, input);
        }
    }

    // Last resort: Date.parse on cleaned string
    const fallback = new Date(input);
    if (!Number.isNaN(fallback.getTime())) {
        const hasTime = /\d{1,2}:\d{2}/.test(input);
        return formatParsed(fallback, hasTime, input);
    }

    return null;
}

/**
 * @param {Date} date
 * @param {boolean} hasTime
 * @param {string} original
 */
function formatParsed(date, hasTime, original) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    let iso = `${y}-${m}-${d}`;
    if (hasTime) {
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        iso = `${iso}T${hh}:${mm}`;
    }

    let label;
    try {
        label = hasTime
            ? date.toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
              })
            : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
    } catch {
        label = iso;
    }

    return { iso, label, date, hasTime, original: String(original || '').trim() };
}

/**
 * Build safe HTML for a visible date tag.
 * @param {string} rawInner
 * @param {typeof import('./markdown.js').escapeHtml} escapeHtml
 * @param {{ block?: boolean }} [options]
 * @returns {string}
 */
export function renderDateTagHtml(rawInner, escapeHtml, options = {}) {
    const parsed = parseSmartDate(rawInner);
    const cls = options.block ? 'md-date-tag md-date-tag--block' : 'md-date-tag';
    if (!parsed) {
        const text = String(rawInner ?? '').trim() || 'date';
        return `<span class="${cls} md-date-tag--raw">${escapeHtml(text)}</span>`;
    }
    return `<time class="${cls}" datetime="${escapeHtml(parsed.iso)}">${escapeHtml(parsed.label)}</time>`;
}

/**
 * Strip date tags from a string (preview-hidden mode).
 * Collapses leftover double spaces from removals.
 * @param {string} text
 * @returns {string}
 */
export function stripDateTags(text) {
    return String(text ?? '')
        .replace(dateTagRe(), '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n');
}

/**
 * Replace or strip date tags for plain-text surfaces (list item labels).
 * @param {string} text
 * @param {boolean} [showDates]
 * @returns {string}
 */
export function formatDateTagsForPlainText(text, showDates = readShowDatesEnabled()) {
    const next = String(text ?? '').replace(dateTagRe(), (_, rawInner) => {
        if (!showDates) return '';
        const parsed = parseSmartDate(rawInner);
        return parsed ? parsed.label : String(rawInner).trim();
    });
    return next.replace(/ {2,}/g, ' ').replace(/\s+\n/g, '\n').trim();
}

/**
 * Insert a date tag into markdown source at a caret offset.
 * Prefers its own line when the caret is at a line boundary / empty selection in Raw.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @param {string} [tag]
 * @returns {{ text: string, caret: number }}
 */
export function insertDateTagAt(text, start, end, tag = buildDateTag()) {
    const value = String(text ?? '');
    const from = Math.max(0, Math.min(Number(start) || 0, value.length));
    const to = Math.max(from, Math.min(Number(end) || from, value.length));
    const before = value.slice(0, from);
    const after = value.slice(to);

    const atLineStart = from === 0 || before.endsWith('\n');
    const atLineEnd = to === value.length || after.startsWith('\n');
    const selectionEmpty = from === to;

    let insert = tag;
    if (selectionEmpty && atLineStart && atLineEnd) {
        insert = `${tag}\n`;
    } else if (selectionEmpty && atLineEnd && !atLineStart) {
        insert = `\n${tag}\n`;
    } else if (!before.endsWith(' ') && !before.endsWith('\n') && before.length) {
        insert = ` ${tag}`;
    }
    if (insert.endsWith('\n') === false && after && !after.startsWith(' ') && !after.startsWith('\n')) {
        insert = `${insert} `;
    }

    const next = before + insert + after;
    return { text: next, caret: before.length + insert.length };
}
