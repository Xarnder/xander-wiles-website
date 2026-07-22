import { generateId } from './utils.js';

export const MISC_TAG_ID = 'tag_misc';
export const MAX_TAGS = 8;
export const MAX_CUSTOM_TAGS = 7;
export const MAX_TAG_NAME_LENGTH = 24;

/**
 * Shared OKLCH lightness for all tag fills.
 * Tuned so white text stays readable on every hue.
 */
export const TAG_FILL_LIGHTNESS = 0.58;
export const TAG_FILL_INK = 'oklch(0.99 0.01 100)';

/** Tag / glow palette — same L, distinct hue/chroma. */
export const GLOW_PALETTE = [
    `oklch(${TAG_FILL_LIGHTNESS} 0.190 25)`,   // red
    `oklch(${TAG_FILL_LIGHTNESS} 0.165 50)`,   // orange
    `oklch(${TAG_FILL_LIGHTNESS} 0.120 200)`,  // teal (replaces yellow)
    `oklch(${TAG_FILL_LIGHTNESS} 0.155 150)`,  // green
    `oklch(${TAG_FILL_LIGHTNESS} 0.165 260)`,  // blue
    `oklch(${TAG_FILL_LIGHTNESS} 0.185 305)`,  // purple
    `oklch(${TAG_FILL_LIGHTNESS} 0.175 350)`   // pink
];

/** Map legacy hex / prior-OKLCH values onto the current equal-L palette. */
export const LEGACY_HEX_TO_OKLCH = {
    '#ef4444': GLOW_PALETTE[0],
    '#f97316': GLOW_PALETTE[1],
    '#eab308': GLOW_PALETTE[2], // former yellow → teal
    '#22c55e': GLOW_PALETTE[3],
    '#3b82f6': GLOW_PALETTE[4],
    '#a855f7': GLOW_PALETTE[5],
    '#ec4899': GLOW_PALETTE[6],
    // Previous unequal-L OKLCH palette
    'oklch(0.637 0.208 25.3)': GLOW_PALETTE[0],
    'oklch(0.705 0.187 47.6)': GLOW_PALETTE[1],
    'oklch(0.795 0.162 86.0)': GLOW_PALETTE[2],
    'oklch(0.723 0.192 149.6)': GLOW_PALETTE[3],
    'oklch(0.623 0.188 259.8)': GLOW_PALETTE[4],
    'oklch(0.627 0.233 303.9)': GLOW_PALETTE[5],
    'oklch(0.656 0.212 354.3)': GLOW_PALETTE[6],
    // Previous equal-L yellow slot
    'oklch(0.58 0.130 95)': GLOW_PALETTE[2]
};

export const VALID_GLOW_COLORS = new Set(['none', ...GLOW_PALETTE, ...Object.keys(LEGACY_HEX_TO_OKLCH)]);

export const DEFAULT_MISC_TAG = {
    id: MISC_TAG_ID,
    name: 'Misc',
    glowColor: null,
    order: 0
};

const OKLCH_RE = /^oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*(?:\/\s*[0-9.%]+\s*)?\)$/i;

function hueDistance(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

/** Snap any OKLCH colour to the nearest current palette entry by hue. */
function matchPaletteByHue(oklchValue) {
    const match = String(oklchValue || '').match(OKLCH_RE);
    if (!match) return null;
    const hue = Number(match[3]);
    let best = null;
    let bestDist = Infinity;
    for (const color of GLOW_PALETTE) {
        const parts = color.match(OKLCH_RE);
        if (!parts) continue;
        const dist = hueDistance(hue, Number(parts[3]));
        if (dist < bestDist) {
            bestDist = dist;
            best = color;
        }
    }
    return bestDist <= 35 ? best : null;
}

export function normalizeGlowColorValue(value) {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw || raw === 'none') return null;

    const lower = raw.toLowerCase();
    if (LEGACY_HEX_TO_OKLCH[lower]) return LEGACY_HEX_TO_OKLCH[lower];

    const withHash = lower.startsWith('#') ? lower : (lower.match(/^[0-9a-f]{6}$/) ? `#${lower}` : lower);
    if (LEGACY_HEX_TO_OKLCH[withHash]) return LEGACY_HEX_TO_OKLCH[withHash];

    if (GLOW_PALETTE.includes(raw) || GLOW_PALETTE.includes(lower)) {
        return GLOW_PALETTE.find((c) => c === raw || c === lower) || raw;
    }

    if (OKLCH_RE.test(raw) || OKLCH_RE.test(lower)) {
        const exact = GLOW_PALETTE.find((c) => c.toLowerCase() === lower);
        if (exact) return exact;
        if (LEGACY_HEX_TO_OKLCH[lower] || LEGACY_HEX_TO_OKLCH[raw]) {
            return LEGACY_HEX_TO_OKLCH[lower] || LEGACY_HEX_TO_OKLCH[raw];
        }
        return matchPaletteByHue(raw) || matchPaletteByHue(lower);
    }

    return null;
}

/** Ink for tag fills — palette is equal-L and designed for white text. */
export function getContrastingInk(_color) {
    return TAG_FILL_INK;
}

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
        : normalizeGlowColorValue(tag.glowColor);
    if (tag.id !== MISC_TAG_ID && !glowColor) return null;
    return {
        id: tag.id,
        name: name.slice(0, MAX_TAG_NAME_LENGTH),
        glowColor: tag.id === MISC_TAG_ID ? null : glowColor,
        order: Number.isFinite(tag.order) ? tag.order : 0
    };
}

export const TAG_DISPLAY_MODE_GLOW = 'glow';
export const TAG_DISPLAY_MODE_FILL = 'fill';

export function normalizeTagDisplayMode(value) {
    return value === TAG_DISPLAY_MODE_FILL ? TAG_DISPLAY_MODE_FILL : TAG_DISPLAY_MODE_GLOW;
}

export function getTagDisplayMode(settings) {
    return normalizeTagDisplayMode(settings?.tagDisplayMode);
}

export function resolveTaskGlow(task, tagsById) {
    const tagId = task?.tagId || MISC_TAG_ID;
    const tag = tagsById[tagId] ?? tagsById[MISC_TAG_ID];
    return normalizeGlowColorValue(tag?.glowColor);
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
            .map((t) => normalizeGlowColorValue(t.glowColor))
            .filter(Boolean)
    );
    return GLOW_PALETTE.find((color) => !used.has(color)) || null;
}

export function getUnusedGlowColors(tags) {
    const used = new Set(
        (tags || [])
            .filter((t) => t && t.id !== MISC_TAG_ID && t.glowColor)
            .map((t) => normalizeGlowColorValue(t.glowColor))
            .filter(Boolean)
    );
    return GLOW_PALETTE.filter((color) => !used.has(color));
}

/**
 * Swap glow colours between two custom tags. Misc cannot participate.
 */
export function swapTagGlowColors(tags, tagIdA, tagIdB) {
    if (!tagIdA || !tagIdB || tagIdA === tagIdB) {
        return { ok: false, error: 'Pick two different tags to swap.' };
    }
    if (isMiscTag(tagIdA) || isMiscTag(tagIdB)) {
        return { ok: false, error: 'Misc has no colour to swap.' };
    }

    const ensured = Array.isArray(tags) ? tags : [];
    const a = ensured.find((t) => t && t.id === tagIdA);
    const b = ensured.find((t) => t && t.id === tagIdB);
    if (!a || !b) {
        return { ok: false, error: 'Tag not found.' };
    }

    const colorA = normalizeGlowColorValue(a.glowColor);
    const colorB = normalizeGlowColorValue(b.glowColor);
    if (!colorA || !colorB) {
        return { ok: false, error: 'Both tags need a colour to swap.' };
    }

    const nextTags = ensured.map((tag) => {
        if (tag.id === tagIdA) return { ...tag, glowColor: colorB };
        if (tag.id === tagIdB) return { ...tag, glowColor: colorA };
        return tag;
    });

    return { ok: true, tags: sortTags(nextTags.map(normalizeTagDefinition).filter(Boolean)) };
}

/**
 * Assign a palette colour to a custom tag. Colour must be unused (or already this tag's).
 */
export function assignTagGlowColor(tags, tagId, glowColor) {
    if (isMiscTag(tagId)) {
        return { ok: false, error: 'Misc has no colour.' };
    }

    const nextColor = normalizeGlowColorValue(glowColor);
    if (!nextColor || !GLOW_PALETTE.includes(nextColor)) {
        return { ok: false, error: 'Invalid colour.' };
    }

    const ensured = Array.isArray(tags) ? tags : [];
    const target = ensured.find((t) => t && t.id === tagId);
    if (!target) {
        return { ok: false, error: 'Tag not found.' };
    }

    const currentColor = normalizeGlowColorValue(target.glowColor);
    if (currentColor === nextColor) {
        return { ok: true, tags: sortTags(ensured.map(normalizeTagDefinition).filter(Boolean)) };
    }

    const takenByOther = ensured.some(
        (t) => t && t.id !== tagId && !isMiscTag(t.id) && normalizeGlowColorValue(t.glowColor) === nextColor
    );
    if (takenByOther) {
        return { ok: false, error: 'That colour is already used. Tap another tag to swap instead.' };
    }

    const nextTags = ensured.map((tag) => (
        tag.id === tagId ? { ...tag, glowColor: nextColor } : tag
    ));

    return { ok: true, tags: sortTags(nextTags.map(normalizeTagDefinition).filter(Boolean)) };
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
