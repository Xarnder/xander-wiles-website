import {
  ALL_UNITS,
  COLOR_PALETTE,
  COMPACT_CUE_UNITS_DEFAULT,
  COMPACT_CUE_UNITS_MAX,
  COMPACT_CUE_UNITS_MIN,
  COMPACT_CUE_FORMATS,
  DEFAULT_UNITS,
  HARD_EVENT_CAP,
  SOFT_EVENT_CAP,
  getBrowserTimeZone,
  normalizeCompactCueUnits,
  normalizeCompactCueFormat,
  normalizeUnits,
  unitLabel,
} from './constants.js';
import {
  state,
  getViewList,
  getViewSections,
  setView,
  patchSettings,
  filtersAreActive,
  getCategories,
} from './store.js';
import {
  DEFAULT_CATEGORY,
  DEFAULT_QUICK_CATEGORY_SLOTS,
  NEW_CATEGORY_VALUE,
  QUICK_CATEGORY_SLOT_OPTIONS,
  CATEGORY_MAX,
  canDeleteCategory,
  canRenameCategory,
  applyCategoryRename,
  categoriesEqual,
  needsQuickCategoryPick,
  normalizeCategories,
  normalizeCategoryName,
  normalizeQuickCategorySlots,
  quickCategoryLayout,
  resolveEventCategory,
  resolveQuickCategories,
  storedQuickCategories,
  titleSuggestsBirthday,
  resolveBirthdayCategory,
  applyBirthdayCategoryIfNeeded,
} from './categories.js';
import { resolveEventEmoji, emojiPickerChoices, normalizeEventEmoji } from './emoji-from-title.js';
import {
  formatUnitValue,
  recurrenceLabel,
  toast,
  formatDisplayDate,
  formatDisplayTime,
  formatRelativeCue,
  formatAppTimestamp,
  buildCopySummary,
  copyText,
  todayIsoDate,
  offsetIsoDate,
  offsetIsoMonths,
  COMMON_TIME_ZONES,
} from './format.js';
import { isFirebaseConfigured } from '../firebase-config.js';
import {
  computeSpan,
  defaultCalculatorDraft,
  formatSpanCopy,
  applyOffset,
  formatOffsetCopy,
  OFFSET_UNIT_FIELDS,
} from './calculator.js';
import { THEMES } from './theme.js';
import { SORT_OPTIONS, normalizeSort, vmStatBlocks, isThisWeekVm } from './filters.js';
import {
  parseCsv,
  guessColumnMap,
  rowsToEvents,
  previewMappedRows,
} from './csv-import.js';

const LAST_COLOR_KEY = 'time-pass:last-color';
const FILTERS_OPEN_KEY = 'time-pass:filters-open';

/** Prompt users can paste into an AI with a photo/list to get a Time Pass–ready CSV. */
const CSV_AI_PROMPT = `Turn this image or list into a CSV I can import into Time Pass.

Rules:
- Output CSV only (no markdown fences, no commentary).
- Header row exactly: Title,Date,Time
- Column 1 (Title): event name / title
- Column 2 (Date): date of the event as YYYY-MM-DD (example: 2026-08-03)
- Column 3 (Time): time of the event as HH:mm in 24-hour clock (example: 14:30). If no time is known, leave the Time cell empty.
- One event per row. Escape titles that contain commas by wrapping them in double quotes.
- If a date is approximate, pick the best exact calendar day and still use YYYY-MM-DD.
- Do not invent events that are not in the source.`;

let calcDraft = defaultCalculatorDraft();

/** Site-root paths for themeable icons (inlined as SVG — CSS masks flicker on mobile scroll). */
const ICON_URLS = {
  edit: '/assets/SVGs/edit.svg',
  duplicate: '/assets/SVGs/duplicate.svg',
  copy: '/assets/SVGs/copy.svg',
  pin: '/assets/SVGs/pin.svg',
  expand: '/assets/SVGs/expand.svg',
  shrink: '/assets/SVGs/shrink.svg',
  close: '/assets/icons/close-icon.svg',
  back: '/assets/SVGs/Left-ArrowIcons.svg',
  home: '/assets/SVGs/home.svg',
  plus: '/assets/SVGs/plus-icon.svg',
  down: '/assets/SVGs/Down-ArrowIcons.svg',
};

/** @type {Map<string, string>} */
const iconSvgCache = new Map();
/** @type {Map<string, Promise<string|null>>} */
const iconFetchPromises = new Map();

let chromeSig = '';
let toolbarSig = '';

function processSvgMarkup(svgText) {
  return String(svgText || '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<svg\b([^>]*)>/i, (m, attrs) => {
      let next = attrs
        .replace(/\s(width|height)="[^"]*"/gi, '')
        .replace(/\s(width|height)='[^']*'/gi, '');
      if (!/\bfill=/i.test(next)) next += ' fill="currentColor"';
      if (!/\baria-hidden=/i.test(next)) next += ' aria-hidden="true"';
      if (!/\bfocusable=/i.test(next)) next += ' focusable="false"';
      return `<svg${next}>`;
    })
    // Lift paint styles to attributes before dropping style= (stroke icons need this)
    .replace(/\sstyle="([^"]*)"/gi, (_, style) => {
      const props = {};
      for (const part of String(style).split(';')) {
        const idx = part.indexOf(':');
        if (idx < 0) continue;
        const key = part.slice(0, idx).trim().toLowerCase();
        const val = part.slice(idx + 1).trim();
        if (key && val) props[key] = val;
      }
      let attrs = '';
      for (const key of [
        'fill',
        'stroke',
        'stroke-width',
        'stroke-linecap',
        'stroke-linejoin',
        'fill-rule',
        'clip-rule',
      ]) {
        if (props[key]) attrs += ` ${key}="${props[key]}"`;
      }
      return attrs;
    })
    .replace(/fill="(?!none)[^"]*"/gi, 'fill="currentColor"')
    .replace(/stroke="(?!none)[^"]*"/gi, 'stroke="currentColor"')
    .replace(
      /<(path|polygon|rect|circle|ellipse)\b(?![^>]*\bfill=)(?![^>]*\bstroke=)/gi,
      '<$1 fill="currentColor"'
    )
    .replace(/\.st0\{[^}]*\}/g, '.st0{fill:currentColor;fill-rule:evenodd;clip-rule:evenodd;}')
    .replace(/\.cls-1\{[^}]*\}/g, '.cls-1{fill:currentColor;fill-rule:evenodd;}')
    .trim();
}

function ensureIconSvg(name) {
  if (iconSvgCache.has(name)) return Promise.resolve(iconSvgCache.get(name));
  if (iconFetchPromises.has(name)) return iconFetchPromises.get(name);
  const url = ICON_URLS[name];
  if (!url) return Promise.resolve(null);
  const p = fetch(url)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .then((text) => {
      const processed = processSvgMarkup(text);
      iconSvgCache.set(name, processed);
      document.querySelectorAll(`.ui-icon--${name}`).forEach((node) => {
        if (!node.querySelector('svg')) node.innerHTML = processed;
      });
      return processed;
    })
    .catch((err) => {
      console.warn('Icon load failed', name, err);
      iconFetchPromises.delete(name);
      return null;
    });
  iconFetchPromises.set(name, p);
  return p;
}

/** Prefetch all UI icons so first paint uses inline SVG (no CSS-mask flicker). */
export function preloadIcons() {
  return Promise.all(Object.keys(ICON_URLS).map((name) => ensureIconSvg(name)));
}

function hydrateHomeIcon() {
  const home = document.querySelector('.home-escape .ui-icon--home');
  if (!home || home.querySelector('svg')) return;
  const svg = iconSvgCache.get('home');
  if (svg) {
    home.removeAttribute('style');
    home.innerHTML = svg;
  }
}

let handlers = {
  onSignIn: () => {},
  onSignOut: () => {},
  onAdd: () => {},
  onEdit: () => {},
  onBatchEdit: async () => {},
  onDelete: () => {},
  onDuplicate: () => {},
  onFilters: () => {},
  onExport: () => {},
  onImport: () => {},
  onSaveSettings: async () => {},
  onDeleteCategory: async () => {},
  onRenameCategory: async () => {},
};

let lastFocus = null;
let editingId = null;

/** Multi-select / multi-edit (list view, signed-in only). */
let multiSelectMode = false;
const selectedEventIds = new Set();

function pruneSelection() {
  const living = new Set(state.events.map((e) => e.id));
  for (const id of [...selectedEventIds]) {
    if (!living.has(id)) selectedEventIds.delete(id);
  }
}

function setMultiSelectMode(on) {
  multiSelectMode = Boolean(on) && state.mode === 'signed-in' && state.view === 'list';
  if (!multiSelectMode) selectedEventIds.clear();
  document.body.classList.toggle('is-multi-select', multiSelectMode);
  renderToolbar(Date.now());
  renderList(Date.now());
}

function toggleEventSelected(id, force) {
  if (!id || !multiSelectMode) return;
  const next = force === undefined ? !selectedEventIds.has(id) : Boolean(force);
  if (next) selectedEventIds.add(id);
  else selectedEventIds.delete(id);
  renderMultiSelectBar();
  const card = document.querySelector(`.event-card[data-id="${CSS.escape(id)}"]`);
  if (card) {
    const on = selectedEventIds.has(id);
    card.classList.toggle('is-selected', on);
    const cb = card.querySelector('.event-select');
    if (cb) cb.checked = on;
  }
}

function selectVisibleEvents(vms) {
  for (const vm of vms) selectedEventIds.add(vm.event.id);
  renderList(Date.now());
}

function clearSelection() {
  selectedEventIds.clear();
  renderList(Date.now());
}

export function setUIHandlers(h) {
  handlers = { ...handlers, ...h };
}

export function focusSearch() {
  const input = document.getElementById('search-input');
  if (input) input.focus();
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === false || v == null) continue;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function uiIcon(name, extraClass = '') {
  const node = el('span', {
    className: `ui-icon ui-icon--${name}${extraClass ? ` ${extraClass}` : ''}`.trim(),
    'aria-hidden': 'true',
  });
  const cached = iconSvgCache.get(name);
  if (cached) {
    node.innerHTML = cached;
  } else {
    ensureIconSvg(name).then((svg) => {
      if (svg && node.isConnected && !node.querySelector('svg')) node.innerHTML = svg;
    });
  }
  return node;
}

function iconButton({ icon, label, onClick, className = 'icon-btn' }) {
  return el(
    'button',
    {
      type: 'button',
      className,
      'aria-label': label,
      title: label,
      onClick,
    },
    [uiIcon(icon)]
  );
}

function buttonWithIcon({ icon, text, className, onClick, type = 'button', ...rest }) {
  return el(
    'button',
    {
      type,
      className: `${className} btn-with-icon`.trim(),
      onClick,
      ...rest,
    },
    [uiIcon(icon), el('span', { text })]
  );
}

function getFiltersDrawerOpen() {
  try {
    return localStorage.getItem(FILTERS_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function setFiltersDrawerOpen(open) {
  try {
    localStorage.setItem(FILTERS_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function getLastColor() {
  try {
    const stored = localStorage.getItem(LAST_COLOR_KEY);
    if (stored && COLOR_PALETTE.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  return COLOR_PALETTE[0];
}

function saveLastColor(color) {
  try {
    localStorage.setItem(LAST_COLOR_KEY, color);
  } catch {
    /* ignore */
  }
}

function formatTzShort(tz) {
  if (!tz || !String(tz).trim()) return 'local';
  const parts = String(tz).trim().split('/');
  return parts[parts.length - 1].replace(/_/g, ' ');
}

function buildEventMeta(event) {
  const bits = [formatDisplayDate(event.date)];
  if (event.time) bits.push(formatDisplayTime(event.time));
  bits.push(resolveEventCategory(event, state.settings.categories));
  bits.push(recurrenceLabel(event.recurrence?.frequency || 'none'));
  bits.push(formatTzShort(event.timeZone || getBrowserTimeZone()));
  return bits.join(' · ');
}

/** Compact cards: date (+ time) shown on the primary stat row. */
function buildCompactEventDate(event) {
  const bits = [formatDisplayDate(event.date)];
  if (event.time) bits.push(formatDisplayTime(event.time));
  return bits.join(' · ');
}

function applyQuickCategoryLayout(slots) {
  const { cols, rows } = quickCategoryLayout(slots);
  const root = document.documentElement;
  root.style.setProperty('--quick-cat-cols', String(cols));
  root.style.setProperty('--quick-cat-rows', String(rows));
}

async function commitQuickCategoryPrefs({ slots, pinned, toastLabel } = {}) {
  const quickCategorySlots = normalizeQuickCategorySlots(
    slots ?? state.settings.quickCategorySlots
  );
  const cats = getCategories();
  const rawPinned = pinned !== undefined ? pinned : state.settings.quickCategories;
  const quickCategories = storedQuickCategories(cats, quickCategorySlots, rawPinned);
  patchSettings({ quickCategorySlots, quickCategories });
  try {
    await handlers.onSaveSettings({ quickCategorySlots, quickCategories });
    if (toastLabel) toast(toastLabel, 'success');
  } catch (err) {
    toast(err.message || 'Could not save one-click categories', 'error');
  }
}

function renderQuickCategoryGrid({
  slots,
  filled,
  activeCategory = 'all',
  onSelect,
  interactive = true,
  emptyLabel = '',
} = {}) {
  const n = normalizeQuickCategorySlots(slots);
  const list = Array.isArray(filled) ? filled.slice(0, n) : [];
  applyQuickCategoryLayout(n);

  const bar = el('div', {
    className: `quick-category-bar${interactive ? '' : ' is-preview'}`,
    role: interactive ? 'toolbar' : 'presentation',
    'aria-label': interactive ? 'One-click category filters' : undefined,
  });

  for (let i = 0; i < n; i++) {
    const cat = list[i];
    if (!cat) {
      bar.appendChild(
        el('span', {
          className: 'quick-cat-slot is-empty',
          'aria-hidden': 'true',
          text: emptyLabel,
        })
      );
      continue;
    }
    const isActive = activeCategory !== 'all' && categoriesEqual(cat, activeCategory);
    if (!interactive) {
      bar.appendChild(
        el('span', {
          className: `quick-cat-slot chip${isActive ? ' is-active' : ''}`,
          text: cat,
          title: cat,
        })
      );
      continue;
    }
    bar.appendChild(
      el('button', {
        type: 'button',
        className: `quick-cat-slot chip${isActive ? ' is-active' : ''}`,
        text: cat,
        title: isActive ? `${cat} — tap to show all` : `Filter by ${cat}`,
        'aria-pressed': isActive,
        onClick: () => onSelect?.(cat, isActive),
      })
    );
  }
  return bar;
}

function eventCountLabel(shown, total) {
  if (filtersAreActive()) return `${shown} shown · ${total} total`;
  return `${shown} event${shown === 1 ? '' : 's'}`;
}

export function renderChrome() {
  const brandSub = document.getElementById('brand-sub');
  const actions = document.getElementById('header-actions');
  const banner = document.getElementById('preview-banner');
  if (!actions) return;

  hydrateHomeIcon();

  const sig = [
    state.view,
    state.mode,
    state.user?.uid || '',
    state.user?.displayName || '',
    state.user?.email || '',
    calcDraft.tool || '',
    isFirebaseConfigured ? '1' : '0',
  ].join('|');

  const updateBrand = () => {
    if (!brandSub) return;
    if (state.view === 'settings') brandSub.textContent = 'Settings';
    else if (state.view === 'calculator') {
      brandSub.textContent =
        calcDraft.tool === 'offset' ? 'Add or subtract' : 'Date to date';
    } else if (state.mode === 'guest') {
      brandSub.textContent = isFirebaseConfigured
        ? 'Preview — sign in to save'
        : 'Preview — configure Firebase to sign in';
    } else {
      brandSub.textContent = state.user?.displayName || state.user?.email || 'Signed in';
    }
  };

  if (sig === chromeSig && actions.childElementCount > 0) {
    updateBrand();
    return;
  }
  chromeSig = sig;
  actions.replaceChildren();

  if (state.view === 'settings') {
    updateBrand();
    if (banner) banner.hidden = true;
    actions.appendChild(
      buttonWithIcon({
        icon: 'back',
        text: 'Back',
        className: 'btn btn-ghost',
        onClick: () => setView('list'),
      })
    );
    return;
  }

  if (state.view === 'calculator') {
    updateBrand();
    if (banner) banner.hidden = true;
    actions.appendChild(
      buttonWithIcon({
        icon: 'back',
        text: 'Events',
        className: 'btn btn-ghost',
        onClick: () => setView('list'),
      })
    );
    actions.appendChild(
      el('button', {
        type: 'button',
        className: 'btn btn-ghost',
        text: 'Settings',
        onClick: () => setView('settings'),
      })
    );
    return;
  }

  const calcBtn = el('button', {
    type: 'button',
    className: 'btn btn-ghost',
    text: 'Calculator',
    onClick: () => setView('calculator'),
  });

  if (state.mode === 'guest') {
    updateBrand();
    if (banner) {
      banner.hidden = false;
      banner.replaceChildren(
        el('span', {
          text: 'Sample events (read-only). Sign in with Google to sync your own.',
        })
      );
    }
    actions.appendChild(calcBtn);
    actions.appendChild(
      el('button', {
        type: 'button',
        className: 'btn btn-google',
        text: 'Sign in with Google',
        onClick: () => handlers.onSignIn(),
      })
    );
    actions.appendChild(
      el('button', {
        type: 'button',
        className: 'btn btn-ghost',
        text: 'Settings',
        onClick: () => setView('settings'),
      })
    );
  } else {
    updateBrand();
    if (banner) banner.hidden = true;
    actions.appendChild(
      iconButton({
        icon: 'plus',
        label: 'Add event',
        className: 'icon-btn icon-btn--accent',
        onClick: () => openEventModal(null),
      })
    );
    actions.appendChild(calcBtn);
    actions.appendChild(
      el('button', {
        type: 'button',
        className: 'btn btn-ghost',
        text: 'Settings',
        onClick: () => setView('settings'),
      })
    );
  }
}

export function renderToolbar(nowMs = Date.now()) {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;

  const prevSearch = document.getElementById('search-input');
  const restoreSearch =
    prevSearch && document.activeElement === prevSearch
      ? {
          value: prevSearch.value,
          start: prevSearch.selectionStart,
          end: prevSearch.selectionEnd,
        }
      : null;

  const f = state.settings.filters;
  const density = state.settings.cardDensity === 'compact' ? 'compact' : 'expanded';
  const filtersActive = filtersAreActive();
  const shownEarly = getViewList(nowMs).length;
  const totalEarly = state.events.length;
  const drawerOpenEarly = getFiltersDrawerOpen();
  const catsEarly = getCategories();
  const quickSlotsEarly = normalizeQuickCategorySlots(
    state.settings.quickCategorySlots ?? DEFAULT_QUICK_CATEGORY_SLOTS
  );
  const quickFilledEarly = resolveQuickCategories(
    catsEarly,
    quickSlotsEarly,
    state.settings.quickCategories
  );
  const nextToolbarSig = [
    state.mode,
    density,
    multiSelectMode ? '1' : '0',
    drawerOpenEarly ? '1' : '0',
    filtersActive ? '1' : '0',
    f.direction,
    f.recurring,
    f.sort,
    f.category || 'all',
    f.query || '',
    String(shownEarly),
    String(totalEarly),
    catsEarly.join('\0'),
    String(quickSlotsEarly),
    quickFilledEarly.join('\0'),
  ].join('|');

  // Skip wipe-rebuild on sync ticks when filters/chrome are unchanged (keeps icons stable).
  if (!restoreSearch && nextToolbarSig === toolbarSig && toolbar.childElementCount > 0) {
    toolbar.classList.toggle('has-active-filters', filtersActive);
    applyQuickCategoryLayout(quickSlotsEarly);
    return;
  }
  toolbarSig = nextToolbarSig;

  toolbar.classList.toggle('has-active-filters', filtersActive);

  const densityToggle = iconButton({
    icon: density === 'compact' ? 'expand' : 'shrink',
    label: density === 'compact' ? 'Expand cards' : 'Compact cards',
    className: 'icon-btn density-toggle',
    onClick: () => {
      const next = density === 'compact' ? 'expanded' : 'compact';
      patchSettings({ cardDensity: next });
      handlers.onSaveSettings({ cardDensity: next }).catch((err) => {
        toast(err.message || 'Could not save density', 'error');
      });
    },
  });
  densityToggle.title = density === 'compact' ? 'Expanded view' : 'Compact view';
  densityToggle.setAttribute('aria-pressed', density === 'compact' ? 'true' : 'false');

  const dirGroup = el('div', {
    className: 'chip-group chip-group--exclusive',
    role: 'radiogroup',
    'aria-label': 'When',
  });
  for (const [value, label] of [
    ['all', 'All'],
    ['upcoming', 'Upcoming'],
    ['past', 'Past'],
  ]) {
    dirGroup.appendChild(
      el('button', {
        type: 'button',
        className: `chip${f.direction === value ? ' is-active' : ''}`,
        role: 'radio',
        'aria-checked': f.direction === value,
        text: label,
        onClick: () => handlers.onFilters({ direction: value }),
      })
    );
  }

  const whenFamily = el('div', { className: 'filter-family' }, [
    el('div', { className: 'filter-family-head' }, [
      el('span', { className: 'filter-family-label', text: 'When' }),
      el('span', { className: 'filter-family-hint', text: 'Pick one' }),
    ]),
    dirGroup,
  ]);

  const recGroup = el('div', {
    className: 'chip-group chip-group--exclusive',
    role: 'radiogroup',
    'aria-label': 'Type',
  });
  for (const [value, label] of [
    ['all', 'Any'],
    ['recurring', 'Recurring'],
    ['one-shot', 'One-time'],
  ]) {
    recGroup.appendChild(
      el('button', {
        type: 'button',
        className: `chip${f.recurring === value ? ' is-active' : ''}`,
        role: 'radio',
        'aria-checked': f.recurring === value,
        text: label,
        onClick: () => handlers.onFilters({ recurring: value }),
      })
    );
  }

  const typeFamily = el('div', { className: 'filter-family' }, [
    el('div', { className: 'filter-family-head' }, [
      el('span', { className: 'filter-family-label', text: 'Type' }),
      el('span', { className: 'filter-family-hint', text: 'Pick one' }),
    ]),
    recGroup,
  ]);

  const categoryFilterValue = f.category && f.category !== 'all' ? f.category : 'all';
  const categoryFilterSelect = el('select', {
    className: 'category-select',
    'aria-label': 'Filter by category',
    onChange: (e) => handlers.onFilters({ category: e.target.value }),
  });
  categoryFilterSelect.appendChild(el('option', { value: 'all', text: 'All categories' }));
  for (const cat of getCategories()) {
    const opt = el('option', { value: cat, text: cat });
    if (categoriesEqual(cat, categoryFilterValue)) opt.selected = true;
    categoryFilterSelect.appendChild(opt);
  }
  if (categoryFilterValue === 'all') {
    categoryFilterSelect.querySelector('option[value="all"]').selected = true;
  }

  const categoryFamily = el('div', { className: 'filter-family filter-family--category' }, [
    el('div', { className: 'filter-family-head' }, [
      el('span', { className: 'filter-family-label', text: 'Category' }),
      el('span', { className: 'filter-family-hint', text: 'Pick one' }),
    ]),
    el('div', { className: 'category-select-wrap' }, [categoryFilterSelect]),
  ]);

  const sortValue = normalizeSort(f.sort);
  const sortSelect = el('select', {
    className: 'sort-select',
    'aria-label': 'Order events',
    onChange: (e) => handlers.onFilters({ sort: e.target.value }),
  });
  for (const opt of SORT_OPTIONS) {
    const option = el('option', { value: opt.value, text: opt.label, title: opt.hint });
    if (opt.value === sortValue) option.selected = true;
    sortSelect.appendChild(option);
  }
  const sortHint =
    SORT_OPTIONS.find((o) => o.value === sortValue)?.hint || 'Choose how events are ordered';

  const orderFamily = el('div', { className: 'filter-family filter-family--order' }, [
    el('div', { className: 'filter-family-head' }, [
      el('span', { className: 'filter-family-label', text: 'Order' }),
      el('span', { className: 'filter-family-hint', text: 'Pick one' }),
    ]),
    sortSelect,
    el('p', { className: 'filter-family-subhint', text: sortHint }),
  ]);

  const search = el('input', {
    id: 'search-input',
    type: 'search',
    className: 'search-input',
    placeholder: 'Search by name…',
    value: f.query || '',
    'aria-label': 'Search events by name',
    onInput: (e) => handlers.onFilters({ query: e.target.value }),
  });

  const searchFamily = el('div', { className: 'filter-family filter-family--search' }, [
    el('div', { className: 'filter-family-head' }, [
      el('span', { className: 'filter-family-label', text: 'Search' }),
      el('span', { className: 'filter-family-hint', text: 'Combines with When, Type, Category & Order' }),
    ]),
    search,
  ]);

  const filtersPanel = el('div', { className: 'filters-panel' }, [
    el('p', {
      className: 'filters-combine-note',
      text: 'When, Type, Category, Order, and Search work together — choose one option in each group.',
    }),
    el('div', { className: 'filters-grid' }, [
      whenFamily,
      typeFamily,
      categoryFamily,
      orderFamily,
      searchFamily,
    ]),
  ]);

  const shown = getViewList(nowMs).length;
  const total = state.events.length;
  const countText = eventCountLabel(shown, total);

  const metaRow = el('div', { className: 'toolbar-meta' });
  metaRow.appendChild(el('span', { className: 'event-count', text: countText }));

  if (filtersActive) {
    metaRow.appendChild(
      el('button', {
        type: 'button',
        className: 'chip chip--clear',
        text: 'Clear filters',
        onClick: () =>
          handlers.onFilters({
            direction: 'all',
            recurring: 'all',
            query: '',
            sort: 'smart',
            category: 'all',
          }),
      })
    );
  }

  const drawerOpen = getFiltersDrawerOpen();
  const drawerBody = el('div', { className: 'filters-drawer-body', id: 'filters-drawer-body' }, [
    filtersPanel,
    metaRow,
  ]);

  const toggleMeta = el('span', { className: 'filters-drawer-toggle-meta' });
  toggleMeta.appendChild(el('span', { text: countText }));
  if (filtersActive) toggleMeta.appendChild(el('span', { text: '· filtered' }));

  const toggle = el(
    'button',
    {
      type: 'button',
      className: 'filters-drawer-toggle',
      'aria-expanded': drawerOpen,
      'aria-controls': 'filters-drawer-body',
      onClick: () => {
        const next = !getFiltersDrawerOpen();
        setFiltersDrawerOpen(next);
        renderToolbar(Date.now());
      },
    },
    [
      el('span', { text: drawerOpen ? 'Hide filters' : 'Filters' }),
      toggleMeta,
      uiIcon('down', 'filters-drawer-chevron'),
    ]
  );

  const collapsedBar = el('div', { className: 'filters-drawer-summary' }, [
    toggle,
    densityToggle,
  ]);

  if (state.mode === 'signed-in') {
    const selectToggle = el('button', {
      type: 'button',
      className: `chip${multiSelectMode ? ' is-active' : ''}`,
      text: multiSelectMode ? 'Done' : 'Select',
      'aria-pressed': multiSelectMode,
      title: multiSelectMode ? 'Exit multi-select' : 'Select events to multi-edit',
      onClick: () => setMultiSelectMode(!multiSelectMode),
    });
    collapsedBar.appendChild(selectToggle);
  }

  if (filtersActive) {
    collapsedBar.appendChild(
      el('button', {
        type: 'button',
        className: 'chip chip--clear',
        text: 'Clear',
        onClick: () =>
          handlers.onFilters({
            direction: 'all',
            recurring: 'all',
            query: '',
            sort: 'smart',
            category: 'all',
          }),
      })
    );
  }

  const quickSlots = normalizeQuickCategorySlots(
    state.settings.quickCategorySlots ?? DEFAULT_QUICK_CATEGORY_SLOTS
  );
  const quickFilled = resolveQuickCategories(
    getCategories(),
    quickSlots,
    state.settings.quickCategories
  );
  const categoryFilterNow = f.category && f.category !== 'all' ? f.category : 'all';
  const quickBar = renderQuickCategoryGrid({
    slots: quickSlots,
    filled: quickFilled,
    activeCategory: categoryFilterNow,
    onSelect: (cat, isActive) => {
      handlers.onFilters({ category: isActive ? 'all' : cat });
    },
  });

  const chrome = el('div', { className: 'quick-category-chrome' }, [collapsedBar, quickBar]);

  const drawer = el(
    'div',
    {
      className: `filters-drawer${drawerOpen ? ' is-open' : ''}`,
      id: 'filters-drawer',
    },
    [chrome, drawerBody]
  );

  toolbar.replaceChildren(drawer);

  const listView = document.getElementById('list-view');
  if (listView) listView.classList.toggle('has-active-filters', filtersActive);

  if (restoreSearch) {
    const next = document.getElementById('search-input');
    if (next) {
      next.value = restoreSearch.value;
      next.focus();
      try {
        const len = next.value.length;
        const start = Math.min(restoreSearch.start ?? len, len);
        const end = Math.min(restoreSearch.end ?? len, len);
        next.setSelectionRange(start, end);
      } catch {
        /* type=search may reject selection in some browsers */
      }
    }
  }
}


function cueMaxUnits(compact) {
  if (!compact) return 1;
  return normalizeCompactCueUnits(
    state.settings.compactCueUnits ?? COMPACT_CUE_UNITS_DEFAULT
  );
}

function formatBlockCue(block, compact = false) {
  return formatRelativeCue(block, {
    maxUnits: cueMaxUnits(compact),
    format: compact
      ? normalizeCompactCueFormat(state.settings.compactCueFormat)
      : 'words',
  });
}

function renderUnitRow(parts, visibleUnits) {
  const row = el('div', { className: 'unit-row' });
  for (const u of visibleUnits) {
    const v = parts[u] || 0;
    row.appendChild(
      el('div', { className: 'unit-pill' }, [
        el('span', { className: 'value', text: formatUnitValue(u, v) }),
        el('span', { className: 'label', text: unitLabel(u, v) }),
      ])
    );
  }
  return row;
}

function renderDirectionRow(block, compact = false, event = null) {
  const row = el('div', {
    className: `direction-row${compact && event ? ' direction-row--with-date' : ''}`,
  });
  if (!compact) {
    row.appendChild(
      el('span', {
        className: 'direction-tag',
        text: block.direction === 'until' ? 'Until next' : 'Since',
      })
    );
  }
  row.appendChild(el('span', { className: 'relative-cue', text: formatBlockCue(block, compact) }));
  if (compact && event) {
    row.appendChild(
      el('span', {
        className: 'event-date-inline',
        text: buildCompactEventDate(event),
      })
    );
  }
  return row;
}

function renderStatExtra(block, label, compact) {
  const sec = el('div', { className: 'secondary-block' });
  const secRow = el('div', { className: 'direction-row' });
  if (!compact) {
    secRow.appendChild(el('span', { className: 'direction-tag', text: label }));
  }
  secRow.appendChild(el('span', { className: 'relative-cue', text: formatBlockCue(block, compact) }));
  sec.appendChild(secRow);
  if (!compact) {
    sec.appendChild(renderUnitRow(block.parts, block.visibleUnits));
  }
  return sec;
}

function renderCycleProgress(progress, compact) {
  const wrap = el('div', {
    className: `cycle-progress${compact ? ' is-compact' : ''}`,
  });
  const row = el('div', { className: 'direction-row' });
  row.appendChild(el('span', { className: 'direction-tag', text: 'Through cycle' }));
  row.appendChild(
    el('span', {
      className: 'relative-cue cycle-progress-cue',
      text: `${progress.label} · ${progress.percent}%`,
    })
  );
  wrap.appendChild(row);

  if (!compact) {
    const track = el('div', {
      className: 'cycle-progress-track',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(progress.percent),
      'aria-label': progress.label,
    });
    const fill = el('div', { className: 'cycle-progress-fill' });
    fill.style.width = `${progress.percent}%`;
    track.appendChild(fill);
    const marks = el('div', { className: 'cycle-progress-marks', 'aria-hidden': 'true' });
    for (const pct of [25, 50, 75]) {
      const mark = el('span', { className: 'cycle-progress-mark' });
      mark.style.left = `${pct}%`;
      marks.appendChild(mark);
    }
    track.appendChild(marks);
    wrap.appendChild(track);
    wrap.appendChild(
      el('p', {
        className: 'cycle-progress-detail',
        text: progress.detail,
      })
    );
  }

  return wrap;
}

function renderCard(vm, readOnly, { thisWeek = false, pinned = false } = {}) {
  const { event, primary, secondary, sinceFirst, cycleProgress } = vm;
  const fullColour = Boolean(state.settings.fullColourCards);
  const compact = state.settings.cardDensity === 'compact';
  const selecting = multiSelectMode && !readOnly;
  const selected = selecting && selectedEventIds.has(event.id);
  const eventId = event.id;
  const isPinned = Boolean(pinned || event.pinned);
  const li = el('li', {
    className: `event-card glass${fullColour ? ' is-full-colour' : ''}${compact ? ' is-compact' : ''}${
      thisWeek ? ' is-this-week' : ''
    }${isPinned ? ' is-pinned' : ''}${selecting ? ' is-selectable' : ''}${selected ? ' is-selected' : ''}`,
    style: `--event-color: ${event.color}`,
    'data-id': eventId,
  });
  li._tpVm = vm;
  li.dataset.shapeKey = cardShapeKey(vm, readOnly, thisWeek, isPinned);

  const head = el('div', { className: 'event-card-head' });

  if (selecting) {
    const check = el('input', {
      type: 'checkbox',
      className: 'event-select',
      checked: selected,
      'aria-label': `Select ${event.name}`,
      onClick: (e) => e.stopPropagation(),
      onChange: (e) => toggleEventSelected(eventId, e.target.checked),
    });
    head.appendChild(check);
  }

  const titleBlock = el('div', { className: 'event-title-block' });
  const titleRow = el('div', { className: 'event-title-row' });
  if (isPinned) {
    titleRow.appendChild(uiIcon('pin', 'event-pin-mark'));
  }
  titleRow.appendChild(el('h2', { className: 'event-title', text: event.name }));
  titleBlock.appendChild(titleRow);
  if (isPinned && isThisWeekVm(vm)) {
    titleBlock.appendChild(
      el('p', { className: 'event-also-week', text: 'Also this week' })
    );
  }
  if (!compact) {
    titleBlock.appendChild(el('p', { className: 'event-meta', text: buildEventMeta(event) }));
  }
  head.appendChild(titleBlock);

  if (!readOnly && !selecting) {
    const actions = el('div', { className: 'event-actions' });
    actions.appendChild(
      iconButton({
        icon: 'edit',
        label: `Edit ${event.name}`,
        onClick: () => {
          const live = state.events.find((e) => e.id === eventId);
          openEventModal(live || li._tpVm?.event || null);
        },
      })
    );
    actions.appendChild(
      iconButton({
        icon: 'copy',
        label: `Copy summary for ${event.name}`,
        onClick: async () => {
          const liveVm = li._tpVm;
          if (!liveVm) return;
          const ok = await copyText(buildCopySummary(liveVm));
          toast(ok ? 'Copied to clipboard' : 'Could not copy', ok ? 'success' : 'error');
        },
      })
    );
    head.appendChild(actions);
  }

  if (selecting) {
    li.addEventListener('click', (e) => {
      if (e.target.closest('button, a, input, label')) return;
      toggleEventSelected(eventId);
    });
  }

  const lead = el('div', { className: 'event-card-lead' });
  lead.appendChild(
    el('span', {
      className: 'event-emoji',
      text: resolveEventEmoji(event),
      'aria-hidden': 'true',
    })
  );
  const leadBody = el('div', { className: 'event-card-lead-body' });
  leadBody.appendChild(head);
  leadBody.appendChild(renderDirectionRow(primary, compact, event));
  lead.appendChild(leadBody);
  li.appendChild(lead);

  if (!compact) {
    li.appendChild(renderUnitRow(primary.parts, primary.visibleUnits));
  }

  if (cycleProgress && !compact) li.appendChild(renderCycleProgress(cycleProgress, false));
  if (secondary) li.appendChild(renderStatExtra(secondary, 'Since last', compact));
  if (sinceFirst) li.appendChild(renderStatExtra(sinceFirst, 'Since first', compact));

  return li;
}

function renderSyncBanner() {
  const listView = document.getElementById('list-view');
  const list = document.getElementById('event-list');
  if (!listView || !list) return;

  let banner = document.getElementById('sync-banner');
  const show = state.mode === 'signed-in' && state.syncing && !state.syncReady;

  if (!show) {
    if (banner) banner.remove();
    return;
  }

  if (!banner) {
    banner = el('div', {
      id: 'sync-banner',
      className: 'sync-banner glass',
      text: 'Syncing your events…',
    });
    listView.insertBefore(banner, list);
  }
}

/**
 * Display entries matching DOM order:
 * Pinned (user) → This week (automatic, never mixed with Pinned) → remainder.
 * An event is shown in at most one of those bands.
 */
function getDisplayEntries(nowMs = Date.now()) {
  const f = state.settings.filters;
  const sections = getViewSections(nowMs);
  const pinned = sections.pinned || [];
  const pinnedIds = new Set(pinned.map((vm) => vm.event.id));
  const thisWeek = (sections.thisWeek || []).filter((vm) => !pinnedIds.has(vm.event.id));
  const thisWeekIds = new Set(thisWeek.map((vm) => vm.event.id));
  const skipIds = new Set([...pinnedIds, ...thisWeekIds]);

  const upcoming = (sections.upcoming || []).filter((vm) => !skipIds.has(vm.event.id));
  const past = (sections.past || []).filter((vm) => !skipIds.has(vm.event.id));
  const all = (sections.all || []).filter((vm) => !skipIds.has(vm.event.id));

  const showSectionHeaders =
    f.direction === 'all' &&
    normalizeSort(f.sort) === 'smart' &&
    upcoming.length > 0 &&
    past.length > 0;

  const entries = [];

  if (pinned.length) {
    entries.push({
      type: 'heading',
      key: 'pinned',
      text: 'Pinned',
    });
    for (const vm of pinned) {
      entries.push({
        type: 'card',
        id: vm.event.id,
        vm,
        thisWeek: false,
        pinned: true,
      });
    }
  }

  if (thisWeek.length) {
    entries.push({
      type: 'heading',
      key: 'this-week',
      text: "This week's events",
    });
    for (const vm of thisWeek) {
      entries.push({
        type: 'card',
        id: vm.event.id,
        vm,
        thisWeek: true,
        pinned: false,
      });
    }
  }

  if (showSectionHeaders) {
    if (upcoming.length) {
      entries.push({ type: 'heading', key: 'upcoming', text: 'Upcoming' });
      for (const vm of upcoming) {
        entries.push({ type: 'card', id: vm.event.id, vm, thisWeek: false, pinned: false });
      }
    }
    if (past.length) {
      entries.push({ type: 'heading', key: 'past', text: 'Past' });
      for (const vm of past) {
        entries.push({ type: 'card', id: vm.event.id, vm, thisWeek: false, pinned: false });
      }
    }
    return entries;
  }

  for (const vm of all) {
    entries.push({ type: 'card', id: vm.event.id, vm, thisWeek: false, pinned: false });
  }
  return entries;
}

function getDisplayVms(nowMs = Date.now()) {
  return getDisplayEntries(nowMs)
    .filter((e) => e.type === 'card')
    .map((e) => e.vm);
}

/** Structural fingerprint — changing this recreates that card (icons included). */
function cardShapeKey(vm, readOnly, thisWeek = false, pinned = false) {
  const compact = state.settings.cardDensity === 'compact';
  const selecting = multiSelectMode && !readOnly;
  const blocks = vmStatBlocks(vm);
  return [
    compact ? 'c-date-em2' : 'e-em2',
    state.settings.fullColourCards ? '1' : '0',
    selecting ? 's' : 'n',
    readOnly ? 'r' : 'w',
    thisWeek ? 'tw' : '',
    pinned || vm.event?.pinned ? 'pin' : '',
    (pinned || vm.event?.pinned) && isThisWeekVm(vm) ? 'alsoTw' : '',
    vm.secondary ? 'sec' : '',
    vm.sinceFirst ? 'sf' : '',
    vm.cycleProgress && !compact ? 'cp' : '',
    blocks.map((b) => (b.visibleUnits || []).join(',')).join(';'),
  ].join('|');
}

function patchCardDigits(card, vm) {
  const rows = card.querySelectorAll('.unit-row');
  const blocks = vmStatBlocks(vm);
  blocks.forEach((block, bi) => {
    const row = rows[bi];
    if (!row) return;
    const pills = row.querySelectorAll('.unit-pill');
    block.visibleUnits.forEach((u, ui) => {
      const pill = pills[ui];
      if (!pill) return;
      const valueEl = pill.querySelector('.value');
      const labelEl = pill.querySelector('.label');
      const v = block.parts[u] || 0;
      const nextVal = formatUnitValue(u, v);
      if (valueEl && valueEl.textContent !== nextVal) valueEl.textContent = nextVal;
      const nextLabel = unitLabel(u, v);
      if (labelEl && labelEl.textContent !== nextLabel) labelEl.textContent = nextLabel;
    });
  });
  patchRelativeCues(card, vm);
}

/** Update mutable card fields without recreating icon buttons. */
function patchCardInPlace(card, vm) {
  card._tpVm = vm;
  const color = vm.event.color || '';
  if (card.style.getPropertyValue('--event-color') !== color) {
    card.style.setProperty('--event-color', color);
  }

  const title = card.querySelector('.event-title');
  if (title && title.textContent !== vm.event.name) title.textContent = vm.event.name;

  const emojiEl = card.querySelector('.event-emoji');
  if (emojiEl) {
    const nextEmoji = resolveEventEmoji(vm.event);
    if (emojiEl.textContent !== nextEmoji) emojiEl.textContent = nextEmoji;
  }

  const meta = card.querySelector('.event-meta');
  if (meta) {
    const nextMeta = buildEventMeta(vm.event);
    if (meta.textContent !== nextMeta) meta.textContent = nextMeta;
  }

  const dateInline = card.querySelector('.event-date-inline');
  if (dateInline) {
    const nextDate = buildCompactEventDate(vm.event);
    if (dateInline.textContent !== nextDate) dateInline.textContent = nextDate;
  }

  const editBtn = card.querySelector('.event-actions button[aria-label^="Edit "]');
  if (editBtn) {
    const label = `Edit ${vm.event.name}`;
    if (editBtn.getAttribute('aria-label') !== label) {
      editBtn.setAttribute('aria-label', label);
      editBtn.title = label;
    }
  }
  const copyBtn = card.querySelector('.event-actions button[aria-label^="Copy summary"]');
  if (copyBtn) {
    const label = `Copy summary for ${vm.event.name}`;
    if (copyBtn.getAttribute('aria-label') !== label) {
      copyBtn.setAttribute('aria-label', label);
      copyBtn.title = label;
    }
  }

  const check = card.querySelector('.event-select');
  if (check) {
    const label = `Select ${vm.event.name}`;
    if (check.getAttribute('aria-label') !== label) check.setAttribute('aria-label', label);
    const selected = selectedEventIds.has(vm.event.id);
    if (check.checked !== selected) check.checked = selected;
    card.classList.toggle('is-selected', selected);
  }

  card.classList.toggle('is-pinned', vm.event.pinned === true);

  patchCardDigits(card, vm);
}

function sectionHeadingClass(key) {
  if (key === 'this-week') return 'section-heading section-heading--this-week';
  if (key === 'pinned') return 'section-heading section-heading--pinned';
  return 'section-heading';
}

function renderSectionHeading(entry) {
  const kids = [];
  if (entry.key === 'pinned') kids.push(uiIcon('pin', 'section-heading-icon'));
  kids.push(el('span', { className: 'section-heading-label', text: entry.text }));
  return el(
    'li',
    {
      className: sectionHeadingClass(entry.key),
      'data-section-key': entry.key,
    },
    kids
  );
}

function patchSectionHeading(heading, entry) {
  heading.className = sectionHeadingClass(entry.key);
  heading.setAttribute('data-section-key', entry.key);
  let label = heading.querySelector('.section-heading-label');
  const icon = heading.querySelector('.section-heading-icon');
  if (!label) {
    heading.replaceChildren();
    const next = renderSectionHeading(entry);
    heading.className = next.className;
    heading.append(...next.childNodes);
    return;
  }
  if (label.textContent !== entry.text) label.textContent = entry.text;
  if (entry.key === 'pinned' && !icon) {
    heading.insertBefore(uiIcon('pin', 'section-heading-icon'), label);
  } else if (entry.key !== 'pinned' && icon) {
    icon.remove();
  }
}

/**
 * Reuse existing card/heading nodes; move with insertBefore.
 * Never wipe the list — preserves scroll and keeps icon SVG nodes alive.
 */
function reconcileEventList(list, nowMs, readOnly) {
  const entries = getDisplayEntries(nowMs);
  const existingCards = new Map();
  const existingHeadings = new Map();

  for (const child of [...list.children]) {
    if (child.classList?.contains('event-card')) {
      const id = child.getAttribute('data-id');
      if (id) existingCards.set(id, child);
    } else if (child.classList?.contains('section-heading')) {
      const key = child.getAttribute('data-section-key') || child.textContent;
      if (key) existingHeadings.set(key, child);
    }
  }

  const nextNodes = [];

  for (const entry of entries) {
    if (entry.type === 'heading') {
      let heading = existingHeadings.get(entry.key);
      if (heading) {
        existingHeadings.delete(entry.key);
        patchSectionHeading(heading, entry);
      } else {
        heading = renderSectionHeading(entry);
      }
      nextNodes.push(heading);
      continue;
    }

    const shape = cardShapeKey(
      entry.vm,
      readOnly,
      Boolean(entry.thisWeek),
      Boolean(entry.pinned)
    );
    let card = existingCards.get(entry.id);
    if (card && card.dataset.shapeKey === shape) {
      existingCards.delete(entry.id);
      patchCardInPlace(card, entry.vm);
    } else {
      // Shape changed or new — create fresh card; old node (if any) is dropped.
      existingCards.delete(entry.id);
      card = renderCard(entry.vm, readOnly, {
        thisWeek: Boolean(entry.thisWeek),
        pinned: Boolean(entry.pinned),
      });
    }
    nextNodes.push(card);
  }

  let orderChanged = nextNodes.length !== list.childElementCount;
  if (!orderChanged) {
    for (let i = 0; i < nextNodes.length; i++) {
      if (list.children[i] !== nextNodes[i]) {
        orderChanged = true;
        break;
      }
    }
  }

  if (orderChanged) {
    const scrollEl = document.scrollingElement || document.documentElement;
    const scrollY = scrollEl ? scrollEl.scrollTop : window.scrollY || 0;
    for (let i = 0; i < nextNodes.length; i++) {
      const want = nextNodes[i];
      if (list.children[i] !== want) {
        list.insertBefore(want, list.children[i] || null);
      }
    }
    while (list.childElementCount > nextNodes.length) {
      list.removeChild(list.lastElementChild);
    }
    restoreScrollY(scrollY);
  }
}

function restoreScrollY(y) {
  const scrollEl = document.scrollingElement || document.documentElement;
  if (scrollEl) scrollEl.scrollTop = y;
  if (typeof window.scrollTo === 'function') window.scrollTo(0, y);
}

/** Floor so short cues (e.g. "now") don't collapse cards uncomfortably. */
const COMPACT_CARD_MIN_FLOOR_REM = 11.5;

let compactColumnMinRaf = 0;

/**
 * Size compact grid columns from the longest on-screen stat row
 * (relative cue, and cue + date on the primary row).
 */
function syncCompactColumnMin(list) {
  if (!list) return;
  if (!list.classList.contains('is-compact')) {
    list.style.removeProperty('--card-min-compact');
    return;
  }

  const sample = list.querySelector('.event-card.is-compact');
  if (!sample) {
    list.style.removeProperty('--card-min-compact');
    return;
  }

  let maxBody = 0;
  for (const card of list.querySelectorAll('.event-card.is-compact')) {
    for (const row of card.querySelectorAll('.direction-row')) {
      const cue = row.querySelector('.relative-cue');
      if (!cue) continue;
      const date = row.querySelector('.event-date-inline');
      const gap = date ? parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap) || 0 : 0;
      const need = cue.scrollWidth + (date ? date.scrollWidth + gap : 0);
      if (need > maxBody) maxBody = need;
    }
  }

  const pad =
    (parseFloat(getComputedStyle(sample).paddingLeft) || 0) +
    (parseFloat(getComputedStyle(sample).paddingRight) || 0);
  const emoji = sample.querySelector('.event-emoji');
  const emojiW = emoji ? emoji.getBoundingClientRect().width : 0;
  const lead = sample.querySelector('.event-card-lead');
  const leadGap = lead ? parseFloat(getComputedStyle(lead).columnGap || getComputedStyle(lead).gap) || 0 : 0;
  const select = sample.querySelector('.event-select');
  const selectW = select
    ? select.getBoundingClientRect().width +
      (parseFloat(getComputedStyle(select).marginLeft) || 0) +
      (parseFloat(getComputedStyle(select).marginRight) || 0)
    : 0;

  const rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const floor = COMPACT_CARD_MIN_FLOOR_REM * rootFs;
  const minPx = Math.ceil(Math.max(floor, pad + selectW + emojiW + leadGap + maxBody));
  const next = `${minPx}px`;
  if (list.style.getPropertyValue('--card-min-compact') !== next) {
    list.style.setProperty('--card-min-compact', next);
  }
}

function scheduleCompactColumnMin(list = document.getElementById('event-list')) {
  if (!list) return;
  if (compactColumnMinRaf) cancelAnimationFrame(compactColumnMinRaf);
  compactColumnMinRaf = requestAnimationFrame(() => {
    compactColumnMinRaf = 0;
    syncCompactColumnMin(list);
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => scheduleCompactColumnMin());
}

export function renderList(nowMs = Date.now()) {
  const list = document.getElementById('event-list');
  const empty = document.getElementById('empty-state');
  if (!list || !empty) return;

  if (state.mode !== 'signed-in' || state.view !== 'list') {
    multiSelectMode = false;
    selectedEventIds.clear();
    document.body.classList.remove('is-multi-select');
  }
  pruneSelection();

  renderSyncBanner();
  renderMultiSelectBar();

  const readOnly = state.mode === 'guest';
  const vms = getDisplayVms(nowMs);
  const compact = state.settings.cardDensity === 'compact';

  list.classList.toggle('is-compact', compact);
  if (!compact) list.style.removeProperty('--card-min-compact');
  reconcileEventList(list, nowMs, readOnly);
  scheduleCompactColumnMin(list);

  if (!vms.length) {
    empty.hidden = false;
    empty.replaceChildren(
      el('h2', { text: state.mode === 'guest' ? 'No preview events' : 'No matching events' }),
      el('p', {
        text:
          state.mode === 'guest'
            ? 'Sign in to create your own countdowns and count-ups.'
            : 'Try clearing filters or add a new event.',
      }),
      state.mode === 'signed-in'
        ? el('button', {
            type: 'button',
            className: 'btn',
            text: 'Add event',
            onClick: () => openEventModal(null),
          })
        : el('button', {
            type: 'button',
            className: 'btn btn-google',
            text: 'Sign in with Google',
            onClick: () => handlers.onSignIn(),
          })
    );
  } else {
    empty.hidden = true;
    empty.replaceChildren();
  }
}

function renderMultiSelectBar() {
  const bar = document.getElementById('multi-select-bar');
  if (!bar) return;

  const show = multiSelectMode && state.mode === 'signed-in' && state.view === 'list';
  bar.hidden = !show;
  if (!show) {
    bar.replaceChildren();
    return;
  }

  pruneSelection();
  const vms = getViewList(Date.now());
  const visibleIds = vms.map((vm) => vm.event.id);
  const count = selectedEventIds.size;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedEventIds.has(id));

  bar.replaceChildren(
    el('div', { className: 'multi-select-bar-copy' }, [
      el('strong', { text: `${count} selected` }),
      el('span', {
        className: 'settings-muted',
        text: 'Edit colour, units, category & recurrence — titles and dates stay put.',
      }),
    ]),
    el('div', { className: 'multi-select-bar-actions' }, [
      el('button', {
        type: 'button',
        className: 'btn btn-ghost',
        text: allVisibleSelected ? 'Clear visible' : 'Select visible',
        onClick: () => {
          if (allVisibleSelected) {
            for (const id of visibleIds) selectedEventIds.delete(id);
            renderList(Date.now());
          } else {
            selectVisibleEvents(vms);
          }
        },
      }),
      el('button', {
        type: 'button',
        className: 'btn btn-ghost',
        text: 'Clear',
        disabled: count === 0,
        onClick: () => clearSelection(),
      }),
      el('button', {
        type: 'button',
        className: 'btn',
        text: 'Edit selected',
        disabled: count === 0,
        onClick: () => openMultiEditModal([...selectedEventIds]),
      }),
    ])
  );
}

function renderShortcutsSection() {
  const section = el('section', { className: 'settings-section' });
  section.appendChild(el('h3', { text: 'Shortcuts' }));
  const list = el('ul', { className: 'settings-shortcuts' });
  for (const [key, desc] of [
    ['N', 'Add event'],
    ['/', 'Focus search'],
    ['S', 'Open settings'],
    ['Esc', 'Back from settings / calculator'],
  ]) {
    const item = el('li', { className: 'settings-shortcut' });
    item.appendChild(el('kbd', { text: key }));
    item.appendChild(el('span', { text: desc }));
    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
}

function renderQuickCategorySettings() {
  const section = el('section', { className: 'settings-section' });
  section.appendChild(el('h3', { text: 'One-click categories' }));
  section.appendChild(
    el('p', {
      className: 'settings-muted',
      text: 'Permanent filter buttons in the header (desktop) and footer (phone). Choose 2, 4, 6, or 8 slots.',
    })
  );

  const cats = getCategories();
  const slots = normalizeQuickCategorySlots(
    state.settings.quickCategorySlots ?? DEFAULT_QUICK_CATEGORY_SLOTS
  );
  const mustPick = needsQuickCategoryPick(cats, slots);
  const filled = resolveQuickCategories(cats, slots, state.settings.quickCategories);

  const slotGroup = el('div', {
    className: 'chip-group chip-group--exclusive',
    role: 'radiogroup',
    'aria-label': 'One-click category slots',
  });
  for (const n of QUICK_CATEGORY_SLOT_OPTIONS) {
    const active = slots === n;
    slotGroup.appendChild(
      el('button', {
        type: 'button',
        className: `chip${active ? ' is-active' : ''}`,
        role: 'radio',
        'aria-checked': active,
        text: String(n),
        title: n === 2 ? '2 slots' : `${n} slots`,
        onClick: async () => {
          if (slots === n) return;
          await commitQuickCategoryPrefs({
            slots: n,
            pinned: state.settings.quickCategories,
            toastLabel: n === 2 ? 'One-click bar shows 2 slots' : `One-click bar shows ${n} slots`,
          });
        },
      })
    );
  }
  section.appendChild(slotGroup);

  const previewLabel = el('p', {
    className: 'settings-toggle-title',
    text: 'Bar preview',
  });
  section.appendChild(previewLabel);
  section.appendChild(
    renderQuickCategoryGrid({
      slots,
      filled,
      interactive: false,
    })
  );

  if (!mustPick) {
    section.appendChild(
      el('p', {
        className: 'settings-muted',
        text:
          cats.length === 1
            ? 'You have 1 category, so it fills the bar. Leftover slots stay empty until you add more.'
            : `You have ${cats.length} categories and ${slots} slots, so every category is pinned automatically. Leftover slots stay empty until you add more.`,
      })
    );
    return section;
  }

  section.appendChild(
    el('p', {
      className: 'settings-toggle-title',
      text: 'Choose which categories stay in the bar',
    })
  );
  section.appendChild(
    el('p', {
      className: 'settings-muted',
      text: `You have ${cats.length} categories and ${slots} slots. Pick up to ${slots}. ${filled.length} selected.`,
    })
  );

  const pickGroup = el('div', {
    className: 'quick-category-picker',
    role: 'group',
    'aria-label': 'Pinned one-click categories',
  });

  for (const cat of cats) {
    const selected = filled.some((c) => categoriesEqual(c, cat));
    const atCap = filled.length >= slots && !selected;
    pickGroup.appendChild(
      el('button', {
        type: 'button',
        className: `chip quick-cat-pick${selected ? ' is-active' : ''}`,
        'aria-pressed': selected,
        title: atCap
          ? `Deselect one to free a slot`
          : selected
            ? `Remove ${cat} from the bar`
            : `Add ${cat} to the bar`,
        text: cat,
        onClick: async () => {
          let nextPinned;
          if (selected) {
            nextPinned = filled.filter((c) => !categoriesEqual(c, cat));
          } else if (filled.length >= slots) {
            toast(`Deselect one first — ${slots} slots are full`, 'info');
            return;
          } else {
            nextPinned = [...filled, cat];
          }
          await commitQuickCategoryPrefs({ slots, pinned: nextPinned });
        },
      })
    );
  }
  section.appendChild(pickGroup);
  return section;
}

function renderSettingsPage() {
  const page = document.getElementById('settings-page');
  if (!page) return;
  page.replaceChildren();

  page.appendChild(el('h2', { className: 'settings-title', text: 'Settings' }));
  page.appendChild(
    el('p', {
      className: 'settings-lead',
      text:
        state.mode === 'signed-in'
          ? `${state.events.length} events · soft warn ${SOFT_EVENT_CAP} · hard stop ${HARD_EVENT_CAP}`
          : 'Display preferences for this device. Sign in to sync events and backups.',
    })
  );

  const appearance = el('section', { className: 'settings-section' });
  appearance.appendChild(el('h3', { text: 'Appearance' }));

  appearance.appendChild(el('p', { className: 'settings-toggle-title', text: 'Theme' }));
  appearance.appendChild(
    el('p', {
      className: 'settings-muted',
      text: 'Choose Atmosphere (current look), Pure black OLED, or White light mode.',
    })
  );

  const themeGroup = el('div', {
    className: 'theme-selector',
    role: 'radiogroup',
    'aria-label': 'Colour theme',
  });
  const currentTheme = state.settings.theme || 'atmosphere';
  for (const t of THEMES) {
    const active = currentTheme === t.id;
    themeGroup.appendChild(
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          className: `theme-option${active ? ' is-active' : ''}`,
          'aria-checked': active,
          onClick: async () => {
            if (currentTheme === t.id) return;
            patchSettings({ theme: t.id });
            try {
              await handlers.onSaveSettings({ theme: t.id });
              toast(`${t.label} on`, 'success');
            } catch (err) {
              toast(err.message || 'Could not save theme', 'error');
            }
          },
        },
        [
          el('span', { className: 'theme-option-label', text: t.label }),
          el('span', { className: 'theme-option-desc', text: t.desc }),
        ]
      )
    );
  }
  appearance.appendChild(themeGroup);

  const toggleRow = el('label', { className: 'settings-toggle-row' });
  const toggle = el('input', {
    type: 'checkbox',
    checked: Boolean(state.settings.fullColourCards),
    onChange: async (e) => {
      const fullColourCards = e.target.checked;
      patchSettings({ fullColourCards });
      try {
        await handlers.onSaveSettings({ fullColourCards });
        toast(fullColourCards ? 'Full colour cards on' : 'Full colour cards off', 'success');
      } catch (err) {
        toast(err.message || 'Could not save setting', 'error');
      }
    },
  });
  const toggleCopy = el('div', { className: 'settings-toggle-copy' });
  toggleCopy.appendChild(el('span', { className: 'settings-toggle-title', text: 'Full colour cards' }));
  toggleCopy.appendChild(
    el('span', {
      className: 'settings-toggle-desc',
      text: 'Fill each event card background with its accent colour (border always uses the accent).',
    })
  );
  toggleRow.appendChild(toggle);
  toggleRow.appendChild(toggleCopy);
  appearance.appendChild(toggleRow);

  appearance.appendChild(
    el('p', { className: 'settings-toggle-title', text: 'Compact cue detail' })
  );
  appearance.appendChild(
    el('p', {
      className: 'settings-muted',
      text: 'In compact view, relative cues show this many leading units. Pair with Compact time format below. Default is 2.',
    })
  );

  const cueUnits = normalizeCompactCueUnits(
    state.settings.compactCueUnits ?? COMPACT_CUE_UNITS_DEFAULT
  );
  const cueGroup = el('div', {
    className: 'chip-group chip-group--exclusive',
    role: 'radiogroup',
    'aria-label': 'Compact cue units',
  });
  for (let n = COMPACT_CUE_UNITS_MIN; n <= COMPACT_CUE_UNITS_MAX; n++) {
    const active = cueUnits === n;
    cueGroup.appendChild(
      el('button', {
        type: 'button',
        className: `chip${active ? ' is-active' : ''}`,
        role: 'radio',
        'aria-checked': active,
        text: String(n),
        title: n === 1 ? '1 unit' : `${n} units`,
        onClick: async () => {
          if (cueUnits === n) return;
          patchSettings({ compactCueUnits: n });
          try {
            await handlers.onSaveSettings({ compactCueUnits: n });
            toast(
              n === 1 ? 'Compact cues show 1 unit' : `Compact cues show ${n} units`,
              'success'
            );
          } catch (err) {
            toast(err.message || 'Could not save setting', 'error');
          }
        },
      })
    );
  }
  appearance.appendChild(cueGroup);

  appearance.appendChild(
    el('p', { className: 'settings-toggle-title', text: 'Compact time format' })
  );
  appearance.appendChild(
    el('p', {
      className: 'settings-muted',
      text: 'How compact cards write the relative cue. Expanded cards keep full words.',
    })
  );

  const cueFormat = normalizeCompactCueFormat(state.settings.compactCueFormat);
  const formatGroup = el('div', {
    className: 'cue-format-selector',
    role: 'radiogroup',
    'aria-label': 'Compact time format',
  });
  for (const opt of COMPACT_CUE_FORMATS) {
    const active = cueFormat === opt.value;
    formatGroup.appendChild(
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          className: `cue-format-option${active ? ' is-active' : ''}`,
          'aria-checked': active,
          onClick: async () => {
            if (cueFormat === opt.value) return;
            patchSettings({ compactCueFormat: opt.value });
            try {
              await handlers.onSaveSettings({ compactCueFormat: opt.value });
              toast(`${opt.label} format on`, 'success');
            } catch (err) {
              toast(err.message || 'Could not save setting', 'error');
            }
          },
        },
        [
          el('span', { className: 'cue-format-option-label', text: opt.label }),
          el('span', { className: 'cue-format-option-example', text: opt.hint }),
        ]
      )
    );
  }
  appearance.appendChild(formatGroup);

  const densityNote = el('p', {
    className: 'settings-muted',
    text: 'Card density is controlled by the compact/expand icon in the list toolbar and syncs when signed in.',
  });
  appearance.appendChild(densityNote);
  page.appendChild(appearance);

  const categoriesSection = el('section', { className: 'settings-section' });
  categoriesSection.appendChild(el('h3', { text: 'Categories' }));
  categoriesSection.appendChild(
    el('p', {
      className: 'settings-muted',
      text: 'Every event needs a category (Misc by default). Rename a category to update every event that uses it. Delete moves those events to Misc.',
    })
  );

  const catList = el('ul', { className: 'category-manage-list' });
  for (const cat of getCategories()) {
    const row = el('li', { className: 'category-manage-row' });
    row.appendChild(el('span', { className: 'category-manage-name', text: cat }));
    if (canRenameCategory(cat) || canDeleteCategory(cat)) {
      const count = state.events.filter((e) =>
        categoriesEqual(e.category || DEFAULT_CATEGORY, cat)
      ).length;
      const actions = el('div', { className: 'category-manage-actions' });
      if (canRenameCategory(cat)) {
        actions.appendChild(
          el('button', {
            type: 'button',
            className: 'btn btn-ghost btn-sm',
            text: 'Rename',
            'aria-label': `Rename category ${cat}`,
            onClick: () => openRenameCategoryModal(cat, count),
          })
        );
      }
      if (canDeleteCategory(cat)) {
        actions.appendChild(
          el('button', {
            type: 'button',
            className: 'btn btn-danger btn-sm',
            text: 'Delete',
            'aria-label': `Delete category ${cat}`,
            onClick: () => confirmDeleteCategory(cat, count),
          })
        );
      }
      row.appendChild(actions);
    } else {
      row.appendChild(el('span', { className: 'category-manage-lock', text: 'Default' }));
    }
    catList.appendChild(row);
  }
  categoriesSection.appendChild(catList);

  const addRow = el('div', { className: 'category-add-row' });
  const addInput = el('input', {
    type: 'text',
    className: 'category-new-input',
    maxlength: String(CATEGORY_MAX),
    placeholder: 'New category name',
    autocomplete: 'off',
    'aria-label': 'New category name',
  });
  const addBtn = el('button', {
    type: 'button',
    className: 'btn btn-ghost btn-sm',
    text: 'Add',
  });
  const commitAdd = async () => {
    const raw = String(addInput.value || '').trim();
    if (!raw) {
      toast('Enter a category name.', 'info');
      addInput.focus();
      return;
    }
    const name = normalizeCategoryName(raw);
    const prev = getCategories();
    if (prev.some((c) => categoriesEqual(c, name))) {
      toast(`“${name}” already exists.`, 'info');
      return;
    }
    const next = normalizeCategories([...prev, name]);
    patchSettings({ categories: next });
    try {
      await handlers.onSaveSettings({ categories: next });
      toast(`Category “${name}” added`, 'success');
    } catch (err) {
      toast(err.message || 'Could not add category', 'error');
    }
  };
  addBtn.addEventListener('click', () => commitAdd());
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitAdd();
    }
  });
  addRow.appendChild(addInput);
  addRow.appendChild(addBtn);
  categoriesSection.appendChild(addRow);
  page.appendChild(categoriesSection);
  page.appendChild(renderQuickCategorySettings());

  const data = el('section', { className: 'settings-section' });
  data.appendChild(el('h3', { text: 'Data' }));

  if (state.mode === 'signed-in') {
    const row = el('div', { className: 'settings-actions' });
    row.appendChild(
      el('button', {
        type: 'button',
        className: 'btn btn-ghost',
        text: 'Export JSON',
        onClick: () => handlers.onExport(),
      })
    );
    const fileLabel = el('label', { className: 'file-glass', text: 'Import JSON' });
    fileLabel.appendChild(
      el('input', {
        type: 'file',
        accept: 'application/json,.json',
        onChange: async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const events = Array.isArray(parsed) ? parsed : parsed.events;
            handlers.onImport(events);
          } catch (err) {
            toast(`Import failed: ${err.message}`, 'error');
          } finally {
            e.target.value = '';
          }
        },
      })
    );
    row.appendChild(fileLabel);

    const csvLabel = el('label', { className: 'file-glass', text: 'Import CSV' });
    csvLabel.appendChild(
      el('input', {
        type: 'file',
        accept: 'text/csv,.csv,text/plain',
        onChange: async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const text = await file.text();
            const parsed = parseCsv(text);
            openCsvImportModal(parsed, file.name);
          } catch (err) {
            toast(`CSV import failed: ${err.message}`, 'error');
          } finally {
            e.target.value = '';
          }
        },
      })
    );
    row.appendChild(csvLabel);
    row.appendChild(
      el('button', {
        type: 'button',
        className: 'btn btn-ghost',
        text: 'Copy AI prompt',
        title: 'Copy a prompt you can paste into ChatGPT / Claude with a photo or list',
        onClick: async () => {
          const ok = await copyText(CSV_AI_PROMPT);
          toast(ok ? 'AI prompt copied' : 'Could not copy', ok ? 'success' : 'error');
        },
      })
    );
    data.appendChild(row);
    data.appendChild(
      el('p', {
        className: 'settings-muted',
        text: 'Tip: copy the AI prompt, paste it with a photo or messy list, then Import CSV the reply.',
      })
    );
  } else {
    data.appendChild(
      el('p', {
        className: 'settings-muted',
        text: 'Sign in to export or import event backups.',
      })
    );
    data.appendChild(
      el('button', {
        type: 'button',
        className: 'btn btn-google',
        text: 'Sign in with Google',
        onClick: () => handlers.onSignIn(),
      })
    );
  }
  page.appendChild(data);

  page.appendChild(renderShortcutsSection());

  if (state.mode === 'signed-in') {
    const account = el('section', { className: 'settings-section' });
    account.appendChild(el('h3', { text: 'Account' }));
    account.appendChild(
      el('p', {
        className: 'settings-muted',
        text: state.user?.email || state.user?.displayName || 'Signed in',
      })
    );
    account.appendChild(
      el('button', {
        type: 'button',
        className: 'btn btn-ghost',
        text: 'Sign out',
        onClick: () => {
          setView('list');
          handlers.onSignOut();
        },
      })
    );
    page.appendChild(account);
  }
}

function renderCalcToolTabs() {
  const tabs = el('div', { className: 'calc-tool-tabs', role: 'tablist', 'aria-label': 'Calculator mode' });
  for (const [value, label] of [
    ['span', 'Date to Date'],
    ['offset', 'Add / Subtract'],
  ]) {
    const active = (calcDraft.tool || 'span') === value;
    tabs.appendChild(
      el('button', {
        type: 'button',
        role: 'tab',
        className: `calc-tool-tab${active ? ' is-active' : ''}`,
        'aria-selected': active,
        text: label,
        onClick: () => {
          if (calcDraft.tool === value) return;
          calcDraft.tool = value;
          renderCalculatorPage();
        },
      })
    );
  }
  return tabs;
}

function renderSpanCalculator() {
  const result = computeSpan(calcDraft);

  const startDate = el('input', {
    type: 'date',
    className: 'calc-input',
    value: calcDraft.startDate,
    'aria-label': 'Start date',
    onChange: (e) => {
      calcDraft.startDate = e.target.value;
      renderCalculatorPage();
    },
  });
  const startTime = el('input', {
    type: 'time',
    className: 'calc-input',
    value: calcDraft.startTime,
    disabled: !calcDraft.includeStartTime,
    'aria-label': 'Start time',
    onChange: (e) => {
      calcDraft.startTime = e.target.value;
      renderCalculatorPage();
    },
  });
  const startTimeToggle = el('input', {
    type: 'checkbox',
    checked: calcDraft.includeStartTime,
    onChange: (e) => {
      calcDraft.includeStartTime = e.target.checked;
      renderCalculatorPage();
    },
  });

  const endDate = el('input', {
    type: 'date',
    className: 'calc-input',
    value: calcDraft.endDate,
    'aria-label': 'End date',
    onChange: (e) => {
      calcDraft.endDate = e.target.value;
      renderCalculatorPage();
    },
  });
  const endTime = el('input', {
    type: 'time',
    className: 'calc-input',
    value: calcDraft.endTime,
    disabled: !calcDraft.includeEndTime,
    'aria-label': 'End time',
    onChange: (e) => {
      calcDraft.endTime = e.target.value;
      renderCalculatorPage();
    },
  });
  const endTimeToggle = el('input', {
    type: 'checkbox',
    checked: calcDraft.includeEndTime,
    onChange: (e) => {
      calcDraft.includeEndTime = e.target.checked;
      renderCalculatorPage();
    },
  });

  const inputs = el('div', { className: 'calc-inputs glass' }, [
    el('div', { className: 'calc-inputs-head' }, [
      el('h2', { className: 'calc-title', text: 'Date to Date' }),
      el('p', { className: 'calc-tz', text: `Using ${getBrowserTimeZone()}` }),
    ]),
    el('div', { className: 'calc-endpoint' }, [
      el('span', { className: 'calc-endpoint-label', text: 'Start' }),
      el('div', { className: 'calc-endpoint-row' }, [
        el('label', { className: 'calc-field' }, [
          el('span', { className: 'calc-field-label', text: 'Date' }),
          startDate,
        ]),
        el('label', { className: 'calc-field calc-field--time' }, [
          el('span', { className: 'calc-field-label', text: 'Time' }),
          startTime,
        ]),
      ]),
      el('label', { className: 'checkbox-row calc-time-toggle' }, [
        startTimeToggle,
        el('span', { text: 'Include start time' }),
      ]),
    ]),
    el('div', { className: 'calc-swap-row' }, [
      el('button', {
        type: 'button',
        className: 'btn btn-ghost calc-swap',
        text: 'Swap start ↔ end',
        onClick: () => {
          calcDraft = {
            ...calcDraft,
            startDate: calcDraft.endDate,
            startTime: calcDraft.endTime,
            includeStartTime: calcDraft.includeEndTime,
            endDate: calcDraft.startDate,
            endTime: calcDraft.startTime,
            includeEndTime: calcDraft.includeStartTime,
          };
          renderCalculatorPage();
        },
      }),
    ]),
    el('div', { className: 'calc-endpoint' }, [
      el('span', { className: 'calc-endpoint-label', text: 'End' }),
      el('div', { className: 'calc-endpoint-row' }, [
        el('label', { className: 'calc-field' }, [
          el('span', { className: 'calc-field-label', text: 'Date' }),
          endDate,
        ]),
        el('label', { className: 'calc-field calc-field--time' }, [
          el('span', { className: 'calc-field-label', text: 'Time' }),
          endTime,
        ]),
      ]),
      el('label', { className: 'checkbox-row calc-time-toggle' }, [
        endTimeToggle,
        el('span', { text: 'Include end time' }),
      ]),
    ]),
    el('div', { className: 'calc-quick-row' }, [
      el('button', {
        type: 'button',
        className: 'chip',
        text: 'Today → +1 week',
        onClick: () => {
          calcDraft.startDate = todayIsoDate();
          calcDraft.endDate = offsetIsoDate(7);
          renderCalculatorPage();
        },
      }),
      el('button', {
        type: 'button',
        className: 'chip',
        text: 'Today → +1 year',
        onClick: () => {
          calcDraft.startDate = todayIsoDate();
          calcDraft.endDate = offsetIsoDate(365);
          renderCalculatorPage();
        },
      }),
      el('button', {
        type: 'button',
        className: 'chip',
        text: 'Now',
        onClick: () => {
          const now = new Date();
          const hh = String(now.getHours()).padStart(2, '0');
          const mm = String(now.getMinutes()).padStart(2, '0');
          calcDraft.startDate = todayIsoDate();
          calcDraft.startTime = `${hh}:${mm}`;
          calcDraft.includeStartTime = true;
          calcDraft.endDate = todayIsoDate();
          calcDraft.endTime = `${hh}:${mm}`;
          calcDraft.includeEndTime = true;
          renderCalculatorPage();
        },
      }),
    ]),
  ]);

  const results = el('div', { className: 'calc-results glass' });
  results.appendChild(el('span', { className: 'calc-results-label', text: 'Result' }));

  if (!result.ok) {
    results.appendChild(el('p', { className: 'calc-error', text: result.error }));
  } else {
    results.appendChild(
      el('div', { className: 'calc-headline' }, [
        el('div', { className: 'calc-headline-main' }, [
          el('span', {
            className: 'calc-headline-value',
            text: `${result.primary.value} ${result.primary.unit}`,
          }),
          el('p', { className: 'calc-breakdown', text: result.breakdown }),
        ]),
        iconButton({
          icon: 'copy',
          label: 'Copy result',
          className: 'icon-btn calc-copy',
          onClick: async () => {
            const ok = await copyText(formatSpanCopy(result, calcDraft));
            toast(ok ? 'Copied result' : 'Could not copy', ok ? 'success' : 'error');
          },
        }),
      ])
    );

    if (result.sameInstant) {
      results.appendChild(
        el('p', { className: 'calc-note', text: 'Start and end are the same instant.' })
      );
    } else if (result.reversed) {
      results.appendChild(
        el('p', {
          className: 'calc-note',
          text: 'End is before start — showing the absolute span.',
        })
      );
    }

    const alts = el('div', { className: `calc-alts${calcDraft.altsOpen ? ' is-open' : ''}` });
    alts.appendChild(
      el(
        'button',
        {
          type: 'button',
          className: 'calc-alts-toggle',
          'aria-expanded': calcDraft.altsOpen,
          onClick: () => {
            calcDraft.altsOpen = !calcDraft.altsOpen;
            renderCalculatorPage();
          },
        },
        [
          el('span', { text: 'Alternative time units' }),
          uiIcon('down', 'calc-alts-chevron'),
        ]
      )
    );
    const list = el('ul', { className: 'calc-alts-list' });
    for (const alt of result.alternatives) {
      list.appendChild(el('li', { text: alt.text }));
    }
    alts.appendChild(list);
    results.appendChild(alts);
  }

  return [inputs, results];
}

function renderOffsetCalculator() {
  const result = applyOffset(calcDraft);

  const startDate = el('input', {
    type: 'date',
    className: 'calc-input',
    value: calcDraft.startDate,
    'aria-label': 'Start date',
    onChange: (e) => {
      calcDraft.startDate = e.target.value;
      renderCalculatorPage();
    },
  });
  const startTime = el('input', {
    type: 'time',
    className: 'calc-input',
    value: calcDraft.startTime,
    disabled: !calcDraft.includeStartTime,
    'aria-label': 'Start time',
    onChange: (e) => {
      calcDraft.startTime = e.target.value;
      renderCalculatorPage();
    },
  });
  const startTimeToggle = el('input', {
    type: 'checkbox',
    checked: calcDraft.includeStartTime,
    onChange: (e) => {
      calcDraft.includeStartTime = e.target.checked;
      renderCalculatorPage();
    },
  });

  const opGroup = el('div', {
    className: 'calc-op-toggle',
    role: 'group',
    'aria-label': 'Add or subtract',
  });
  for (const [value, label] of [
    ['add', 'Add'],
    ['subtract', 'Subtract'],
  ]) {
    opGroup.appendChild(
      el('button', {
        type: 'button',
        className: `calc-op-btn${calcDraft.offsetOp === value ? ' is-active' : ''}`,
        text: label,
        'aria-pressed': calcDraft.offsetOp === value,
        onClick: () => {
          calcDraft.offsetOp = value;
          renderCalculatorPage();
        },
      })
    );
  }

  const grid = el('div', { className: 'calc-offset-grid', role: 'group', 'aria-label': 'Duration to apply' });
  for (const row of ['ym', 'wd', 'hms']) {
    const rowEl = el('div', { className: `calc-offset-row calc-offset-row--${row}` });
    for (const field of OFFSET_UNIT_FIELDS.filter((f) => f.row === row)) {
      const input = el('input', {
        type: 'number',
        className: 'calc-offset-input',
        min: '0',
        step: '1',
        inputmode: 'numeric',
        value: String(calcDraft[field.key] ?? 0),
        'aria-label': field.label,
        onChange: (e) => {
          const n = Number(e.target.value);
          calcDraft[field.key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
          renderCalculatorPage();
        },
      });
      rowEl.appendChild(
        el('label', { className: 'calc-offset-cell' }, [
          input,
          el('span', { className: 'calc-offset-unit', text: field.label }),
        ])
      );
    }
    grid.appendChild(rowEl);
  }

  const inputs = el('div', { className: 'calc-inputs glass' }, [
    el('div', { className: 'calc-inputs-head' }, [
      el('h2', { className: 'calc-title', text: 'Add / Subtract' }),
      el('p', { className: 'calc-tz', text: `Using ${getBrowserTimeZone()}` }),
    ]),
    el('div', { className: 'calc-endpoint' }, [
      el('span', { className: 'calc-endpoint-label', text: 'Start' }),
      el('div', { className: 'calc-endpoint-row' }, [
        el('label', { className: 'calc-field' }, [
          el('span', { className: 'calc-field-label', text: 'Date' }),
          startDate,
        ]),
        el('label', { className: 'calc-field calc-field--time' }, [
          el('span', { className: 'calc-field-label', text: 'Time' }),
          startTime,
        ]),
      ]),
      el('label', { className: 'checkbox-row calc-time-toggle' }, [
        startTimeToggle,
        el('span', { text: 'Include start time' }),
      ]),
    ]),
    opGroup,
    grid,
    el('div', { className: 'calc-quick-row' }, [
      el('button', {
        type: 'button',
        className: 'chip',
        text: 'Clear units',
        onClick: () => {
          calcDraft.offsetYears = 0;
          calcDraft.offsetMonths = 0;
          calcDraft.offsetWeeks = 0;
          calcDraft.offsetDays = 0;
          calcDraft.offsetHours = 0;
          calcDraft.offsetMinutes = 0;
          calcDraft.offsetSeconds = 0;
          renderCalculatorPage();
        },
      }),
      el('button', {
        type: 'button',
        className: 'chip',
        text: '+1 year',
        onClick: () => {
          calcDraft.offsetOp = 'add';
          calcDraft.offsetYears = (Number(calcDraft.offsetYears) || 0) + 1;
          renderCalculatorPage();
        },
      }),
      el('button', {
        type: 'button',
        className: 'chip',
        text: 'Use result as start',
        onClick: () => {
          if (!result.ok) return;
          calcDraft.startDate = result.isoDate;
          if (calcDraft.includeStartTime) calcDraft.startTime = result.isoTime;
          renderCalculatorPage();
          toast('Result set as new start', 'success');
        },
      }),
    ]),
  ]);

  const results = el('div', { className: 'calc-results glass' });
  results.appendChild(el('span', { className: 'calc-results-label', text: 'Result date' }));

  if (!result.ok) {
    results.appendChild(el('p', { className: 'calc-error', text: result.error }));
  } else {
    const opWord = result.operation === 'subtract' ? 'minus' : 'plus';
    results.appendChild(
      el('div', { className: 'calc-headline' }, [
        el('div', { className: 'calc-headline-main' }, [
          el('span', { className: 'calc-headline-value', text: result.displayDate }),
          el('p', {
            className: 'calc-breakdown',
            text: `${result.displayTime} · ${opWord} ${result.offsetSummary}`,
          }),
        ]),
        iconButton({
          icon: 'copy',
          label: 'Copy result',
          className: 'icon-btn calc-copy',
          onClick: async () => {
            const ok = await copyText(formatOffsetCopy(result, calcDraft));
            toast(ok ? 'Copied result' : 'Could not copy', ok ? 'success' : 'error');
          },
        }),
      ])
    );
    results.appendChild(
      el('p', {
        className: 'calc-note',
        text: `ISO ${result.isoDate}${calcDraft.includeStartTime ? ` ${result.isoTime}` : ''}`,
      })
    );
  }

  return [inputs, results];
}

function renderCalculatorPage() {
  const page = document.getElementById('calculator-page');
  if (!page) return;
  if (!calcDraft.tool) calcDraft.tool = 'span';

  const body =
    calcDraft.tool === 'offset' ? renderOffsetCalculator() : renderSpanCalculator();
  page.replaceChildren(renderCalcToolTabs(), ...body);
}


export function renderAll(nowMs = Date.now()) {
  const listView = document.getElementById('list-view');
  const settingsView = document.getElementById('settings-view');
  const calculatorView = document.getElementById('calculator-view');
  const isSettings = state.view === 'settings';
  const isCalculator = state.view === 'calculator';

  document.body.classList.toggle('is-settings-view', isSettings);
  document.body.classList.toggle('is-calculator-view', isCalculator);

  if (isSettings || isCalculator || state.mode !== 'signed-in') {
    multiSelectMode = false;
    selectedEventIds.clear();
    document.body.classList.remove('is-multi-select');
  }

  renderChrome();

  if (isSettings) {
    if (listView) {
      listView.hidden = true;
      listView.setAttribute('aria-hidden', 'true');
    }
    if (calculatorView) {
      calculatorView.hidden = true;
      calculatorView.setAttribute('aria-hidden', 'true');
    }
    if (settingsView) {
      settingsView.hidden = false;
      settingsView.removeAttribute('aria-hidden');
    }
    renderSettingsPage();
    return;
  }

  if (isCalculator) {
    if (listView) {
      listView.hidden = true;
      listView.setAttribute('aria-hidden', 'true');
    }
    if (settingsView) {
      settingsView.hidden = true;
      settingsView.setAttribute('aria-hidden', 'true');
    }
    if (calculatorView) {
      calculatorView.hidden = false;
      calculatorView.removeAttribute('aria-hidden');
    }
    renderCalculatorPage();
    return;
  }

  if (listView) {
    listView.hidden = false;
    listView.removeAttribute('aria-hidden');
  }
  if (settingsView) {
    settingsView.hidden = true;
    settingsView.setAttribute('aria-hidden', 'true');
  }
  if (calculatorView) {
    calculatorView.hidden = true;
    calculatorView.setAttribute('aria-hidden', 'true');
  }
  renderToolbar(nowMs);
  renderList(nowMs);
}

function patchRelativeCues(card, vm) {
  const cues = card.querySelectorAll('.relative-cue:not(.cycle-progress-cue)');
  const blocks = vmStatBlocks(vm);
  blocks.forEach((block, i) => {
    const cueEl = cues[i];
    if (!cueEl) return;
    const next = formatBlockCue(block, state.settings.cardDensity === 'compact');
    if (cueEl.textContent !== next) cueEl.textContent = next;
  });

  const progressCue = card.querySelector('.cycle-progress-cue');
  const progress = vm.cycleProgress;
  if (progressCue && progress) {
    const next = `${progress.label} · ${progress.percent}%`;
    if (progressCue.textContent !== next) progressCue.textContent = next;
  }
  const track = card.querySelector('.cycle-progress-track');
  const fill = card.querySelector('.cycle-progress-fill');
  if (track && fill && progress) {
    const w = `${progress.percent}%`;
    if (fill.style.width !== w) fill.style.width = w;
    track.setAttribute('aria-valuenow', String(progress.percent));
    track.setAttribute('aria-label', progress.label);
  }
}

export function patchListDigits(nowMs = Date.now()) {
  if (state.view !== 'list') return;
  const list = document.getElementById('event-list');
  if (!list) return;

  const entries = getDisplayEntries(nowMs);
  const cards = [...list.querySelectorAll('.event-card[data-id]')];
  const cardEntries = entries.filter((e) => e.type === 'card');
  const cardById = new Map(cards.map((c) => [c.getAttribute('data-id'), c]));

  // Same ids in same order → patch digits only (no DOM structural work).
  const sameSet =
    cards.length === cardEntries.length &&
    cardEntries.every((e, i) => cards[i]?.getAttribute('data-id') === e.id);

  if (sameSet) {
    for (const entry of cardEntries) {
      const card = cardById.get(entry.id);
      if (!card) continue;
      // Shape drift (units appeared/disappeared) → reconcile that card only via list pass.
      if (
        card.dataset.shapeKey !==
        cardShapeKey(
          entry.vm,
          state.mode === 'guest',
          Boolean(entry.thisWeek),
          Boolean(entry.pinned)
        )
      ) {
        reconcileEventList(list, nowMs, state.mode === 'guest');
        scheduleCompactColumnMin(list);
        return;
      }
      patchCardInPlace(card, entry.vm);
    }
    scheduleCompactColumnMin(list);
    return;
  }

  // Order/membership changed (e.g. this-week boundary) — move/reuse nodes, never wipe.
  reconcileEventList(list, nowMs, state.mode === 'guest');
  scheduleCompactColumnMin(list);
}

function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.replaceChildren();
  editingId = null;
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
}

function trapFocus(modal, initialFocus) {
  const focusables = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const target = initialFocus || first;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const isField = target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
  // Autofocusing a <16px field (or any field on iOS) zooms the page and hides the modal.
  if (touch && isField) {
    if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
    modal.focus({ preventScroll: true });
  } else {
    target.focus({ preventScroll: true });
  }
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

function ensureTzDatalist() {
  let datalist = document.getElementById('tz-list');
  if (datalist) return datalist;
  datalist = el('datalist', { id: 'tz-list' });
  for (const tz of COMMON_TIME_ZONES) {
    datalist.appendChild(el('option', { value: tz }));
  }
  document.body.appendChild(datalist);
  return datalist;
}

function defaultExcludeFromThisWeek(event) {
  if (!event) return false;
  if (event.excludeFromThisWeek === true) return true;
  if (event.excludeFromThisWeek === false) return false;
  const freq = event.recurrence?.frequency || 'none';
  return freq === 'daily' || freq === 'weekly';
}

export function openEventModal(event) {
  if (state.mode === 'guest') {
    toast('Sign in to create or edit events.', 'info');
    handlers.onSignIn();
    return;
  }
  if (!event && state.events.length >= HARD_EVENT_CAP) {
    toast(`Event limit reached (${HARD_EVENT_CAP}).`, 'error');
    return;
  }
  if (!event && state.events.length >= SOFT_EVENT_CAP) {
    toast(`You have ${state.events.length} events (soft limit ${SOFT_EVENT_CAP}).`, 'info');
  }

  ensureTzDatalist();
  lastFocus = document.activeElement;
  editingId = event?.id || null;
  const isEdit = Boolean(event);

  const draft = {
    name: event?.name || '',
    date: event?.date || todayIsoDate(),
    time: event?.time || '',
    includeTime: Boolean(event?.time),
    timeZone: event?.timeZone || '',
    color: event?.color || getLastColor(),
    units: new Set(event?.units?.length ? event.units : DEFAULT_UNITS),
    frequency: event?.recurrence?.frequency || 'none',
    showSinceLast: event?.showSinceLast !== false,
    showSinceFirst: event?.showSinceFirst !== false,
    showCycleProgress: event?.showCycleProgress !== false,
    category: resolveEventCategory(event, getCategories()),
    excludeFromThisWeek: defaultExcludeFromThisWeek(event),
    pinned: event?.pinned === true,
    /** null = auto from title; string = manual override */
    emoji: normalizeEventEmoji(event?.emoji),
  };

  const backdrop = el('div', {
    className: 'modal-backdrop',
    role: 'presentation',
    onClick: (e) => {
      if (e.target === backdrop) closeModal();
    },
  });
  const modal = el('div', {
    className: 'modal glass',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'event-modal-title',
  });

  modal.appendChild(el('h2', { id: 'event-modal-title', text: isEdit ? 'Edit event' : 'Add event' }));

  if (isEdit) {
    const createdLabel = formatAppTimestamp(event.createdAt);
    const editedLabel = formatAppTimestamp(event.updatedAt || event.createdAt);
    const metaBits = [];
    if (createdLabel) metaBits.push(['Created', createdLabel]);
    if (editedLabel) metaBits.push(['Last edited', editedLabel]);
    if (metaBits.length) {
      const meta = el('div', { className: 'event-history', 'aria-label': 'Event history' });
      for (const [label, value] of metaBits) {
        meta.appendChild(
          el('p', { className: 'event-history-row' }, [
            el('span', { className: 'event-history-label', text: label }),
            el('span', { className: 'event-history-value', text: value }),
          ])
        );
      }
      modal.appendChild(meta);
    }
  }

  const form = el('form', { className: 'modal-form' });
  const body = el('div', { className: 'form-grid modal-scroll' });

  const nameInput = el('input', {
    type: 'text',
    name: 'name',
    required: true,
    maxlength: '80',
    value: draft.name,
    autocomplete: 'off',
  });
  body.appendChild(el('div', { className: 'field' }, [el('label', { text: 'Name' }), nameInput]));

  let selectedEmoji = draft.emoji; // null = auto
  const emojiPreview = el('span', {
    className: 'emoji-picker-preview',
    text: resolveEventEmoji(draft.name, selectedEmoji),
    'aria-hidden': 'true',
  });
  const emojiModeHint = el('span', {
    className: 'emoji-picker-mode',
    text: selectedEmoji ? 'Custom' : 'Auto from title',
  });
  const emojiPanel = el('div', {
    className: 'emoji-picker-panel',
    id: 'emoji-picker-panel',
    hidden: selectedEmoji == null,
  });
  const emojiInput = el('input', {
    type: 'text',
    className: 'emoji-picker-input',
    name: 'emoji-custom',
    maxlength: '16',
    autocomplete: 'off',
    spellcheck: 'false',
    inputmode: 'text',
    enterkeyhint: 'done',
    placeholder: 'Type or paste any emoji…',
    'aria-label': 'Type or paste a custom emoji',
    value: selectedEmoji || '',
  });
  const emojiGrid = el('div', {
    className: 'emoji-picker-grid',
    role: 'group',
    'aria-label': 'Suggested emojis',
  });
  const emojiHint = el('p', {
    className: 'field-hint',
    text: '',
  });

  const refreshEmojiUi = ({ syncInput = true } = {}) => {
    const manual = selectedEmoji != null;
    emojiPreview.textContent = resolveEventEmoji(nameInput.value, selectedEmoji);
    emojiModeHint.textContent = manual ? 'Custom' : 'Auto from title';
    emojiPanel.hidden = !manual;
    emojiPanel.setAttribute('aria-hidden', String(!manual));
    emojiHint.textContent = manual
      ? 'Type or paste any emoji, tap a suggestion, or Auto to follow the title again.'
      : 'Auto picks from the title. Tap Choose to type or pick a custom emoji.';
    if (syncInput && document.activeElement !== emojiInput) {
      emojiInput.value = selectedEmoji || '';
    }
    emojiGrid.querySelectorAll('.emoji-swatch').forEach((btn) => {
      const value = btn.getAttribute('data-emoji');
      const active = manual && value === selectedEmoji;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    autoEmojiBtn.classList.toggle('is-active', !manual);
    autoEmojiBtn.setAttribute('aria-pressed', String(!manual));
    chooseEmojiBtn.classList.toggle('is-active', manual);
    chooseEmojiBtn.setAttribute('aria-pressed', String(manual));
    chooseEmojiBtn.setAttribute('aria-expanded', String(manual));
  };

  const autoEmojiBtn = el('button', {
    type: 'button',
    className: `chip emoji-auto-btn${selectedEmoji == null ? ' is-active' : ''}`,
    text: 'Auto',
    title: 'Match emoji from the event title',
    'aria-pressed': selectedEmoji == null,
    onClick: () => {
      selectedEmoji = null;
      refreshEmojiUi();
    },
  });

  const chooseEmojiBtn = el('button', {
    type: 'button',
    className: `chip emoji-choose-btn${selectedEmoji != null ? ' is-active' : ''}`,
    text: 'Choose',
    title: 'Type or pick a custom emoji',
    'aria-pressed': selectedEmoji != null,
    'aria-expanded': selectedEmoji != null,
    'aria-controls': 'emoji-picker-panel',
    onClick: () => {
      if (selectedEmoji == null) {
        selectedEmoji = resolveEventEmoji(nameInput.value, null);
      }
      refreshEmojiUi();
      requestAnimationFrame(() => {
        emojiInput.focus();
        emojiInput.select();
      });
    },
  });

  emojiInput.addEventListener('input', () => {
    const next = normalizeEventEmoji(emojiInput.value);
    if (!next) {
      // Empty field stays in manual mode with the last pick until they hit Auto,
      // but don't clear selectedEmoji to empty string — keep preview on last valid
      // or fall back to current auto while typing.
      if (!String(emojiInput.value || '').trim()) {
        selectedEmoji = resolveEventEmoji(nameInput.value, null);
        refreshEmojiUi({ syncInput: false });
      }
      return;
    }
    selectedEmoji = next;
    refreshEmojiUi({ syncInput: false });
  });

  for (const emo of emojiPickerChoices()) {
    emojiGrid.appendChild(
      el('button', {
        type: 'button',
        className: `emoji-swatch${selectedEmoji === emo ? ' is-active' : ''}`,
        text: emo,
        'data-emoji': emo,
        'aria-label': `Emoji ${emo}`,
        'aria-pressed': selectedEmoji === emo,
        onClick: () => {
          selectedEmoji = emo;
          refreshEmojiUi();
        },
      })
    );
  }

  emojiPanel.appendChild(emojiInput);
  emojiPanel.appendChild(emojiGrid);

  body.appendChild(
    el('div', { className: 'field' }, [
      el('label', { text: 'Emoji' }),
      el('div', { className: 'emoji-picker-head' }, [
        emojiPreview,
        emojiModeHint,
        autoEmojiBtn,
        chooseEmojiBtn,
      ]),
      emojiPanel,
      emojiHint,
    ])
  );

  let modalCategories = [...getCategories()];
  let selectedCategory = draft.category;
  let categoryTouched = false;

  const categorySelect = el('select', {
    className: 'category-select',
    name: 'category',
    'aria-label': 'Category',
  });

  const newCategoryWrap = el('div', {
    className: 'category-new-row',
    hidden: true,
  });
  const newCategoryInput = el('input', {
    type: 'text',
    className: 'category-new-input',
    maxlength: '40',
    placeholder: 'New category name',
    autocomplete: 'off',
    'aria-label': 'New category name',
  });
  const addCategoryBtn = el('button', {
    type: 'button',
    className: 'btn btn-ghost',
    text: 'Add',
  });
  newCategoryWrap.appendChild(newCategoryInput);
  newCategoryWrap.appendChild(addCategoryBtn);

  const rebuildCategoryOptions = () => {
    categorySelect.replaceChildren();
    for (const cat of modalCategories) {
      const opt = el('option', { value: cat, text: cat });
      if (categoriesEqual(cat, selectedCategory)) opt.selected = true;
      categorySelect.appendChild(opt);
    }
    categorySelect.appendChild(
      el('option', { value: NEW_CATEGORY_VALUE, text: '+ New category…' })
    );
  };
  rebuildCategoryOptions();

  const applyBirthdaySuggestion = () => {
    if (isEdit || categoryTouched) return;
    if (!titleSuggestsBirthday(nameInput.value)) return;
    const birthday = resolveBirthdayCategory(modalCategories);
    modalCategories = normalizeCategories([...modalCategories, birthday]);
    selectedCategory = birthday;
    newCategoryWrap.hidden = true;
    rebuildCategoryOptions();
  };

  categorySelect.addEventListener('change', () => {
    categoryTouched = true;
    if (categorySelect.value === NEW_CATEGORY_VALUE) {
      newCategoryWrap.hidden = false;
      newCategoryInput.value = '';
      requestAnimationFrame(() => newCategoryInput.focus());
      return;
    }
    newCategoryWrap.hidden = true;
    selectedCategory = categorySelect.value;
  });

  const commitNewCategory = () => {
    const raw = String(newCategoryInput.value || '').trim();
    if (!raw) {
      toast('Enter a category name.', 'info');
      return;
    }
    const name = normalizeCategoryName(raw);
    categoryTouched = true;
    modalCategories = normalizeCategories([...modalCategories, name]);
    selectedCategory = modalCategories.find((c) => categoriesEqual(c, name)) || name;
    newCategoryWrap.hidden = true;
    newCategoryInput.value = '';
    rebuildCategoryOptions();
  };
  addCategoryBtn.addEventListener('click', commitNewCategory);
  newCategoryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitNewCategory();
    }
  });

  body.appendChild(
    el('div', { className: 'field' }, [
      el('label', { text: 'Category' }),
      el('div', { className: 'category-select-wrap' }, [categorySelect]),
      newCategoryWrap,
      el('p', {
        className: 'field-hint',
        text: isEdit
          ? 'Required. Pick an existing category or add a new one. Default is Misc.'
          : 'Required. Titles with Birth / Birthday auto-select the Birthday category.',
      }),
    ])
  );

  nameInput.addEventListener('input', () => {
    applyBirthdaySuggestion();
    if (selectedEmoji == null) refreshEmojiUi();
    else emojiPreview.textContent = resolveEventEmoji(nameInput.value, selectedEmoji);
  });
  applyBirthdaySuggestion();
  refreshEmojiUi();

  const dateInput = el('input', { type: 'date', name: 'date', required: true, value: draft.date });
  const dateQuick = el('div', { className: 'date-quick', role: 'group', 'aria-label': 'Quick dates' });
  for (const [label, apply] of [
    ['Today', () => todayIsoDate()],
    ['Tomorrow', () => offsetIsoDate(1)],
    ['+1 week', () => offsetIsoDate(7)],
    ['+1 month', () => offsetIsoMonths(1)],
  ]) {
    dateQuick.appendChild(
      el('button', {
        type: 'button',
        className: 'chip',
        text: label,
        onClick: () => {
          dateInput.value = apply();
        },
      })
    );
  }
  body.appendChild(
    el('div', { className: 'field' }, [el('label', { text: 'Date' }), dateQuick, dateInput])
  );

  const timeInput = el('input', {
    type: 'time',
    name: 'time',
    value: draft.time ? draft.time.slice(0, 5) : '',
    disabled: !draft.includeTime,
  });
  const timeToggle = el('input', {
    type: 'checkbox',
    checked: draft.includeTime,
    onChange: (e) => {
      timeInput.disabled = !e.target.checked;
      if (!e.target.checked) timeInput.value = '';
    },
  });
  body.appendChild(
    el('div', { className: 'field' }, [
      el('div', { className: 'checkbox-row' }, [timeToggle, el('label', { text: 'Include specific time' })]),
      timeInput,
    ])
  );

  const tzInput = el('input', {
    type: 'text',
    name: 'timeZone',
    list: 'tz-list',
    placeholder: `Optional — blank uses ${getBrowserTimeZone()}`,
    value: draft.timeZone,
    autocomplete: 'off',
  });
  body.appendChild(
    el('div', { className: 'field' }, [el('label', { text: 'Timezone (IANA, optional)' }), tzInput])
  );

  const palette = el('div', { className: 'palette-grid', role: 'group', 'aria-label': 'Colour' });
  let selectedColor = draft.color;
  COLOR_PALETTE.forEach((c) => {
    const sw = el('button', {
      type: 'button',
      className: `swatch${c === selectedColor ? ' is-active' : ''}`,
      style: `background:${c}`,
      'data-color': c,
      'aria-label': `Colour ${c}`,
      'aria-pressed': c === selectedColor,
      onClick: () => {
        selectedColor = c;
        palette.querySelectorAll('.swatch').forEach((n) => {
          const active = n.getAttribute('data-color') === selectedColor;
          n.classList.toggle('is-active', active);
          n.setAttribute('aria-pressed', String(active));
        });
      },
    });
    palette.appendChild(sw);
  });
  body.appendChild(el('div', { className: 'field' }, [el('label', { text: 'Colour' }), palette]));

  const unitsGrid = el('div', { className: 'units-grid', role: 'group', 'aria-label': 'Units' });
  ALL_UNITS.forEach((u) => {
    const btn = el('button', {
      type: 'button',
      className: `unit-toggle${draft.units.has(u) ? ' is-active' : ''}`,
      text: u,
      'aria-pressed': draft.units.has(u),
      onClick: () => {
        if (draft.units.has(u)) {
          if (draft.units.size <= 1) return;
          draft.units.delete(u);
        } else draft.units.add(u);
        btn.classList.toggle('is-active', draft.units.has(u));
        btn.setAttribute('aria-pressed', String(draft.units.has(u)));
      },
    });
    unitsGrid.appendChild(btn);
  });
  body.appendChild(el('div', { className: 'field' }, [el('label', { text: 'Units to show' }), unitsGrid]));

  const freqSelect = el('select', { name: 'frequency' });
  for (const [value, label] of [
    ['none', 'One-time'],
    ['daily', 'Every day'],
    ['weekly', 'Every Monday'],
    ['monthly', 'Every month'],
    ['yearly', 'Every year'],
  ]) {
    const opt = el('option', { value, text: label });
    if (value === draft.frequency) opt.selected = true;
    freqSelect.appendChild(opt);
  }
  body.appendChild(el('div', { className: 'field' }, [el('label', { text: 'Recurrence' }), freqSelect]));

  const pinToggle = el('input', {
    type: 'checkbox',
    checked: draft.pinned,
  });
  body.appendChild(
    el('div', { className: 'field' }, [
      el('div', { className: 'checkbox-row' }, [
        pinToggle,
        el('label', { text: 'Pin to top' }),
      ]),
      el('p', {
        className: 'field-hint',
        text: 'Keeps this event in Pinned at the top. This week still has its own section — pinning does not mix the two.',
      }),
    ])
  );

  const excludeThisWeekToggle = el('input', {
    type: 'checkbox',
    checked: draft.excludeFromThisWeek,
  });
  body.appendChild(
    el('div', { className: 'field' }, [
      el('div', { className: 'checkbox-row' }, [
        excludeThisWeekToggle,
        el('label', { text: "Don't include in This week's events" }),
      ]),
      el('p', {
        className: 'field-hint',
        text: 'Hides this event from the automatic This week section (next 7 days). Daily and weekly recurrence turn this on automatically. Separate from Pin to top.',
      }),
    ])
  );

  const sinceLastToggle = el('input', {
    type: 'checkbox',
    checked: draft.showSinceLast,
  });
  const sinceFirstToggle = el('input', {
    type: 'checkbox',
    checked: draft.showSinceFirst,
  });
  const cycleToggle = el('input', {
    type: 'checkbox',
    checked: draft.showCycleProgress,
  });
  const sinceField = el(
    'div',
    {
      className: 'field field--since-opts',
      hidden: draft.frequency === 'none',
    },
    [
      el('label', { text: 'Recurring stats' }),
      el('div', { className: 'checkbox-row' }, [
        cycleToggle,
        el('label', { text: 'Show progress through current cycle' }),
      ]),
      el('div', { className: 'checkbox-row' }, [
        sinceLastToggle,
        el('label', { text: 'Show time since last occurrence' }),
      ]),
      el('div', { className: 'checkbox-row' }, [
        sinceFirstToggle,
        el('label', { text: 'Show time since first occurrence' }),
      ]),
      el('p', {
        className: 'field-hint',
        text: 'Cards always show until the next occurrence. Progress describes how far you are from last to next (e.g. halfway, three quarters).',
      }),
    ]
  );
  body.appendChild(sinceField);

  const syncSinceVisibility = () => {
    const recurring = freqSelect.value !== 'none';
    sinceField.hidden = !recurring;
    if (!recurring) {
      sinceLastToggle.checked = true;
      sinceFirstToggle.checked = true;
      cycleToggle.checked = true;
    }
  };

  const syncExcludeFromThisWeek = () => {
    const freq = freqSelect.value;
    if (freq === 'daily' || freq === 'weekly') {
      excludeThisWeekToggle.checked = true;
    }
  };

  freqSelect.addEventListener('change', () => {
    syncSinceVisibility();
    syncExcludeFromThisWeek();
  });

  const actions = el('div', {
    className: `modal-actions${isEdit ? ' modal-actions--edit' : ''}`,
  });

  if (isEdit) {
    const secondary = el('div', { className: 'modal-actions-secondary' });
    secondary.appendChild(
      buttonWithIcon({
        icon: 'duplicate',
        text: 'Duplicate',
        className: 'btn btn-ghost',
        onClick: () => {
          const snapshot = event;
          closeModal();
          handlers.onDuplicate(snapshot);
        },
      })
    );
    secondary.appendChild(
      buttonWithIcon({
        icon: 'close',
        text: 'Delete',
        className: 'btn btn-danger',
        onClick: () => {
          const snapshot = event;
          closeModal();
          confirmDelete(snapshot);
        },
      })
    );
    actions.appendChild(secondary);
  }

  const primary = el('div', { className: 'modal-actions-primary' });
  primary.appendChild(
    el('button', { type: 'button', className: 'btn btn-ghost', text: 'Cancel', onClick: () => closeModal() })
  );
  primary.appendChild(el('button', { type: 'submit', className: 'btn', text: isEdit ? 'Save' : 'Create' }));
  actions.appendChild(primary);
  form.appendChild(body);
  form.appendChild(actions);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let category =
      categorySelect.value === NEW_CATEGORY_VALUE
        ? normalizeCategoryName(newCategoryInput.value)
        : selectedCategory || DEFAULT_CATEGORY;
    let catsForSave = modalCategories;

    if (!isEdit) {
      const applied = applyBirthdayCategoryIfNeeded(nameInput.value, category, catsForSave);
      // Auto-assign Birthday unless the user explicitly picked another category.
      if (titleSuggestsBirthday(nameInput.value) && !categoryTouched) {
        category = applied.category;
        catsForSave = applied.categories;
      } else if (titleSuggestsBirthday(nameInput.value) && categoryTouched) {
        // Still ensure Birthday exists in settings list if they kept/chose it
        catsForSave = normalizeCategories([...catsForSave, category]);
      }
    }

    const payload = {
      name: nameInput.value,
      date: dateInput.value,
      time: timeToggle.checked && timeInput.value ? timeInput.value : null,
      timeZone: tzInput.value.trim() || null,
      color: selectedColor,
      units: [...draft.units],
      category,
      recurrence: { frequency: freqSelect.value },
      showSinceLast: freqSelect.value === 'none' ? true : sinceLastToggle.checked,
      showSinceFirst: freqSelect.value === 'none' ? true : sinceFirstToggle.checked,
      showCycleProgress: freqSelect.value === 'none' ? true : cycleToggle.checked,
      excludeFromThisWeek: excludeThisWeekToggle.checked,
      pinned: pinToggle.checked,
      emoji: selectedEmoji,
      _categories: catsForSave,
    };
    const saveAsEdit = isEdit;
    const eventId = editingId;
    saveLastColor(selectedColor);
    closeModal();
    if (saveAsEdit) handlers.onEdit(eventId, payload);
    else handlers.onAdd(payload);
  });

  modal.appendChild(form);
  backdrop.appendChild(modal);
  document.getElementById('modal-root').replaceChildren(backdrop);
  trapFocus(modal, nameInput);
}

function confirmDelete(event) {
  lastFocus = document.activeElement;
  const backdrop = el('div', {
    className: 'modal-backdrop',
    onClick: (e) => {
      if (e.target === backdrop) closeModal();
    },
  });
  const modal = el('div', {
    className: 'modal glass',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'delete-title',
  });
  modal.appendChild(el('h2', { id: 'delete-title', text: 'Delete event?' }));
  modal.appendChild(
    el('p', {
      text: `“${event.name}” will be removed permanently from your account.`,
    })
  );
  const actions = el('div', { className: 'modal-actions' });
  actions.appendChild(
    el('button', { type: 'button', className: 'btn btn-ghost', text: 'Cancel', onClick: () => closeModal() })
  );
  actions.appendChild(
    el('button', {
      type: 'button',
      className: 'btn btn-danger',
      text: 'Delete',
      onClick: () => {
        closeModal();
        handlers.onDelete(event.id);
      },
    })
  );
  modal.appendChild(actions);
  backdrop.appendChild(modal);
  document.getElementById('modal-root').replaceChildren(backdrop);
  trapFocus(modal);
}

function openRenameCategoryModal(categoryName, eventCount) {
  lastFocus = document.activeElement;
  const backdrop = el('div', {
    className: 'modal-backdrop',
    onClick: (e) => {
      if (e.target === backdrop) closeModal();
    },
  });
  const modal = el('div', {
    className: 'modal glass',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'rename-category-title',
  });
  modal.appendChild(el('h2', { id: 'rename-category-title', text: 'Rename category' }));

  const nameInput = el('input', {
    type: 'text',
    className: 'category-new-input',
    maxlength: String(CATEGORY_MAX),
    value: categoryName,
    autocomplete: 'off',
    'aria-label': 'Category name',
  });
  const hint = el('p', { className: 'field-hint' });
  const refreshHint = () => {
    const planned = applyCategoryRename(getCategories(), categoryName, nameInput.value);
    if (!planned.ok) {
      hint.textContent = planned.error;
      return;
    }
    if (planned.unchanged) {
      hint.textContent = 'Same name — nothing to change.';
      return;
    }
    if (planned.merged) {
      hint.textContent =
        eventCount > 0
          ? `This merges into “${planned.name}”. ${eventCount} event${eventCount === 1 ? '' : 's'} will move there.`
          : `This merges into “${planned.name}”.`;
      return;
    }
    hint.textContent =
      eventCount > 0
        ? `${eventCount} event${eventCount === 1 ? '' : 's'} will be updated.`
        : 'No events currently use this category.';
  };
  refreshHint();
  nameInput.addEventListener('input', refreshHint);

  const form = el('form', { className: 'modal-form' });
  form.appendChild(
    el('div', { className: 'field' }, [el('label', { text: 'Name' }), nameInput, hint])
  );

  const actions = el('div', { className: 'modal-actions' });
  actions.appendChild(
    el('button', { type: 'button', className: 'btn btn-ghost', text: 'Cancel', onClick: () => closeModal() })
  );
  const saveBtn = el('button', { type: 'submit', className: 'btn', text: 'Save' });
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const planned = applyCategoryRename(getCategories(), categoryName, nameInput.value);
    if (!planned.ok) {
      toast(planned.error, 'info');
      nameInput.focus();
      return;
    }
    if (planned.unchanged) {
      closeModal();
      return;
    }
    closeModal();
    handlers.onRenameCategory(categoryName, nameInput.value);
  });

  modal.appendChild(form);
  backdrop.appendChild(modal);
  document.getElementById('modal-root').replaceChildren(backdrop);
  trapFocus(modal, nameInput);
  requestAnimationFrame(() => {
    nameInput.focus();
    nameInput.select();
  });
}

function confirmDeleteCategory(categoryName, eventCount) {
  lastFocus = document.activeElement;
  const backdrop = el('div', {
    className: 'modal-backdrop',
    onClick: (e) => {
      if (e.target === backdrop) closeModal();
    },
  });
  const modal = el('div', {
    className: 'modal glass',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'delete-category-title',
  });
  modal.appendChild(el('h2', { id: 'delete-category-title', text: 'Delete category?' }));
  modal.appendChild(
    el('p', {
      text:
        eventCount > 0
          ? `Delete “${categoryName}”? ${eventCount} event${eventCount === 1 ? '' : 's'} will move to Misc.`
          : `Delete “${categoryName}”? No events currently use it.`,
    })
  );
  const actions = el('div', { className: 'modal-actions' });
  actions.appendChild(
    el('button', { type: 'button', className: 'btn btn-ghost', text: 'Cancel', onClick: () => closeModal() })
  );
  actions.appendChild(
    el('button', {
      type: 'button',
      className: 'btn btn-danger',
      text: 'Delete category',
      onClick: () => {
        closeModal();
        handlers.onDeleteCategory(categoryName);
      },
    })
  );
  modal.appendChild(actions);
  backdrop.appendChild(modal);
  document.getElementById('modal-root').replaceChildren(backdrop);
  trapFocus(modal);
}

function openCsvImportModal(parsed, fileName = 'file.csv') {
  lastFocus = document.activeElement;
  const map = guessColumnMap(parsed.headers);

  const backdrop = el('div', {
    className: 'modal-backdrop',
    role: 'presentation',
    onClick: (e) => {
      if (e.target === backdrop) closeModal();
    },
  });
  const modal = el('div', {
    className: 'modal glass modal--csv',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'csv-import-title',
  });

  modal.appendChild(el('h2', { id: 'csv-import-title', text: 'Import CSV' }));
  modal.appendChild(
    el('p', {
      className: 'settings-muted',
      text: `${fileName} · ${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'} · map columns, then import.`,
    })
  );

  const form = el('form', { className: 'form-grid' });

  function columnSelect(labelText, key, includeNone = false) {
    const field = el('div', { className: 'field' });
    field.appendChild(el('label', { text: labelText }));
    const select = el('select', {
      name: key,
      onChange: (e) => {
        map[key] = e.target.value;
        refreshPreview();
      },
    });
    if (includeNone) {
      select.appendChild(el('option', { value: '', text: 'None (optional)' }));
    }
    for (const h of parsed.headers) {
      select.appendChild(
        el('option', {
          value: h,
          text: h,
          selected: map[key] === h,
        })
      );
    }
    if (!includeNone && !map[key] && parsed.headers[0]) {
      map[key] = parsed.headers[0];
      select.value = map[key];
    }
    field.appendChild(select);
    return field;
  }

  form.appendChild(columnSelect('Title / event name column', 'title'));
  form.appendChild(columnSelect('Date of event column', 'date'));
  form.appendChild(columnSelect('Time of event column', 'time', true));

  const orderField = el('div', { className: 'field' });
  orderField.appendChild(el('label', { text: 'Ambiguous date order (e.g. 03/08/2026)' }));
  const orderSelect = el('select', {
    name: 'dateOrder',
    onChange: (e) => {
      map.dateOrder = e.target.value;
      refreshPreview();
    },
  });
  for (const [value, label] of [
    ['auto', 'Auto (prefer day/month/year when unclear)'],
    ['dmy', 'Day / Month / Year'],
    ['mdy', 'Month / Day / Year'],
    ['ymd', 'Year / Month / Day'],
  ]) {
    orderSelect.appendChild(
      el('option', {
        value,
        text: label,
        selected: (map.dateOrder || 'auto') === value,
      })
    );
  }
  orderField.appendChild(orderSelect);
  orderField.appendChild(
    el('p', {
      className: 'field-hint',
      text: 'Also accepts ISO (2026-08-03), 3 Aug 2026, Excel serials, and times like 14:30 or 2:30 PM. Time can live in the date column.',
    })
  );
  form.appendChild(orderField);

  const previewWrap = el('div', { className: 'csv-preview' });
  const previewTitle = el('h3', { className: 'csv-preview-title', text: 'Preview' });
  const previewMeta = el('p', { className: 'settings-muted csv-preview-meta' });
  const previewTable = el('div', { className: 'csv-preview-table', role: 'table' });
  previewWrap.appendChild(previewTitle);
  previewWrap.appendChild(previewMeta);
  previewWrap.appendChild(previewTable);
  form.appendChild(previewWrap);

  function refreshPreview() {
    const preview = previewMappedRows(parsed.rows, map, 6);
    let built;
    try {
      built = rowsToEvents(parsed.rows, {
        title: map.title,
        date: map.date,
        time: map.time || '',
        dateOrder: map.dateOrder || 'auto',
      });
    } catch {
      built = { events: [], errors: parsed.rows.map((_, i) => ({ line: i + 2, error: 'Incomplete mapping' })) };
    }
    previewMeta.textContent = `${built.events.length} ready · ${built.errors.length} skipped/errors`;

    previewTable.replaceChildren();
    const head = el('div', { className: 'csv-preview-row csv-preview-row--head', role: 'row' });
    for (const label of ['Title', 'Date', 'Time', 'Status']) {
      head.appendChild(el('span', { role: 'columnheader', text: label }));
    }
    previewTable.appendChild(head);

    for (const row of preview) {
      const line = el('div', {
        className: `csv-preview-row${row.error ? ' is-error' : ''}`,
        role: 'row',
      });
      line.appendChild(el('span', { role: 'cell', text: row.name }));
      line.appendChild(el('span', { role: 'cell', text: row.date || row.rawDate || '—' }));
      line.appendChild(
        el('span', {
          role: 'cell',
          text: row.time || (row.error ? '—' : row.rawTime || '—'),
        })
      );
      line.appendChild(
        el('span', {
          role: 'cell',
          className: row.error ? 'csv-preview-status is-bad' : 'csv-preview-status is-ok',
          text: row.error || 'OK',
        })
      );
      previewTable.appendChild(line);
    }
  }

  refreshPreview();

  const actions = el('div', { className: 'modal-actions modal-actions--edit' });
  const secondary = el('div', { className: 'modal-actions-secondary' });
  secondary.appendChild(
    el('button', {
      type: 'button',
      className: 'btn btn-ghost',
      text: 'Cancel',
      onClick: () => closeModal(),
    })
  );
  actions.appendChild(secondary);

  const primary = el('div', { className: 'modal-actions-primary' });
  primary.appendChild(
    el('button', {
      type: 'button',
      className: 'btn btn-ghost',
      text: 'Merge import',
      onClick: () => submitImport(false),
    })
  );
  primary.appendChild(
    el('button', {
      type: 'button',
      className: 'btn',
      text: 'Replace all',
      onClick: () => submitImport(true),
    })
  );
  actions.appendChild(primary);
  form.appendChild(actions);

  function submitImport(replace) {
    let built;
    try {
      built = rowsToEvents(parsed.rows, {
        title: map.title,
        date: map.date,
        time: map.time || '',
        dateOrder: map.dateOrder || 'auto',
      });
    } catch (err) {
      toast(err.message || 'Could not map CSV', 'error');
      return;
    }

    if (!built.events.length) {
      toast(
        built.errors.length
          ? `No valid rows to import (${built.errors.length} failed).`
          : 'No events found in CSV.',
        'error'
      );
      return;
    }

    if (replace) {
      const ok = window.confirm(
        `Replace all existing events with ${built.events.length} from this CSV? This cannot be undone.`
      );
      if (!ok) return;
    } else if (built.errors.length > 0) {
      const ok = window.confirm(
        `Merge ${built.events.length} events? ${built.errors.length} row${built.errors.length === 1 ? '' : 's'} will be skipped.`
      );
      if (!ok) return;
    }

    closeModal();
    handlers.onImport(built.events, { replace, fromCsv: true });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitImport(false);
  });

  modal.appendChild(form);
  backdrop.appendChild(modal);
  document.getElementById('modal-root').replaceChildren(backdrop);
  trapFocus(modal, form.querySelector('select'));
}

function unitsEqual(a, b) {
  const aa = normalizeUnits(a).slice().sort();
  const bb = normalizeUnits(b).slice().sort();
  if (aa.length !== bb.length) return false;
  return aa.every((u, i) => u === bb[i]);
}

function sharedOrMixed(values, equalFn = (x, y) => x === y) {
  if (!values.length) return { mixed: false, value: null };
  const first = values[0];
  for (let i = 1; i < values.length; i++) {
    if (!equalFn(first, values[i])) return { mixed: true, value: null };
  }
  return { mixed: false, value: first };
}

/** Shuffle palette colours across events; prefer uniqueness when selection fits the palette. */
function assignRandomColorsToEvents(events) {
  const colorById = {};
  if (!events.length) return colorById;

  if (events.length <= COLOR_PALETTE.length) {
    const shuffled = [...COLOR_PALETTE];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    events.forEach((ev, i) => {
      colorById[ev.id] = shuffled[i];
    });
    return colorById;
  }

  for (const ev of events) {
    const avoid = ev.color;
    const pool = COLOR_PALETTE.filter((c) => c !== avoid);
    const list = pool.length ? pool : COLOR_PALETTE;
    colorById[ev.id] = list[Math.floor(Math.random() * list.length)];
  }
  return colorById;
}

function openMultiEditModal(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const events = uniqueIds
    .map((id) => state.events.find((e) => e.id === id))
    .filter(Boolean);

  if (!events.length) {
    toast('No events selected.', 'info');
    return;
  }
  if (state.mode !== 'signed-in') {
    toast('Sign in to multi-edit events.', 'info');
    return;
  }

  lastFocus = document.activeElement;

  const sharedColor = sharedOrMixed(events.map((e) => e.color));
  const sharedUnits = sharedOrMixed(
    events.map((e) => normalizeUnits(e.units)),
    unitsEqual
  );
  const sharedCategory = sharedOrMixed(
    events.map((e) => resolveEventCategory(e, getCategories())),
    categoriesEqual
  );
  const sharedFreq = sharedOrMixed(
    events.map((e) => e.recurrence?.frequency || 'none')
  );
  const sharedSinceLast = sharedOrMixed(events.map((e) => e.showSinceLast !== false));
  const sharedSinceFirst = sharedOrMixed(events.map((e) => e.showSinceFirst !== false));
  const sharedCycle = sharedOrMixed(events.map((e) => e.showCycleProgress !== false));
  const sharedPinned = sharedOrMixed(events.map((e) => e.pinned === true));

  const dirty = {
    color: false,
    randomColors: false,
    units: false,
    category: false,
    frequency: false,
    showSinceLast: false,
    showSinceFirst: false,
    showCycleProgress: false,
    pinned: false,
  };

  const draft = {
    color: sharedColor.mixed ? null : sharedColor.value || COLOR_PALETTE[0],
    units: new Set(sharedUnits.mixed ? DEFAULT_UNITS : sharedUnits.value || DEFAULT_UNITS),
    category: sharedCategory.mixed ? null : sharedCategory.value || DEFAULT_CATEGORY,
    frequency: sharedFreq.mixed ? '' : sharedFreq.value || 'none',
    showSinceLast: sharedSinceLast.mixed ? true : sharedSinceLast.value !== false,
    showSinceFirst: sharedSinceFirst.mixed ? true : sharedSinceFirst.value !== false,
    showCycleProgress: sharedCycle.mixed ? true : sharedCycle.value !== false,
    pinned: sharedPinned.mixed ? false : sharedPinned.value === true,
  };

  let modalCategories = [...getCategories()];
  let selectedCategory = draft.category || DEFAULT_CATEGORY;

  const backdrop = el('div', {
    className: 'modal-backdrop',
    role: 'presentation',
    onClick: (e) => {
      if (e.target === backdrop) closeModal();
    },
  });
  const modal = el('div', {
    className: 'modal glass modal--multi-edit',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'multi-edit-title',
  });

  modal.appendChild(
    el('h2', {
      id: 'multi-edit-title',
      text: `Edit ${events.length} event${events.length === 1 ? '' : 's'}`,
    })
  );
  modal.appendChild(
    el('p', {
      className: 'settings-muted',
      text: 'Titles and dates are locked. Only fields you change are applied to every selected event.',
    })
  );

  const locked = el('div', { className: 'multi-edit-locked', 'aria-label': 'Locked fields' });
  locked.appendChild(el('p', { className: 'multi-edit-locked-label', text: 'Titles (unchanged)' }));
  const titleList = el('ul', { className: 'multi-edit-title-list' });
  for (const ev of events) {
    titleList.appendChild(el('li', { text: ev.name || '(untitled)' }));
  }
  locked.appendChild(titleList);
  locked.appendChild(
    el('p', {
      className: 'field-hint',
      text: 'Each event keeps its own title, date, time, and timezone.',
    })
  );
  modal.appendChild(locked);

  const form = el('form', { className: 'form-grid' });

  // —— Category ——
  const categorySelect = el('select', {
    className: 'category-select',
    name: 'category',
    'aria-label': 'Category',
  });
  const newCategoryWrap = el('div', { className: 'category-new-row', hidden: true });
  const newCategoryInput = el('input', {
    type: 'text',
    className: 'category-new-input',
    maxlength: '40',
    placeholder: 'New category name',
    autocomplete: 'off',
    'aria-label': 'New category name',
  });
  const addCategoryBtn = el('button', { type: 'button', className: 'btn btn-ghost', text: 'Add' });
  newCategoryWrap.appendChild(newCategoryInput);
  newCategoryWrap.appendChild(addCategoryBtn);

  const rebuildCategoryOptions = () => {
    categorySelect.replaceChildren();
    if (sharedCategory.mixed && !dirty.category) {
      categorySelect.appendChild(
        el('option', { value: '', text: 'Mixed — keep each event’s category', selected: true })
      );
    }
    for (const cat of modalCategories) {
      const opt = el('option', { value: cat, text: cat });
      if (dirty.category && categoriesEqual(cat, selectedCategory)) opt.selected = true;
      else if (!sharedCategory.mixed && !dirty.category && categoriesEqual(cat, selectedCategory)) {
        opt.selected = true;
      }
      categorySelect.appendChild(opt);
    }
    categorySelect.appendChild(
      el('option', { value: NEW_CATEGORY_VALUE, text: '+ New category…' })
    );
  };
  rebuildCategoryOptions();

  categorySelect.addEventListener('change', () => {
    if (categorySelect.value === NEW_CATEGORY_VALUE) {
      newCategoryWrap.hidden = false;
      newCategoryInput.value = '';
      requestAnimationFrame(() => newCategoryInput.focus());
      return;
    }
    newCategoryWrap.hidden = true;
    if (!categorySelect.value) {
      dirty.category = false;
      return;
    }
    dirty.category = true;
    selectedCategory = categorySelect.value;
    // Drop the mixed placeholder once user picks a real category
    if (categorySelect.querySelector('option[value=""]')) rebuildCategoryOptions();
  });

  const commitNewCategory = () => {
    const raw = String(newCategoryInput.value || '').trim();
    if (!raw) {
      toast('Enter a category name.', 'info');
      return;
    }
    const name = normalizeCategoryName(raw);
    modalCategories = normalizeCategories([...modalCategories, name]);
    selectedCategory = modalCategories.find((c) => categoriesEqual(c, name)) || name;
    dirty.category = true;
    newCategoryWrap.hidden = true;
    newCategoryInput.value = '';
    rebuildCategoryOptions();
  };
  addCategoryBtn.addEventListener('click', commitNewCategory);
  newCategoryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitNewCategory();
    }
  });

  form.appendChild(
    el('div', { className: 'field' }, [
      el('label', { text: 'Category' }),
      el('div', { className: 'category-select-wrap' }, [categorySelect]),
      newCategoryWrap,
      el('p', {
        className: 'field-hint',
        text: sharedCategory.mixed
          ? 'Selected events use different categories. Pick one to apply to all, or leave Mixed.'
          : 'Applied to every selected event when changed.',
      }),
    ])
  );

  // —— Colour ——
  const palette = el('div', { className: 'palette-grid', role: 'group', 'aria-label': 'Colour' });
  const colorHint = el('p', {
    className: 'field-hint',
    text: sharedColor.mixed
      ? 'Mixed colours — tap a swatch to apply one colour to all, or assign random colours.'
      : 'Tap a swatch to change colour for all selected events, or assign random colours.',
  });

  const clearSwatchActive = () => {
    palette.querySelectorAll('.swatch').forEach((n) => {
      n.classList.remove('is-active');
      n.setAttribute('aria-pressed', 'false');
    });
  };

  COLOR_PALETTE.forEach((c) => {
    const active = !sharedColor.mixed && draft.color === c;
    const sw = el('button', {
      type: 'button',
      className: `swatch${active ? ' is-active' : ''}`,
      style: `background:${c}`,
      'data-color': c,
      'aria-label': `Colour ${c}`,
      'aria-pressed': active,
      onClick: () => {
        dirty.color = true;
        dirty.randomColors = false;
        draft.color = c;
        palette.querySelectorAll('.swatch').forEach((n) => {
          const on = n.getAttribute('data-color') === draft.color;
          n.classList.toggle('is-active', on);
          n.setAttribute('aria-pressed', String(on));
        });
        colorHint.textContent = 'One colour will be applied to all selected events.';
      },
    });
    palette.appendChild(sw);
  });

  const randomColorBtn = el('button', {
    type: 'button',
    className: 'btn btn-ghost',
    text: 'Assign random colours',
    onClick: () => {
      dirty.randomColors = true;
      dirty.color = false;
      draft.color = null;
      clearSwatchActive();
      colorHint.textContent =
        'Each selected event will get its own random palette colour when you save.';
    },
  });

  form.appendChild(
    el('div', { className: 'field' }, [
      el('label', { text: 'Colour' }),
      palette,
      el('div', { className: 'multi-edit-color-actions' }, [randomColorBtn]),
      colorHint,
    ])
  );

  // —— Units ——
  const unitsGrid = el('div', { className: 'units-grid', role: 'group', 'aria-label': 'Units' });
  const unitsHint = el('p', {
    className: 'field-hint',
    text: sharedUnits.mixed
      ? 'Mixed units — adjust toggles to set the same unit set on all selected events.'
      : 'Toggle units to show on every selected event.',
  });
  ALL_UNITS.forEach((u) => {
    const on = draft.units.has(u) && !sharedUnits.mixed;
    const btn = el('button', {
      type: 'button',
      className: `unit-toggle${on ? ' is-active' : ''}`,
      text: u,
      'aria-pressed': on,
      onClick: () => {
        if (!dirty.units && sharedUnits.mixed) {
          // First edit from mixed: start from none selected, then apply this toggle
          draft.units = new Set();
        }
        dirty.units = true;
        if (draft.units.has(u)) {
          if (draft.units.size <= 1) return;
          draft.units.delete(u);
        } else {
          draft.units.add(u);
        }
        unitsGrid.querySelectorAll('.unit-toggle').forEach((n, i) => {
          const unit = ALL_UNITS[i];
          const active = draft.units.has(unit);
          n.classList.toggle('is-active', active);
          n.setAttribute('aria-pressed', String(active));
        });
        unitsHint.textContent = 'Units will be applied to all selected events.';
      },
    });
    unitsGrid.appendChild(btn);
  });
  // If shared, reflect shared set; if mixed, leave all inactive until first edit
  if (!sharedUnits.mixed) {
    unitsGrid.querySelectorAll('.unit-toggle').forEach((n, i) => {
      const unit = ALL_UNITS[i];
      const active = draft.units.has(unit);
      n.classList.toggle('is-active', active);
      n.setAttribute('aria-pressed', String(active));
    });
  }
  form.appendChild(
    el('div', { className: 'field' }, [el('label', { text: 'Units to show' }), unitsGrid, unitsHint])
  );

  // —— Recurrence ——
  const freqSelect = el('select', { name: 'frequency', 'aria-label': 'Recurrence' });
  if (sharedFreq.mixed) {
    freqSelect.appendChild(
      el('option', { value: '', text: 'Mixed — keep each event’s recurrence', selected: true })
    );
  }
  for (const [value, label] of [
    ['none', 'One-time'],
    ['daily', 'Every day'],
    ['weekly', 'Every Monday'],
    ['monthly', 'Every month'],
    ['yearly', 'Every year'],
  ]) {
    const opt = el('option', { value, text: label });
    if (!sharedFreq.mixed && value === draft.frequency) opt.selected = true;
    freqSelect.appendChild(opt);
  }

  const sinceLastToggle = el('input', { type: 'checkbox', checked: draft.showSinceLast });
  const sinceFirstToggle = el('input', { type: 'checkbox', checked: draft.showSinceFirst });
  const cycleToggle = el('input', { type: 'checkbox', checked: draft.showCycleProgress });

  if (sharedSinceLast.mixed) sinceLastToggle.indeterminate = true;
  if (sharedSinceFirst.mixed) sinceFirstToggle.indeterminate = true;
  if (sharedCycle.mixed) cycleToggle.indeterminate = true;

  const sinceField = el(
    'div',
    {
      className: 'field field--since-opts',
      hidden: true,
    },
    [
      el('label', { text: 'Recurring stats' }),
      el('div', { className: 'checkbox-row' }, [
        cycleToggle,
        el('label', { text: 'Show progress through current cycle' }),
      ]),
      el('div', { className: 'checkbox-row' }, [
        sinceLastToggle,
        el('label', { text: 'Show time since last occurrence' }),
      ]),
      el('div', { className: 'checkbox-row' }, [
        sinceFirstToggle,
        el('label', { text: 'Show time since first occurrence' }),
      ]),
      el('p', {
        className: 'field-hint',
        text: 'Only applied when you change them (or when you switch recurrence).',
      }),
    ]
  );

  const syncSinceVisibility = () => {
    const freq = dirty.frequency ? freqSelect.value : draft.frequency;
    const show =
      (dirty.frequency && freq && freq !== 'none') ||
      (!dirty.frequency && !sharedFreq.mixed && draft.frequency !== 'none') ||
      (!dirty.frequency && sharedFreq.mixed);
    sinceField.hidden = !show || (dirty.frequency && freq === 'none');
    if (dirty.frequency && freq === 'none') {
      sinceLastToggle.checked = true;
      sinceFirstToggle.checked = true;
      cycleToggle.checked = true;
      sinceLastToggle.indeterminate = false;
      sinceFirstToggle.indeterminate = false;
      cycleToggle.indeterminate = false;
    }
  };

  freqSelect.addEventListener('change', () => {
    if (!freqSelect.value) {
      dirty.frequency = false;
      draft.frequency = '';
    } else {
      dirty.frequency = true;
      draft.frequency = freqSelect.value;
    }
    syncSinceVisibility();
  });

  sinceLastToggle.addEventListener('change', () => {
    dirty.showSinceLast = true;
    sinceLastToggle.indeterminate = false;
    draft.showSinceLast = sinceLastToggle.checked;
  });
  sinceFirstToggle.addEventListener('change', () => {
    dirty.showSinceFirst = true;
    sinceFirstToggle.indeterminate = false;
    draft.showSinceFirst = sinceFirstToggle.checked;
  });
  cycleToggle.addEventListener('change', () => {
    dirty.showCycleProgress = true;
    cycleToggle.indeterminate = false;
    draft.showCycleProgress = cycleToggle.checked;
  });

  form.appendChild(
    el('div', { className: 'field' }, [
      el('label', { text: 'Recurrence' }),
      freqSelect,
      el('p', {
        className: 'field-hint',
        text: sharedFreq.mixed
          ? 'Selected events recur differently. Choose a frequency to apply to all, or leave Mixed.'
          : 'Change how often these events repeat.',
      }),
    ])
  );
  form.appendChild(sinceField);
  syncSinceVisibility();

  const pinToggle = el('input', { type: 'checkbox', checked: draft.pinned });
  if (sharedPinned.mixed) pinToggle.indeterminate = true;
  pinToggle.addEventListener('change', () => {
    dirty.pinned = true;
    pinToggle.indeterminate = false;
    draft.pinned = pinToggle.checked;
  });
  form.appendChild(
    el('div', { className: 'field' }, [
      el('div', { className: 'checkbox-row' }, [
        pinToggle,
        el('label', { text: 'Pin to top' }),
      ]),
      el('p', {
        className: 'field-hint',
        text: sharedPinned.mixed
          ? 'Mixed — some selected events are pinned. Check or uncheck to apply to all.'
          : 'Pinned events live in their own section at the top, separate from This week.',
      }),
    ])
  );

  const actions = el('div', { className: 'modal-actions' });
  actions.appendChild(
    el('button', {
      type: 'button',
      className: 'btn btn-ghost',
      text: 'Cancel',
      onClick: () => closeModal(),
    })
  );
  const saveBtn = el('button', {
    type: 'submit',
    className: 'btn',
    text: `Save to ${events.length} event${events.length === 1 ? '' : 's'}`,
  });
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = {};
    let colorById = null;

    if (dirty.randomColors) {
      colorById = assignRandomColorsToEvents(events);
    } else if (dirty.color && draft.color) {
      patch.color = draft.color;
    }

    if (dirty.units) patch.units = [...draft.units];
    if (dirty.category) {
      patch.category =
        categorySelect.value === NEW_CATEGORY_VALUE
          ? normalizeCategoryName(newCategoryInput.value)
          : selectedCategory || DEFAULT_CATEGORY;
    }
    if (dirty.frequency && freqSelect.value) {
      patch.recurrence = { frequency: freqSelect.value };
    }
    if (dirty.showSinceLast) patch.showSinceLast = sinceLastToggle.checked;
    if (dirty.showSinceFirst) patch.showSinceFirst = sinceFirstToggle.checked;
    if (dirty.showCycleProgress) patch.showCycleProgress = cycleToggle.checked;
    if (dirty.pinned) patch.pinned = pinToggle.checked;

    // Switching to one-time forces show* defaults via API; still mark them if frequency dirty.
    if (dirty.frequency && freqSelect.value === 'none') {
      patch.showSinceLast = true;
      patch.showSinceFirst = true;
      patch.showCycleProgress = true;
    }

    if (!Object.keys(patch).length && !colorById) {
      toast('Change at least one field to save.', 'info');
      return;
    }

    saveBtn.disabled = true;
    try {
      await handlers.onBatchEdit(events.map((ev) => ev.id), patch, {
        _categories: modalCategories,
        colorById,
      });
      closeModal();
      selectedEventIds.clear();
      setMultiSelectMode(false);
    } catch {
      saveBtn.disabled = false;
    }
  });

  modal.appendChild(form);
  backdrop.appendChild(modal);
  document.getElementById('modal-root').replaceChildren(backdrop);
  trapFocus(modal, categorySelect);
}
