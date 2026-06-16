export const ENTRY_SECTIONS_SETTINGS_DOC = 'entryManagement';
export const MAX_CUSTOM_ENTRY_SECTIONS = 6;
export const MAX_NUMERIC_ENTRY_FIELDS = 12;
export const ENTRY_SECTION_NAME_MAX_LENGTH = 40;

export function createEntrySectionId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `entry_${crypto.randomUUID()}`;
    }
    return `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createNumericEntryFieldId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `number_${crypto.randomUUID()}`;
    }
    return `number_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeEntrySectionName(name) {
    return (name || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, ENTRY_SECTION_NAME_MAX_LENGTH);
}

export function normalizeEntrySections(sections) {
    if (!Array.isArray(sections)) return [];

    const seenIds = new Set();

    return sections
        .map((section) => {
            const id = typeof section?.id === 'string' ? section.id.trim() : '';
            const name = sanitizeEntrySectionName(section?.name);

            if (!id || !name || seenIds.has(id)) return null;
            seenIds.add(id);

            return {
                id,
                name,
                hasCustomTitle: Boolean(section.hasCustomTitle),
                createdAt: typeof section.createdAt === 'string' ? section.createdAt : null
            };
        })
        .filter(Boolean)
        .slice(0, MAX_CUSTOM_ENTRY_SECTIONS);
}

export function normalizeNumericEntryFields(fields) {
    if (!Array.isArray(fields)) return [];

    const seenIds = new Set();

    return fields
        .map((field) => {
            const id = typeof field?.id === 'string' ? field.id.trim() : '';
            const name = sanitizeEntrySectionName(field?.name);

            if (!id || !name || seenIds.has(id)) return null;
            seenIds.add(id);

            return {
                id,
                name,
                createdAt: typeof field.createdAt === 'string' ? field.createdAt : null
            };
        })
        .filter(Boolean)
        .slice(0, MAX_NUMERIC_ENTRY_FIELDS);
}

export function cleanSubEntriesForSave(subEntries) {
    if (!subEntries || typeof subEntries !== 'object') return {};

    return Object.entries(subEntries).reduce((result, [sectionId, value]) => {
        if (!sectionId || !value || typeof value !== 'object') return result;

        const content = typeof value.content === 'string' ? value.content : '';
        const title = typeof value.title === 'string' ? value.title.trim() : '';

        if (content.trim() || title) {
            result[sectionId] = { content, title };
        }

        return result;
    }, {});
}

export function cleanNumericEntriesForSave(numericEntries) {
    if (!numericEntries || typeof numericEntries !== 'object') return {};

    return Object.entries(numericEntries).reduce((result, [fieldId, value]) => {
        if (!fieldId || value === '' || value === null || typeof value === 'undefined') return result;

        const numericValue = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(numericValue)) {
            result[fieldId] = numericValue;
        }

        return result;
    }, {});
}

export function hasSubEntryContent(subEntries) {
    return Object.values(cleanSubEntriesForSave(subEntries)).some((value) => (
        value.content.trim() || value.title.trim()
    ));
}

export function hasNumericEntryValues(numericEntries) {
    return Object.keys(cleanNumericEntriesForSave(numericEntries)).length > 0;
}

export function subEntriesToPlainText(subEntries) {
    return Object.values(cleanSubEntriesForSave(subEntries))
        .map((value) => [value.title, value.content].filter(Boolean).join('\n'))
        .filter(Boolean)
        .join('\n\n');
}

export function numericEntriesToPlainText(numericEntries, numericFields = []) {
    const cleanedEntries = cleanNumericEntriesForSave(numericEntries);
    const fieldNameById = normalizeNumericEntryFields(numericFields).reduce((result, field) => {
        result[field.id] = field.name;
        return result;
    }, {});

    return Object.entries(cleanedEntries)
        .map(([fieldId, value]) => `${fieldNameById[fieldId] || fieldId}: ${value}`)
        .join('\n');
}
