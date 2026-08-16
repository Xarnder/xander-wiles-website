/**
 * Event categories — every event has one; Misc is always present.
 */

export const DEFAULT_CATEGORY = 'Misc';
export const BIRTHDAY_CATEGORY = 'Birthday';
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

/** True when the event title mentions birth / birthday(s). */
export function titleSuggestsBirthday(name) {
  const s = String(name || '');
  return /\bbirthdays?\b/i.test(s) || /\bbirth\b/i.test(s);
}

/**
 * Prefer an existing Birthday / Birthdays category (any casing);
 * otherwise return the canonical "Birthday" label.
 */
export function resolveBirthdayCategory(categories) {
  const cats = normalizeCategories(categories);
  const existing = cats.find((c) => {
    const key = c.toLowerCase();
    return key === 'birthday' || key === 'birthdays';
  });
  return existing || BIRTHDAY_CATEGORY;
}

/**
 * For new events: if the title looks like a birthday, assign Birthday
 * (or the user's existing birthday category).
 */
export function applyBirthdayCategoryIfNeeded(name, category, categories) {
  if (!titleSuggestsBirthday(name)) {
    return {
      category: normalizeCategoryName(category),
      categories: normalizeCategories(categories),
    };
  }
  const birthday = resolveBirthdayCategory(categories);
  return {
    category: birthday,
    categories: normalizeCategories([...(categories || []), birthday]),
  };
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

export function canRenameCategory(name) {
  return canDeleteCategory(name);
}

/**
 * Rename a category in the settings list.
 * Same name (different casing) updates the label; an existing target merges.
 */
export function applyCategoryRename(categories, fromName, toName) {
  const from = normalizeCategoryName(fromName);
  const trimmed = String(toName ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!trimmed) return { ok: false, error: 'Enter a category name.' };
  const to = normalizeCategoryName(trimmed);

  if (categoriesEqual(from, DEFAULT_CATEGORY)) {
    return { ok: false, error: 'Misc cannot be renamed.' };
  }

  const cats = normalizeCategories(categories);
  if (!cats.some((c) => categoriesEqual(c, from))) {
    return { ok: false, error: 'Category not found.' };
  }
  if (from === to) {
    return { ok: true, unchanged: true, name: from, merged: false, from, categories: cats };
  }

  const existing = cats.find((c) => categoriesEqual(c, to) && !categoriesEqual(c, from));
  const nextName = existing || to;
  const merged = Boolean(existing);
  const nextCategories = merged
    ? cats.filter((c) => !categoriesEqual(c, from))
    : normalizeCategories(cats.map((c) => (categoriesEqual(c, from) ? nextName : c)));

  return { ok: true, unchanged: false, name: nextName, merged, from, categories: nextCategories };
}

/** How many one-click category slots the header/footer bar shows. */
export const QUICK_CATEGORY_SLOT_OPTIONS = [2, 4, 6, 8];
export const DEFAULT_QUICK_CATEGORY_SLOTS = 4;

export function normalizeQuickCategorySlots(value) {
  const n = Math.floor(Number(value));
  if (QUICK_CATEGORY_SLOT_OPTIONS.includes(n)) return n;
  return DEFAULT_QUICK_CATEGORY_SLOTS;
}

/** 2 slots → 2×1; 4/6/8 → 2 rows so the footer bar stays compact. */
export function quickCategoryLayout(slots) {
  const n = normalizeQuickCategorySlots(slots);
  const rows = n === 2 ? 1 : 2;
  return { slots: n, cols: n / rows, rows };
}

export function needsQuickCategoryPick(categories, slots) {
  return normalizeCategories(categories).length > normalizeQuickCategorySlots(slots);
}

/**
 * Categories that occupy the one-click slots.
 * - Fewer categories than slots: use every category (leftover slots stay empty).
 * - More categories than slots, no explicit pick (`null`/`undefined`): first N.
 * - More categories than slots, explicit array (possibly empty): those names, capped at N.
 */
export function resolveQuickCategories(categories, slots, pinned) {
  const cats = normalizeCategories(categories);
  const n = normalizeQuickCategorySlots(slots);
  if (cats.length <= n) return cats;

  if (!Array.isArray(pinned)) return cats.slice(0, n);

  const byKey = new Map(cats.map((c) => [c.toLowerCase(), c]));
  const out = [];
  const used = new Set();
  for (const raw of pinned) {
    if (out.length >= n) break;
    const match = byKey.get(normalizeCategoryName(raw).toLowerCase());
    if (!match || used.has(match.toLowerCase())) continue;
    out.push(match);
    used.add(match.toLowerCase());
  }
  return out;
}

/**
 * Value to persist. `null` means auto (all categories, or first N on overflow).
 * An array is an explicit pick — used only when there are more categories than slots.
 */
export function storedQuickCategories(categories, slots, pinned) {
  const cats = normalizeCategories(categories);
  const n = normalizeQuickCategorySlots(slots);
  if (cats.length <= n) return null;
  if (!Array.isArray(pinned)) return null;
  return resolveQuickCategories(cats, n, pinned);
}
