import { readImageCaptions } from './imageCaption.js';

import { isValid, parseISO, format } from 'date-fns';

const text = (value) => typeof value === 'string' ? value : '';

const displayText = (value) => text(value).normalize('NFC').replace(/\s+/g, ' ').trim();
const normalizedText = (value) => displayText(value).toLowerCase();

function plainSearchText(value) {
    // Strip formatting rather than punctuation: C++, #tags and file_names are
    // meaningful literal text. The raw field remains searchable as well.
    return text(value)
        .replace(/^ {0,3}```[^\n]*$/gm, '')
        .replace(/(^|\n)[ \t]{0,3}#{1,6}[ \t]+/g, '$1')
        .replace(/(^|\n)[ \t]*>[ \t]?/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/(^|[\s([{])\*([^*\n]+)\*(?=$|[\s)\]},.!?;:])/g, '$1$2')
        .replace(/(^|[\s([{])_([^_\n]+)_(?=$|[\s)\]},.!?;:])/g, '$1$2');
}

export const SEARCH_SOURCES = [
    { id: 'title', label: 'Entry titles', matchLabel: 'Entry title' },
    { id: 'content', label: 'Entry text', matchLabel: 'Entry text' },
    { id: 'captions', label: 'Image captions', matchLabel: 'Image caption' },
    { id: 'section-title', label: 'Sub-journal titles', matchLabel: 'Sub-journal title' },
    { id: 'section-content', label: 'Sub-journal text', matchLabel: 'Sub-journal text' }
];
export const ALL_SEARCH_SOURCES = SEARCH_SOURCES.map(({ id }) => id);

export function isSearchDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = parseISO(value);
    return isValid(date) && format(date, 'yyyy-MM-dd') === value;
}

export function readSearchFilters(params) {
    // Keep existing bookmarked year searches working; new ranges use from/to.
    const year = params.get('year');
    const legacyYear = !params.has('from') && !params.has('to') && /^\d{4}$/.test(year || '') ? year : '';
    const requestedSources = params.get('in')?.split(',');
    return {
        startDate: params.get('from') || (legacyYear ? `${legacyYear}-01-01` : ''),
        endDate: params.get('to') || (legacyYear ? `${legacyYear}-12-31` : ''),
        sources: requestedSources === undefined ? ALL_SEARCH_SOURCES : ALL_SEARCH_SOURCES.filter((source) => requestedSources.includes(source))
    };
}

export function searchFilterErrors({ startDate = '', endDate = '', sources = ALL_SEARCH_SOURCES } = {}) {
    let dates = '';
    if ((startDate && !isSearchDate(startDate)) || (endDate && !isSearchDate(endDate))) {
        dates = 'Choose valid start and end dates, or clear the date range.';
    } else if (startDate && endDate && startDate > endDate) {
        dates = 'The start date must be on or before the end date.';
    }
    return { dates, sources: sources.some((source) => ALL_SEARCH_SOURCES.includes(source)) ? '' : 'Select at least one area to search.' };
}

export function hasSearchFilters({ startDate = '', endDate = '', sources = ALL_SEARCH_SOURCES } = {}) {
    return Boolean(startDate || endDate || ALL_SEARCH_SOURCES.some((source) => !sources.includes(source)));
}

export function normalizeSearchEntry(entryDoc) {
    // Only real day keys can be opened by the entry route. Never trust a stored id.
    const id = entryDoc.id;
    if (!isSearchDate(id)) return null;

    const data = entryDoc.data() || {};
    const title = text(data.title);
    const content = text(data.content);
    const subEntries = data.subEntries && typeof data.subEntries === 'object' && !Array.isArray(data.subEntries)
        ? Object.entries(data.subEntries)
        : [];
    const fields = [];
    const addField = (source, value, key, label) => {
        const valueText = text(value);
        if (!valueText.trim()) return;
        fields.push({ source, text: valueText, searchableText: normalizedText(valueText),
            searchablePlainText: normalizedText(plainSearchText(valueText)), key,
            label: label || SEARCH_SOURCES.find(({ id: sourceId }) => sourceId === source).matchLabel });
    };
    addField('title', title, 'title');
    addField('content', content, 'content');
    if (Array.isArray(data.images)) {
        data.images.forEach((image, index) => {
            const { caption, taggedCaptions } = readImageCaptions(image);
            addField('captions', caption, `caption-${index}`, `Image caption ${index + 1}`);
            taggedCaptions.forEach((item, tagIndex) => {
                addField('captions', `${item.tag}: ${item.caption}`, `caption-${index}-tag-${tagIndex}`, `Image caption ${index + 1} · ${item.tag}`);
            });
        });
    }
    subEntries.forEach(([sectionId, entry]) => {
        addField('section-title', entry?.title, `section-title-${sectionId}`);
        addField('section-content', entry?.content, `section-content-${sectionId}`);
    });

    return { id, title, content, fields };
}

export function filterSearchEntries(entries, queryText, mode = 'any', filters = {}) {
    const { startDate = '', endDate = '', sources = ALL_SEARCH_SOURCES } = filters;
    const errors = searchFilterErrors(filters);
    if (errors.dates || errors.sources) return [];
    const query = normalizedText(queryText);
    if (!query && !hasSearchFilters(filters)) return [];
    const terms = searchTerms(query, mode);
    const selectedSources = new Set(sources);
    const browsingAll = !query && ALL_SEARCH_SOURCES.every((source) => selectedSources.has(source));
    return entries.flatMap((entry) => {
        if ((startDate && entry.id < startDate) || (endDate && entry.id > endDate)) return [];
        // Match each field independently: phrases must not span captions or sections.
        const matches = entry.fields.filter((field) => selectedSources.has(field.source)
            && (!query || terms.some((term) => field.searchableText.includes(term) || field.searchablePlainText.includes(term))));
        return matches.length || browsingAll ? [{ ...entry, matches }] : [];
    });
}

export function cleanSearchTitle(rawTitle) {
    const title = text(rawTitle);
    const colonMatch = title.match(/:\s*(.+?)(?:\+\+|\*\*|$)/);
    const dashMatch = title.match(/\+\+[^-]+-\s*(.+?)\+\+/);
    return (colonMatch?.[1] || dashMatch?.[1] || title).replace(/[*+#]+/g, '').trim() || 'Untitled';
}

function searchTerms(queryText, mode) {
    const query = normalizedText(queryText);
    // Prefer the full term when queries contain both "walk" and "walking".
    return [...new Set(query ? (mode === 'phrase' ? [query] : query.split(/\s+/)) : [])]
        .sort((a, b) => b.length - a.length);
}

function searchMatchRanges(value, terms, firstOnly = false) {
    if (!terms.length) return [];
    const pattern = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const folded = value.toLowerCase();
    // Some characters (e.g. İ) expand when lowercased. Preserve offsets into
    // the displayed text so highlighting uses the same matching as the index.
    let offsets;
    if (folded.length !== value.length) {
        offsets = [];
        let cursor = 0;
        for (const character of value) {
            for (let index = 0; index < character.toLowerCase().length; index += 1) {
                offsets.push({ start: cursor, end: cursor + character.length });
            }
            cursor += character.length;
        }
    }
    const ranges = [];
    for (const match of folded.matchAll(new RegExp(pattern, 'g'))) {
        const start = offsets ? offsets[match.index].start : match.index;
        const end = offsets ? offsets[match.index + match[0].length - 1].end : match.index + match[0].length;
        const previous = ranges.at(-1);
        if (previous && start < previous.end) previous.end = Math.max(previous.end, end);
        else ranges.push({ start, end });
        if (firstOnly) break;
    }
    return ranges;
}

function preservesSearchTerms(original, cleaned, terms) {
    const originalLower = normalizedText(original);
    const cleanedLower = normalizedText(cleaned);
    return terms.every((term) => !originalLower.includes(term) || cleanedLower.includes(term));
}

export function highlightSearchText(value, queryText, mode) {
    const content = displayText(value);
    const ranges = searchMatchRanges(content, searchTerms(queryText, mode));
    const parts = [];
    let cursor = 0;
    for (const range of ranges) {
        if (range.start > cursor) parts.push({ text: content.slice(cursor, range.start), match: false });
        parts.push({ text: content.slice(range.start, range.end), match: true });
        cursor = range.end;
    }
    if (cursor < content.length) parts.push({ text: content.slice(cursor), match: false });
    return parts;
}

export function searchSnippet(content, queryText, mode, { maxLength = 180, contextBefore = 45 } = {}) {
    const original = displayText(content);
    const terms = searchTerms(queryText, mode);
    const cleaned = displayText(plainSearchText(content));
    // A literal search such as "#tag", "file_name" or a link URL must survive
    // Markdown cleanup. Keep the original text when cleanup removes a match.
    const plainText = preservesSearchTerms(original, cleaned, terms) ? cleaned : original;
    const match = searchMatchRanges(plainText, terms, true)[0];
    let start = match ? Math.max(0, match.start - contextBefore) : 0;
    if (start > 0) {
        const boundary = plainText.indexOf(' ', start);
        if (boundary >= 0 && boundary < match.start) start = boundary + 1;
    }
    let end = Math.min(plainText.length, Math.max(start + maxLength, match ? match.end + 50 : 0));
    if (end < plainText.length) {
        const boundary = plainText.lastIndexOf(' ', end);
        if (boundary > Math.max(match?.end || 0, end - 24)) end = boundary;
    }
    return { text: `${start ? '…' : ''}${plainText.slice(start, end)}${end < plainText.length ? '…' : ''}`, terms };
}

export function searchResultTitle(rawTitle, queryText, mode) {
    const cleaned = cleanSearchTitle(rawTitle);
    const original = text(rawTitle);
    const title = preservesSearchTerms(original, cleaned, searchTerms(queryText, mode)) ? cleaned : original;
    return searchSnippet(title, queryText, mode, { maxLength: 140, contextBefore: 30 }).text;
}
