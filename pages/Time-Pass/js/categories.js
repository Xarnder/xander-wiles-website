/**
 * Event categories — every event has one; Misc is always present.
 */

export const DEFAULT_CATEGORY = 'Misc';
export const CATEGORY_MAX = 40;
/** Sentinel value in <select> for “create new category”. */
export const NEW_CATEGORY_VALUE = '__tp_new_category__';

export function normalizeCategoryName(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!s) return DEFAULT_CATEGORY;
  return s.slice(0, CATEGORY_MAX);
}

/** Misc first, then A–Z; case-insensitive unique. */
export function normalizeCategories(list) {
  const out = [];
  const seen = new Set();

  const add = (name) => {
    const n = normalizeCategoryName(name);
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };

  add(DEFAULT_CATEGORY);
  if (Array.isArray(list)) {
    for (const item of list) add(item);
  }

  out.sort((a, b) => {
    if (a === DEFAULT_CATEGORY) return -1;
    if (b === DEFAULT_CATEGORY) return 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
  return out;
}

export function resolveEventCategory(event, categories) {
  const cats = normalizeCategories(categories);
  const raw = normalizeCategoryName(event?.category);
  const match = cats.find((c) => c.toLowerCase() === raw.toLowerCase());
  return match || DEFAULT_CATEGORY;
}

export function categoriesEqual(a, b) {
  return normalizeCategoryName(a).toLowerCase() === normalizeCategoryName(b).toLowerCase();
}

export function mergeCategoriesFromEvents(categories, events) {
  const fromEvents = (Array.isArray(events) ? events : []).map((e) => e?.category);
  return normalizeCategories([...(categories || []), ...fromEvents]);
}

export function canDeleteCategory(name) {
  return normalizeCategoryName(name) !== DEFAULT_CATEGORY;
}
