import { generateId } from './utils.js';

export const MISC_TAG_ID = 'tag_misc';
export const MAX_TAGS = 8;
export const MAX_CUSTOM_TAGS = 7;
export const MAX_TAG_NAME_LENGTH = 24;

export const GLOW_PALETTE = [
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#3b82f6',
    '#a855f7',
    '#ec4899'
];

export const VALID_GLOW_COLORS = new Set(['none', ...GLOW_PALETTE]);

export const DEFAULT_MISC_TAG = {
    id: MISC_TAG_ID,
    name: 'Misc',
    glowColor: null,
    order: 0
};

export function sortTags(tags) {
    return [...tags].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getTagsById(tags) {
    const map = {};
    (tags || []).forEach((tag) => {
        if (tag && tag.id) map[tag.id] = tag;
    });
    if (!map[MISC_TAG_ID]) map[MISC_TAG_ID] = { ...DEFAULT_MISC_TAG };
    return map;
}

export function ensureDefaultTags(settings) {
    const tags = Array.isArray(settings?.tags) ? settings.tags : [];
    const hasMisc = tags.some((t) => t && t.id === MISC_TAG_ID);
    const normalized = hasMisc
        ? tags.map((t) => normalizeTagDefinition(t)).filter(Boolean)
        : [normalizeTagDefinition(DEFAULT_MISC_TAG), ...tags.map((t) => normalizeTagDefinition(t)).filter(Boolean)];

    const activeTagId = normalized.some((t) => t.id === settings?.activeTagId)
        ? settings.activeTagId
        : MISC_TAG_ID;

    return {
        tags: sortTags(normalized),
        activeTagId
    };
}

function normalizeTagDefinition(tag) {
    if (!tag || typeof tag !== 'object' || !tag.id) return null;
    const name = typeof tag.name === 'string' ? tag.name.trim() : '';
    if (!name) return null;
    const glowColor = tag.id === MISC_TAG_ID
        ? null
        : (GLOW_PALETTE.includes(tag.glowColor) ? tag.glowColor : null);
    if (tag.id !== MISC_TAG_ID && !glowColor) return null;
    return {
        id: tag.id,
        name: name.slice(0, MAX_TAG_NAME_LENGTH),
        glowColor: tag.id === MISC_TAG_ID ? null : glowColor,
        order: Number.isFinite(tag.order) ? tag.order : 0
    };
}

export function resolveTaskGlow(task, tagsById) {
    const tagId = task?.tagId || MISC_TAG_ID;
    const tag = tagsById[tagId] ?? tagsById[MISC_TAG_ID];
    const color = tag?.glowColor;
    return color || null;
}

export function resolveTaskTagId(task) {
    return task?.tagId || MISC_TAG_ID;
}

export function getTagNameForTask(task, tagsById) {
    const tagId = resolveTaskTagId(task);
    return tagsById[tagId]?.name || DEFAULT_MISC_TAG.name;
}

export function validateTagName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return { ok: false, error: 'Tag name is required.' };
    if (trimmed.length > MAX_TAG_NAME_LENGTH) {
        return { ok: false, error: `Tag name must be ${MAX_TAG_NAME_LENGTH} characters or fewer.` };
    }
    return { ok: true, value: trimmed };
}

export function canAddMoreTags(tags) {
    return (tags || []).length < MAX_TAGS;
}

export function isMiscTag(tagId) {
    return tagId === MISC_TAG_ID;
}

export function getNextAvailableGlowColor(tags) {
    const used = new Set(
        (tags || [])
            .filter((t) => t && t.id !== MISC_TAG_ID && t.glowColor)
            .map((t) => t.glowColor)
    );
    return GLOW_PALETTE.find((color) => !used.has(color)) || null;
}

export function createTagDefinition(name, tags) {
    const validation = validateTagName(name);
    if (!validation.ok) return { ok: false, error: validation.error };
    if (!canAddMoreTags(tags)) {
        return { ok: false, error: 'Maximum 8 tags reached.' };
    }

    const glowColor = getNextAvailableGlowColor(tags);
    if (!glowColor) {
        return { ok: false, error: 'No glow colours available.' };
    }

    const maxOrder = (tags || []).reduce((max, t) => Math.max(max, t?.order ?? 0), 0);
    return {
        ok: true,
        tag: {
            id: `tag_${generateId()}`,
            name: validation.value,
            glowColor,
            order: maxOrder + 1
        }
    };
}

export function normalizeImportedTagId(value, tagsById) {
    const id = typeof value === 'string' ? value.trim() : '';
    if (id && tagsById[id]) return id;
    return MISC_TAG_ID;
}
