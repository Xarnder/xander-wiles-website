import {
  ALL_UNITS,
  COLOR_PALETTE,
  DEFAULT_UNITS,
  HARD_EVENT_CAP,
  SOFT_EVENT_CAP,
  getBrowserTimeZone,
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
  NEW_CATEGORY_VALUE,
  canDeleteCategory,
  categoriesEqual,
  normalizeCategories,
  normalizeCategoryName,
  resolveEventCategory,
} from './categories.js';
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
import { SORT_OPTIONS, normalizeSort, vmStatBlocks } from './filters.js';

const LAST_COLOR_KEY = 'time-pass:last-color';
const FILTERS_OPEN_KEY = 'time-pass:filters-open';

let calcDraft = defaultCalculatorDraft();

/** Site-root paths for themeable mask icons (assets/SVGs + close). */
const ICON_URLS = {
  edit: '/assets/SVGs/edit.svg',
  duplicate: '/assets/SVGs/duplicate.svg',
  copy: '/assets/SVGs/copy.svg',
  expand: '/assets/SVGs/expand.svg',
  shrink: '/assets/SVGs/shrink.svg',
  close: '/assets/icons/close-icon.svg',
  back: '/assets/SVGs/Left-ArrowIcons.svg',
  home: '/assets/SVGs/home.svg',
  plus: '/assets/SVGs/plus-icon.svg',
};

let handlers = {
  onSignIn: () => {},
  onSignOut: () => {},
  onAdd: () => {},
  onEdit: () => {},
  onDelete: () => {},
  onDuplicate: () => {},
  onFilters: () => {},
  onExport: () => {},
  onImport: () => {},
  onSaveSettings: async () => {},
  onDeleteCategory: async () => {},
};

let lastFocus = null;
let editingId = null;

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

function uiIcon(name) {
  const url = ICON_URLS[name];
  const node = el('span', {
    className: `ui-icon ui-icon--${name}`,
    'aria-hidden': 'true',
  });
  if (url) node.style.setProperty('--ui-icon', `url("${url}")`);
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

function eventCountLabel(shown, total) {
  if (filtersAreActive()) return `${shown} shown · ${total} total`;
  return `${shown} event${shown === 1 ? '' : 's'}`;
}

export function renderChrome() {
  const brandSub = document.getElementById('brand-sub');
  const actions = document.getElementById('header-actions');
  const banner = document.getElementById('preview-banner');
  if (!actions) return;
  actions.replaceChildren();

  if (state.view === 'settings') {
    if (brandSub) brandSub.textContent = 'Settings';
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
    if (brandSub) {
      brandSub.textContent =
        calcDraft.tool === 'offset' ? 'Add or subtract' : 'Date to date';
    }
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
    if (brandSub) {
      brandSub.textContent = isFirebaseConfigured
        ? 'Preview — sign in to save'
        : 'Preview — configure Firebase to sign in';
    }
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
    if (brandSub) brandSub.textContent = state.user?.displayName || state.user?.email || 'Signed in';
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
    actions.appendChild(
      el('button', {
        type: 'button',
        className: 'btn btn-ghost',
        text: 'Sign out',
        onClick: () => handlers.onSignOut(),
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
      el('span', { className: 'filters-drawer-chevron', 'aria-hidden': 'true' }),
    ]
  );

  const collapsedBar = el('div', { className: 'filters-drawer-summary' }, [
    toggle,
    densityToggle,
  ]);
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

  const drawer = el(
    'div',
    {
      className: `filters-drawer${drawerOpen ? ' is-open' : ''}`,
      id: 'filters-drawer',
    },
    [collapsedBar, drawerBody]
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

function renderDirectionRow(block, compact = false) {
  const row = el('div', { className: 'direction-row' });
  if (!compact) {
    row.appendChild(
      el('span', {
        className: 'direction-tag',
        text: block.direction === 'until' ? 'Until next' : 'Since',
      })
    );
  }
  row.appendChild(el('span', { className: 'relative-cue', text: formatRelativeCue(block) }));
  return row;
}

function renderStatExtra(block, label, compact) {
  const sec = el('div', { className: 'secondary-block' });
  const secRow = el('div', { className: 'direction-row' });
  if (!compact) {
    secRow.appendChild(el('span', { className: 'direction-tag', text: label }));
  }
  secRow.appendChild(el('span', { className: 'relative-cue', text: formatRelativeCue(block) }));
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

function renderCard(vm, readOnly) {
  const { event, primary, secondary, sinceFirst, cycleProgress } = vm;
  const fullColour = Boolean(state.settings.fullColourCards);
  const compact = state.settings.cardDensity === 'compact';
  const li = el('li', {
    className: `event-card glass${fullColour ? ' is-full-colour' : ''}${compact ? ' is-compact' : ''}`,
    style: `--event-color: ${event.color}`,
    'data-id': event.id,
  });

  const head = el('div', { className: 'event-card-head' });
  const titleBlock = el('div', { className: 'event-title-block' });
  titleBlock.appendChild(el('h2', { className: 'event-title', text: event.name }));
  if (!compact) {
    titleBlock.appendChild(el('p', { className: 'event-meta', text: buildEventMeta(event) }));
  }
  head.appendChild(titleBlock);

  if (!readOnly) {
    const actions = el('div', { className: 'event-actions' });
    actions.appendChild(
      iconButton({
        icon: 'edit',
        label: `Edit ${event.name}`,
        onClick: () => openEventModal(event),
      })
    );
    actions.appendChild(
      iconButton({
        icon: 'copy',
        label: `Copy summary for ${event.name}`,
        onClick: async () => {
          const ok = await copyText(buildCopySummary(vm));
          toast(ok ? 'Copied to clipboard' : 'Could not copy', ok ? 'success' : 'error');
        },
      })
    );
    head.appendChild(actions);
  }

  li.appendChild(head);
  li.appendChild(renderDirectionRow(primary, compact));
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

function buildListItems(nowMs, readOnly) {
  const f = state.settings.filters;
  const sections = getViewSections(nowMs);
  const showSectionHeaders =
    f.direction === 'all' &&
    normalizeSort(f.sort) === 'smart' &&
    sections.upcoming.length > 0 &&
    sections.past.length > 0;

  const items = [];

  if (showSectionHeaders) {
    if (sections.upcoming.length) {
      items.push(el('li', { className: 'section-heading', text: 'Upcoming' }));
      items.push(...sections.upcoming.map((vm) => renderCard(vm, readOnly)));
    }
    if (sections.past.length) {
      items.push(el('li', { className: 'section-heading', text: 'Past' }));
      items.push(...sections.past.map((vm) => renderCard(vm, readOnly)));
    }
    return items;
  }

  const vms = sections.all.length ? sections.all : getViewList(nowMs);
  return vms.map((vm) => renderCard(vm, readOnly));
}

export function renderList(nowMs = Date.now()) {
  const list = document.getElementById('event-list');
  const empty = document.getElementById('empty-state');
  if (!list || !empty) return;

  renderSyncBanner();

  const readOnly = state.mode === 'guest';
  const items = buildListItems(nowMs, readOnly);
  const vms = getViewList(nowMs);
  const compact = state.settings.cardDensity === 'compact';

  list.classList.toggle('is-compact', compact);
  list.replaceChildren(...items);

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
      text: 'Every event needs a category (Misc by default). Delete a category to move its events to Misc.',
    })
  );

  const catList = el('ul', { className: 'category-manage-list' });
  for (const cat of getCategories()) {
    const row = el('li', { className: 'category-manage-row' });
    row.appendChild(el('span', { className: 'category-manage-name', text: cat }));
    if (canDeleteCategory(cat)) {
      const count = state.events.filter((e) =>
        categoriesEqual(e.category || DEFAULT_CATEGORY, cat)
      ).length;
      row.appendChild(
        el('button', {
          type: 'button',
          className: 'btn btn-danger btn-sm',
          text: 'Delete',
          'aria-label': `Delete category ${cat}`,
          onClick: () => confirmDeleteCategory(cat, count),
        })
      );
    } else {
      row.appendChild(el('span', { className: 'category-manage-lock', text: 'Default' }));
    }
    catList.appendChild(row);
  }
  categoriesSection.appendChild(catList);
  page.appendChild(categoriesSection);

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
          }
        },
      })
    );
    row.appendChild(fileLabel);
    data.appendChild(row);
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
          el('span', { className: 'calc-alts-chevron', 'aria-hidden': 'true' }),
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
    const next = formatRelativeCue(block);
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

  const vms = getViewList(nowMs);
  const cards = [...list.querySelectorAll('.event-card[data-id]')];

  if (cards.length !== vms.length) {
    renderList(nowMs);
    return;
  }

  for (let i = 0; i < vms.length; i++) {
    const vm = vms[i];
    const card = cards[i];
    if (!card || card.getAttribute('data-id') !== vm.event.id) {
      renderList(nowMs);
      return;
    }

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
  (initialFocus || first).focus();
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

  const form = el('form', { className: 'form-grid' });

  const nameInput = el('input', {
    type: 'text',
    name: 'name',
    required: true,
    maxlength: '80',
    value: draft.name,
    autocomplete: 'off',
  });
  form.appendChild(el('div', { className: 'field' }, [el('label', { text: 'Name' }), nameInput]));

  let modalCategories = [...getCategories()];
  let selectedCategory = draft.category;

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

  categorySelect.addEventListener('change', () => {
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

  form.appendChild(
    el('div', { className: 'field' }, [
      el('label', { text: 'Category' }),
      el('div', { className: 'category-select-wrap' }, [categorySelect]),
      newCategoryWrap,
      el('p', {
        className: 'field-hint',
        text: 'Required. Pick an existing category or add a new one. Default is Misc.',
      }),
    ])
  );

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
  form.appendChild(
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
  form.appendChild(
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
  form.appendChild(
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
  form.appendChild(el('div', { className: 'field' }, [el('label', { text: 'Colour' }), palette]));

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
  form.appendChild(el('div', { className: 'field' }, [el('label', { text: 'Units to show' }), unitsGrid]));

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
  form.appendChild(el('div', { className: 'field' }, [el('label', { text: 'Recurrence' }), freqSelect]));

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
  form.appendChild(sinceField);

  const syncSinceVisibility = () => {
    const recurring = freqSelect.value !== 'none';
    sinceField.hidden = !recurring;
    if (!recurring) {
      sinceLastToggle.checked = true;
      sinceFirstToggle.checked = true;
      cycleToggle.checked = true;
    }
  };
  freqSelect.addEventListener('change', syncSinceVisibility);

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
  form.appendChild(actions);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = {
      name: nameInput.value,
      date: dateInput.value,
      time: timeToggle.checked && timeInput.value ? timeInput.value : null,
      timeZone: tzInput.value.trim() || null,
      color: selectedColor,
      units: [...draft.units],
      category:
        categorySelect.value === NEW_CATEGORY_VALUE
          ? normalizeCategoryName(newCategoryInput.value)
          : selectedCategory || DEFAULT_CATEGORY,
      recurrence: { frequency: freqSelect.value },
      showSinceLast: freqSelect.value === 'none' ? true : sinceLastToggle.checked,
      showSinceFirst: freqSelect.value === 'none' ? true : sinceFirstToggle.checked,
      showCycleProgress: freqSelect.value === 'none' ? true : cycleToggle.checked,
      _categories: modalCategories,
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
