export const ENTRY_SECTIONS_SETTINGS_DOC = 'entryManagement';
export const MAX_CUSTOM_ENTRY_SECTIONS = 6;
export const ENTRY_SECTION_NAME_MAX_LENGTH = 40;

export function createEntrySectionId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `entry_${crypto.randomUUID()}`;
    }
    return `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

export function hasSubEntryContent(subEntries) {
    return Object.values(cleanSubEntriesForSave(subEntries)).some((value) => (
        value.content.trim() || value.title.trim()
    ));
}

export function subEntriesToPlainText(subEntries) {
    return Object.values(cleanSubEntriesForSave(subEntries))
        .map((value) => [value.title, value.content].filter(Boolean).join('\n'))
        .filter(Boolean)
        .join('\n\n');
}
