import {
    format,
    parseISO,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    subDays,
    subMonths,
    isValid
} from 'date-fns';

/**
 * Calculates start and end YYYY-MM-DD date keys based on a preset.
 */
export function getDateRangeForPreset(preset, options = {}) {
    const baseDate = options.baseDate ? new Date(options.baseDate) : new Date();

    switch (preset) {
        case 'current-week': {
            const start = startOfWeek(baseDate, { weekStartsOn: 1 });
            const end = endOfWeek(baseDate, { weekStartsOn: 1 });
            return {
                start: format(start, 'yyyy-MM-dd'),
                end: format(end, 'yyyy-MM-dd'),
                label: 'Current Week'
            };
        }
        case 'last-7-days': {
            const start = subDays(baseDate, 6);
            return {
                start: format(start, 'yyyy-MM-dd'),
                end: format(baseDate, 'yyyy-MM-dd'),
                label: 'Last 7 Days'
            };
        }
        case 'current-month-so-far': {
            const start = startOfMonth(baseDate);
            return {
                start: format(start, 'yyyy-MM-dd'),
                end: format(baseDate, 'yyyy-MM-dd'),
                label: 'Current Month so Far'
            };
        }
        case 'whole-month': {
            const monthStr = options.selectedMonth || format(baseDate, 'yyyy-MM');
            let date = parseISO(`${monthStr}-01`);
            if (!isValid(date)) {
                date = baseDate;
            }
            const start = startOfMonth(date);
            const end = endOfMonth(date);
            return {
                start: format(start, 'yyyy-MM-dd'),
                end: format(end, 'yyyy-MM-dd'),
                label: format(start, 'MMMM yyyy')
            };
        }
        case 'last-6-months': {
            const start = subMonths(baseDate, 6);
            return {
                start: format(start, 'yyyy-MM-dd'),
                end: format(baseDate, 'yyyy-MM-dd'),
                label: 'Last 6 Months'
            };
        }
        case 'custom': {
            const start = options.customStart || format(subDays(baseDate, 7), 'yyyy-MM-dd');
            const end = options.customEnd || format(baseDate, 'yyyy-MM-dd');
            return {
                start,
                end,
                label: 'Custom Range'
            };
        }
        default: {
            const start = startOfMonth(baseDate);
            const end = endOfMonth(baseDate);
            return {
                start: format(start, 'yyyy-MM-dd'),
                end: format(end, 'yyyy-MM-dd'),
                label: 'Month'
            };
        }
    }
}

/**
 * Extracts a clean title and body from entry data.
 */
export function extractEntryTitleAndContent(entry) {
    if (!entry) return { title: 'Untitled Entry', content: '' };

    let title = entry.title || '';
    let content = entry.content || entry.text || '';

    // Extract title from ++Title++ or **++Title++**
    const match = content.match(/(?:\*\*)?\+\+(.*?)\+\+(?:\*\*)?/);
    if (match && match[1]) {
        const parts = match[1].split(' - ');
        if (parts.length >= 2) {
            title = parts.slice(1).join(' - ').trim();
        } else {
            title = match[1].trim();
        }
        // Strip the markup line from displayed content
        content = content.replace(/(?:\*\*)?\+\+.*?\+\+(?:\*\*)?\n?/, '').trim();
    }

    if (!title && content) {
        title = content.split('\n')[0].replace(/^[#*+\s]+/, '').trim();
    }

    // Clean formatting characters from title
    if (title) {
        title = title.replace(/^[:\s\-*+#]+|[:\s\-*+#]+$/g, '').trim();
    }

    return {
        title: title || 'Untitled Entry',
        content
    };
}

/**
 * Formats sub-entries into text or markdown.
 */
export function formatSubEntries(subEntries, fmt, entrySectionNameById = {}) {
    if (!subEntries || typeof subEntries !== 'object') return '';

    const sections = Object.entries(subEntries)
        .map(([sectionId, value]) => {
            const content = typeof value?.content === 'string' ? value.content.trim() : '';
            const title = typeof value?.title === 'string' ? value.title.trim() : '';
            if (!content && !title) return null;

            const sectionName = entrySectionNameById[sectionId] || sectionId;
            const heading = title ? `${sectionName}: ${title}` : sectionName;

            if (fmt === 'markdown') {
                return `### ${heading}\n\n${content}`;
            }
            return `[${heading}]\n${content}`;
        })
        .filter(Boolean);

    if (sections.length === 0) return '';
    return `\n\n${sections.join('\n\n')}`;
}

/**
 * Formats numeric entries into text or markdown.
 */
export function formatNumericEntries(numericEntries, fmt, numericFieldNameById = {}) {
    if (!numericEntries || typeof numericEntries !== 'object') return '';

    const fields = Object.entries(numericEntries)
        .map(([fieldId, value]) => {
            const numericValue = typeof value === 'number' ? value : Number(value);
            if (!Number.isFinite(numericValue)) return null;

            const fieldName = numericFieldNameById[fieldId] || fieldId;
            return { fieldName, value: numericValue };
        })
        .filter(Boolean);

    if (fields.length === 0) return '';

    if (fmt === 'markdown') {
        return `\n\n### Numerical Inputs\n\n${fields.map(f => `- **${f.fieldName}**: ${f.value}`).join('\n')}`;
    }

    return `\n\n[Numerical Inputs]\n${fields.map(f => `- ${f.fieldName}: ${f.value}`).join('\n')}`;
}

/**
 * Formats an entry to plain text.
 */
export function formatEntryToText(entry, options = {}) {
    const {
        includeMetadata = true,
        includeSubEntries = true,
        includeNumeric = true,
        includeImages = true,
        entrySectionNameById = {},
        numericFieldNameById = {},
        tagDefinitions = {}
    } = options;

    const dateKey = entry.id || entry.date || '';
    let dateFormatted = dateKey;
    try {
        const parsed = parseISO(dateKey);
        if (isValid(parsed)) {
            dateFormatted = `${dateKey} (${format(parsed, 'EEEE, d MMMM yyyy')})`;
        }
    } catch {
        dateFormatted = dateKey;
    }

    const { title, content } = extractEntryTitleAndContent(entry);

    const parts = [];

    // Header
    parts.push(`=== ${dateFormatted} : ${title} ===`);

    // Metadata
    if (includeMetadata) {
        const metaItems = [];
        if (entry.isSpecial) {
            metaItems.push('★ Special Day');
        }
        if (entry.mood) {
            metaItems.push(`Mood: ${entry.mood}`);
        }
        if (entry.tags && Array.isArray(entry.tags) && entry.tags.length > 0) {
            const tagNames = entry.tags
                .map(tId => tagDefinitions[tId]?.name || tId)
                .filter(Boolean);
            if (tagNames.length > 0) {
                metaItems.push(`Tags: ${tagNames.join(', ')}`);
            }
        }
        if (metaItems.length > 0) {
            parts.push(metaItems.join(' | '));
        }
    }

    // Main Content
    if (content.trim()) {
        parts.push(content.trim());
    }

    // Sub-entries
    if (includeSubEntries && entry.subEntries) {
        const subText = formatSubEntries(entry.subEntries, 'text', entrySectionNameById);
        if (subText.trim()) {
            parts.push(subText.trim());
        }
    }

    // Numeric fields
    if (includeNumeric && entry.numericEntries) {
        const numText = formatNumericEntries(entry.numericEntries, 'text', numericFieldNameById);
        if (numText.trim()) {
            parts.push(numText.trim());
        }
    }

    // Images
    if (includeImages) {
        const images = entry.images || (entry.imageUrl ? [{ url: entry.imageUrl }] : []);
        if (Array.isArray(images) && images.length > 0) {
            const imgDetails = images.map((img, i) => {
                return img.caption ? `Photo ${i + 1}: ${img.caption}` : `Photo ${i + 1}`;
            });
            parts.push(`[Attachments: ${imgDetails.join('; ')}]`);
        }
    }

    return parts.join('\n\n');
}

/**
 * Formats an entry to Markdown.
 */
export function formatEntryToMarkdown(entry, options = {}) {
    const {
        includeMetadata = true,
        includeSubEntries = true,
        includeNumeric = true,
        includeImages = true,
        entrySectionNameById = {},
        numericFieldNameById = {},
        tagDefinitions = {}
    } = options;

    const dateKey = entry.id || entry.date || '';
    let weekdayStr = '';
    try {
        const parsed = parseISO(dateKey);
        if (isValid(parsed)) {
            weekdayStr = format(parsed, 'EEEE, d MMMM yyyy');
        }
    } catch {
        weekdayStr = '';
    }

    const { title, content } = extractEntryTitleAndContent(entry);

    const parts = [];

    // Header
    parts.push(`## ${dateKey}: ${title}`);
    if (weekdayStr) {
        parts.push(`*${weekdayStr}*`);
    }

    // Metadata
    if (includeMetadata) {
        const metaItems = [];
        if (entry.isSpecial) {
            metaItems.push('★ **Special Day**');
        }
        if (entry.mood) {
            metaItems.push(`**Mood**: ${entry.mood}`);
        }
        if (entry.tags && Array.isArray(entry.tags) && entry.tags.length > 0) {
            const tagNames = entry.tags
                .map(tId => `#${tagDefinitions[tId]?.name || tId}`)
                .filter(Boolean);
            if (tagNames.length > 0) {
                metaItems.push(`**Tags**: ${tagNames.join(' ')}`);
            }
        }
        if (metaItems.length > 0) {
            parts.push(`> ${metaItems.join(' • ')}`);
        }
    }

    // Main Content
    if (content.trim()) {
        parts.push(content.trim());
    }

    // Sub-entries
    if (includeSubEntries && entry.subEntries) {
        const subText = formatSubEntries(entry.subEntries, 'markdown', entrySectionNameById);
        if (subText.trim()) {
            parts.push(subText.trim());
        }
    }

    // Numeric fields
    if (includeNumeric && entry.numericEntries) {
        const numText = formatNumericEntries(entry.numericEntries, 'markdown', numericFieldNameById);
        if (numText.trim()) {
            parts.push(numText.trim());
        }
    }

    // Images
    if (includeImages) {
        const images = entry.images || (entry.imageUrl ? [{ url: entry.imageUrl }] : []);
        if (Array.isArray(images) && images.length > 0) {
            const imgLines = images.map((img, i) => {
                const caption = img.caption ? ` - *${img.caption}*` : '';
                return `- 📷 Attachment ${i + 1}${caption}${img.url ? ` ([link](${img.url}))` : ''}`;
            });
            parts.push(`**Attachments**:\n${imgLines.join('\n')}`);
        }
    }

    return parts.join('\n\n');
}

/**
 * Combines an array of entries into a single string.
 */
export function combineEntries(entries, fmt = 'text', options = {}) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return '';
    }

    const { sortOrder = 'asc', ...formatOptions } = options;

    const sorted = [...entries].sort((a, b) => {
        const dateA = a.id || a.date || '';
        const dateB = b.id || b.date || '';
        return sortOrder === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
    });

    const isMarkdown = fmt === 'markdown' || fmt === 'md';
    const divider = isMarkdown
        ? '\n\n---\n\n'
        : '\n\n' + '='.repeat(72) + '\n\n';

    const formattedList = sorted.map(entry => {
        return isMarkdown
            ? formatEntryToMarkdown(entry, formatOptions)
            : formatEntryToText(entry, formatOptions);
    });

    return formattedList.join(divider);
}

/**
 * Counts total words in a string.
 */
export function countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    const tokens = text.trim().split(/\s+/);
    return tokens.filter(Boolean).length;
}

/**
 * Robust clipboard copy with fallback for iOS PWA and older environments.
 */
export async function copyTextToClipboard(text) {
    if (!text) return false;

    // First try standard modern navigator.clipboard
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Fall through to textarea execCommand fallback
        }
    }

    // Fallback: create temporary off-screen textarea
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return Boolean(successful);
    } catch (e) {
        console.error('Clipboard copy failed fallback:', e);
        return false;
    }
}
