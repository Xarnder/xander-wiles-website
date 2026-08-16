/**
 * Timeline DOM: virtualized scroller, now marker, pinch-zoom, jump-to-now.
 */

import {
  COMPACT_CUE_UNITS_DEFAULT,
  EVENTS_VIEW_TIMELINE,
  getBrowserTimeZone,
  normalizeCompactCueFormat,
  normalizeCompactCueUnits,
} from './constants.js';
import { resolveEventEmoji } from './emoji-from-title.js';
import { toViewModel, filterViewModels, isThisWeekVm, isHiddenFromTimeline } from './filters.js';
import { formatDisplayDate, formatDisplayTime, formatRelativeCue } from './format.js';
import { state } from './store.js';
import { getZonedParts } from './time-engine.js';
import {
  MAX_STACK_NAMES,
  buildTimelineLayout,
  clampScale,
  gapLabelVisible,
  queryWindow,
  scrollTopForTime,
  timeToY,
  yToTime,
} from './timeline-layout.js';

let handlers = {
  onOpenEvent: () => {},
  onSignIn: () => {},
  onAdd: () => {},
};

let scale = 1;
let layout = null;
let attached = false;
let lastCenterTime = null;
let chooserEl = null;
let rafPatch = 0;

export function setTimelineHandlers(h) {
  handlers = { ...handlers, ...h };
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === false || v == null) continue;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function cueOpts() {
  return {
    maxUnits: normalizeCompactCueUnits(
      state.settings.compactCueUnits ?? COMPACT_CUE_UNITS_DEFAULT
    ),
    format: normalizeCompactCueFormat(state.settings.compactCueFormat),
  };
}

function formatMarkerCue(primary) {
  if (!primary) return '';
  return formatRelativeCue(primary, cueOpts());
}

export function getTimelineViewModels(nowMs = Date.now()) {
  const vms = (state.events || []).map((e) => toViewModel(e, nowMs));
  return filterViewModels(vms, state.settings.filters).filter((vm) => !isHiddenFromTimeline(vm.event));
}

function markersFromVms(vms, nowMs) {
  const out = [];
  for (const vm of vms) {
    const instant = vm?.primary?.targetMs;
    if (!Number.isFinite(instant)) continue;
    out.push({
      id: vm.event.id,
      name: String(vm.event.name || 'Event'),
      color: vm.event.color || '',
      instant,
      pinned: vm.event.pinned === true,
      thisWeek: isThisWeekVm(vm, nowMs),
      primary: vm.primary,
      event: vm.event,
    });
  }
  return out;
}

function ensureChrome(root) {
  let scroller = root.querySelector('#timeline-scroller');
  if (scroller) return scroller;

  root.replaceChildren();
  root.className = 'timeline-view';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Timeline');

  const empty = el('div', { id: 'timeline-empty', className: 'empty-state glass', hidden: true });
  scroller = el('div', {
    id: 'timeline-scroller',
    className: 'timeline-scroller',
    tabindex: '0',
  });
  const spacer = el('div', { className: 'timeline-spacer', 'aria-hidden': 'true' });
  const layer = el('div', { className: 'timeline-layer', id: 'timeline-layer' });
  scroller.append(spacer, layer);

  const fab = el('button', {
    id: 'timeline-jump-now',
    type: 'button',
    className: 'timeline-fab',
    hidden: true,
    text: 'Now',
    'aria-label': 'Jump to now',
    onClick: () => jumpToNow(),
  });

  root.append(empty, scroller, fab);
  bindScroller(scroller);
  return scroller;
}

function bindScroller(scroller) {
  if (scroller.dataset.tpBound === '1') return;
  scroller.dataset.tpBound = '1';

  scroller.addEventListener('scroll', () => {
    if (rafPatch) return;
    rafPatch = requestAnimationFrame(() => {
      rafPatch = 0;
      paintWindow();
      updateFab();
      if (layout) {
        lastCenterTime = yToTime(layout, scroller.scrollTop + scroller.clientHeight / 2);
      }
    });
  });

  scroller.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = scroller.getBoundingClientRect();
      const yIn = scroller.scrollTop + (e.clientY - rect.top);
      const t = layout ? yToTime(layout, yIn) : Date.now();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      applyScale(scale * factor, t, e.clientY - rect.top);
    },
    { passive: false }
  );

  let pinch = null;
  scroller.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 2) {
        const d = touchDist(e.touches[0], e.touches[1]);
        const mid = touchMid(e.touches[0], e.touches[1], scroller);
        pinch = {
          startDist: d,
          startScale: scale,
          tCentroid: layout ? yToTime(layout, scroller.scrollTop + mid) : Date.now(),
          originY: mid,
        };
      } else {
        pinch = null;
      }
    },
    { passive: true }
  );
  scroller.addEventListener(
    'touchmove',
    (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const d = touchDist(e.touches[0], e.touches[1]);
      if (!(pinch.startDist > 0)) return;
      const mid = touchMid(e.touches[0], e.touches[1], scroller);
      applyScale(pinch.startScale * (d / pinch.startDist), pinch.tCentroid, mid);
    },
    { passive: false }
  );
  scroller.addEventListener(
    'touchend',
    (e) => {
      if (e.touches.length < 2) pinch = null;
    },
    { passive: true }
  );

  scroller.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!layout?.markers?.length) return;
    e.preventDefault();
    const ordered = [...layout.markers].sort((a, b) => a.y - b.y);
    const focusId = document.activeElement?.getAttribute?.('data-cluster-id');
    let idx = ordered.findIndex((m) => m.id === focusId);
    if (idx < 0) {
      const y = scroller.scrollTop + scroller.clientHeight / 2;
      idx = ordered.reduce(
        (best, m, i) => (Math.abs(m.y - y) < Math.abs(ordered[best].y - y) ? i : best),
        0
      );
    }
    const next = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
    const target = ordered[Math.max(0, Math.min(ordered.length - 1, next))];
    if (!target) return;
    const node = scroller.querySelector(`[data-cluster-id="${CSS.escape(target.id)}"]`);
    node?.focus();
    node?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });
}

function touchDist(a, b) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function touchMid(a, b, scroller) {
  const rect = scroller.getBoundingClientRect();
  const cy = (a.clientY + b.clientY) / 2;
  return cy - rect.top;
}

function applyScale(nextScale, tCentroid, originYInScroller) {
  const scroller = document.getElementById('timeline-scroller');
  if (!scroller || !layout) return;
  const vh = scroller.clientHeight || layout.viewportHeight;
  const clamped = clampScale(nextScale, {
    spanMs: layout.spanMs,
    viewportHeight: vh,
  });
  if (Math.abs(clamped - scale) < 0.0001) return;
  scale = clamped;
  const nowMs = Date.now();
  rebuildLayout(nowMs, vh, { preserveTime: tCentroid, originRatio: originYInScroller / vh });
}

function rebuildLayout(nowMs, viewportHeight, { preserveTime, originRatio } = {}) {
  const vms = getTimelineViewModels(nowMs);
  const markers = markersFromVms(vms, nowMs);
  layout = buildTimelineLayout({
    markers,
    nowMs,
    viewportHeight,
    scale,
    timeZone: getBrowserTimeZone(),
  });
  const scroller = document.getElementById('timeline-scroller');
  if (!scroller) return layout;
  const spacer = scroller.querySelector('.timeline-spacer');
  if (spacer) spacer.style.height = `${Math.max(layout.height, viewportHeight)}px`;
  const t = Number.isFinite(preserveTime) ? preserveTime : nowMs;
  const ratio = Number.isFinite(originRatio) ? originRatio : 0.5;
  scroller.scrollTop = scrollTopForTime(layout, t, viewportHeight, ratio);
  lastCenterTime = t;
  paintWindow();
  updateFab();
  return layout;
}

function paintWindow() {
  const scroller = document.getElementById('timeline-scroller');
  const layer = document.getElementById('timeline-layer');
  if (!scroller || !layer || !layout) return;
  const vh = scroller.clientHeight || 1;
  const overscan = vh;
  const win = queryWindow(layout, scroller.scrollTop, scroller.scrollTop + vh, overscan);
  const wanted = new Set();

  const track = ensureChild(layer, 'timeline-track', 'div', { className: 'timeline-track', 'aria-hidden': 'true' });
  track.style.height = `${layout.height}px`;
  wanted.add('timeline-track');

  if (win.now) {
    const nowNode = ensureChild(layer, 'timeline-now', 'div', {
      className: 'timeline-now',
      'aria-label': 'Now',
    });
    nowNode.style.transform = `translate3d(0, ${win.now.y}px, 0) translateY(-50%)`;
    let label = nowNode.querySelector('.timeline-now-label');
    if (!label) {
      label = el('span', { className: 'timeline-now-label', text: 'Now' });
      nowNode.appendChild(label);
    }
    wanted.add('timeline-now');
  }

  for (const seg of win.segments) {
    if (seg.fromKind === 'pad' || seg.toKind === 'pad') {
      if (seg.kind !== 'void') continue;
    }
    if (
      !gapLabelVisible(seg, {
        nowY: layout.now?.y,
        markerYs: (layout.markers || []).map((m) => m.y),
      })
    ) {
      continue;
    }
    const id = `seg:${seg.id}`;
    const node = ensureChild(layer, id, 'div', {
      className: `timeline-gap${seg.kind === 'void' ? ' is-void' : ''}`,
      'aria-hidden': 'true',
    });
    const mid = (seg.y0 + seg.y1) / 2;
    node.style.transform = `translate3d(0, ${mid}px, 0) translateY(-50%)`;
    node.style.height = `${Math.max(18, seg.y1 - seg.y0)}px`;
    let chip = node.querySelector('.timeline-gap-chip');
    if (!chip) {
      chip = el('span', { className: 'timeline-gap-chip' });
      node.appendChild(chip);
    }
    if (chip.textContent !== seg.label) chip.textContent = seg.label;
    wanted.add(id);
  }

  for (const tick of win.ticks) {
    const kind = tick.kind === 'month' ? 'month' : 'year';
    const id = `tick:${tick.id}`;
    const node = ensureChild(layer, id, 'div', {
      className: `timeline-tick is-${kind}`,
      'aria-hidden': 'true',
    });
    node.className = `timeline-tick is-${kind}`;
    node.style.transform = `translate3d(0, ${tick.y}px, 0)`;
    fillTick(node, tick, layout);
    wanted.add(id);
  }

  for (const m of win.markers) {
    const id = `m:${m.id}`;
    const node = ensureChild(layer, id, 'button', {
      type: 'button',
      className: 'timeline-marker',
      'data-cluster-id': m.id,
    });
    node.style.transform = `translate3d(0, ${m.y}px, 0) translateY(-50%)`;
    const color = m.members[0]?.color || '';
    if (color) node.style.setProperty('--event-color', color);
    else node.style.removeProperty('--event-color');
    fillMarker(node, m);
    wanted.add(id);
  }

  for (const child of [...layer.children]) {
    const key = child.dataset.tpKey;
    if (key && !wanted.has(key) && key !== 'timeline-track') child.remove();
  }
}

function fillTick(node, tick, layout) {
  let line = node.querySelector('.timeline-tick-line');
  let label = node.querySelector('.timeline-tick-label');
  if (!line || !label) {
    node.replaceChildren();
    line = el('span', { className: 'timeline-tick-line' });
    label = el('span', { className: 'timeline-tick-label' });
    node.append(line, label);
  }
  const text = tick.label || (tick.kind === 'month' ? '' : String(tick.year || ''));
  if (label.textContent !== text) label.textContent = text;
  const collide =
    (layout.now && Math.abs(tick.y - layout.now.y) < 18) ||
    (layout.markers || []).some((m) => Math.abs(tick.y - m.y) < 18);
  label.hidden = collide || !text;
}

function ensureChild(layer, key, tag, attrs) {
  let node = layer.querySelector(`[data-tp-key="${CSS.escape(key)}"]`);
  if (node && node.tagName.toLowerCase() !== tag) {
    node.remove();
    node = null;
  }
  if (!node) {
    node = el(tag, attrs);
    node.dataset.tpKey = key;
    if (tag === 'button') {
      node.addEventListener('click', () => onMarkerClick(node));
    }
    layer.appendChild(node);
  }
  return node;
}

function memberLabel(m) {
  const emoji = m?.event ? resolveEventEmoji(m.event) : '';
  return `${emoji ? `${emoji} ` : ''}${m?.name || 'Event'}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Civil date of the plotted instant (next occurrence for recurring events). */
function formatMarkerWhen(m) {
  const event = m?.event;
  const tz = event?.timeZone || getBrowserTimeZone();
  const instant = m?.instant;
  if (Number.isFinite(instant)) {
    const p = getZonedParts(instant, tz);
    const date = formatDisplayDate(`${p.year}-${pad2(p.month)}-${pad2(p.day)}`);
    if (event?.time) return `${date} · ${formatDisplayTime(`${pad2(p.hour)}:${pad2(p.minute)}`)}`;
    return date;
  }
  if (!event?.date) return '';
  const bits = [formatDisplayDate(event.date)];
  if (event.time) bits.push(formatDisplayTime(event.time));
  return bits.join(' · ');
}

function setDateEl(parent, dateText, { after } = {}) {
  let dateEl = parent.querySelector(':scope > .timeline-marker-date');
  if (!dateText) {
    dateEl?.remove();
    return;
  }
  if (!dateEl) {
    dateEl = el('span', { className: 'timeline-marker-date' });
    if (after?.parentNode === parent) after.after(dateEl);
    else parent.appendChild(dateEl);
  }
  if (dateEl.textContent !== dateText) dateEl.textContent = dateText;
}

function fillMarker(node, m) {
  const members = m.members || [];
  const first = members[0];
  const multi = members.length > 1;
  const titleText = multi ? `${members.length} events` : memberLabel(first);
  const cue = formatMarkerCue(first?.primary);
  const when = formatMarkerWhen(first);
  const ariaBits = [titleText, !multi ? when : '', cue].filter(Boolean);

  node.classList.toggle('is-cluster', multi);
  node.dataset.eventId = first?.id || '';
  node.setAttribute('aria-label', ariaBits.join(', '));

  let titleRow = node.querySelector('.timeline-marker-title-row');
  if (!titleRow) {
    titleRow = el('span', { className: 'timeline-marker-title-row' });
    const existingTitle = node.querySelector('.timeline-marker-title');
    if (existingTitle) existingTitle.replaceWith(titleRow);
    else node.appendChild(titleRow);
  }
  let title = titleRow.querySelector('.timeline-marker-title');
  if (!title) {
    title = el('span', { className: 'timeline-marker-title' });
    titleRow.prepend(title);
  }
  if (title.textContent !== titleText) title.textContent = titleText;
  setDateEl(titleRow, multi ? '' : when, { after: title });

  let stack = node.querySelector('.timeline-marker-stack');
  if (multi) {
    const shown = members.slice(0, MAX_STACK_NAMES);
    const extra = members.length - shown.length;
    const lines = shown.map((x) => `${memberLabel(x)}\t${formatMarkerWhen(x)}`);
    if (extra > 0) lines.push(`+${extra} more`);
    const stackText = lines.join('\n');
    if (!stack) {
      stack = el('span', { className: 'timeline-marker-stack' });
      titleRow.after(stack);
    }
    if (stack.dataset.tpStack !== stackText) {
      stack.dataset.tpStack = stackText;
      stack.replaceChildren(
        ...shown.map((x) => {
          const item = el('span', { className: 'timeline-marker-stack-item' });
          item.append(
            el('span', { className: 'timeline-marker-stack-name', text: memberLabel(x) }),
            el('span', { className: 'timeline-marker-date', text: formatMarkerWhen(x) })
          );
          return item;
        }),
        ...(extra > 0
          ? [el('span', { className: 'timeline-marker-stack-item is-more', text: `+${extra} more` })]
          : [])
      );
    }
  } else if (stack) {
    stack.remove();
  }

  let cueEl = node.querySelector('.timeline-marker-cue');
  if (!cueEl) {
    cueEl = el('span', { className: 'timeline-marker-cue' });
    node.appendChild(cueEl);
  }
  if (cueEl.textContent !== cue) cueEl.textContent = cue;

  const badges = [];
  if (members.some((x) => x.pinned)) badges.push('Pinned');
  if (members.some((x) => x.thisWeek)) badges.push('This week');
  let badgeRow = node.querySelector('.timeline-marker-badges');
  const badgeText = badges.join(' · ');
  if (badgeText) {
    if (!badgeRow) {
      badgeRow = el('span', { className: 'timeline-marker-badges' });
      node.appendChild(badgeRow);
    }
    if (badgeRow.textContent !== badgeText) badgeRow.textContent = badgeText;
  } else if (badgeRow) {
    badgeRow.remove();
  }

  node._tpMembers = members;
}

function onMarkerClick(node) {
  const members = node._tpMembers || [];
  if (members.length > 1) {
    openChooser(members, node);
    return;
  }
  const event = members[0]?.event;
  if (event) handlers.onOpenEvent(event);
}

function openChooser(members, anchor) {
  closeChooser();
  const root = document.getElementById('timeline-view');
  if (!root) return;
  chooserEl = el('div', {
    className: 'timeline-chooser glass',
    role: 'listbox',
    'aria-label': 'Events in this group',
  });
  const timesDiffer = members.some((m) => m.instant !== members[0].instant);
  for (const m of members) {
    const when = formatMarkerWhen(m);
    const cue = timesDiffer ? formatMarkerCue(m.primary) : '';
    chooserEl.appendChild(
      el('button', {
        type: 'button',
        className: 'timeline-chooser-item',
        role: 'option',
        text: [m.name, when, cue].filter(Boolean).join(' · '),
        onClick: () => {
          closeChooser();
          handlers.onOpenEvent(m.event);
        },
      })
    );
  }
  root.appendChild(chooserEl);
  const r = anchor.getBoundingClientRect();
  const rootR = root.getBoundingClientRect();
  chooserEl.style.top = `${Math.min(root.clientHeight - 8, Math.max(8, r.bottom - rootR.top))}px`;
  const onDoc = (e) => {
    if (!chooserEl?.contains(e.target) && e.target !== anchor) closeChooser();
  };
  setTimeout(() => document.addEventListener('pointerdown', onDoc, { once: true }), 0);
}

function closeChooser() {
  if (chooserEl) {
    chooserEl.remove();
    chooserEl = null;
  }
}

function updateFab() {
  const fab = document.getElementById('timeline-jump-now');
  const scroller = document.getElementById('timeline-scroller');
  if (!fab || !scroller || !layout?.now) {
    if (fab) fab.hidden = true;
    return;
  }
  const top = scroller.scrollTop;
  const bottom = top + scroller.clientHeight;
  const y = layout.now.y;
  fab.hidden = y >= top + 24 && y <= bottom - 24;
}

function renderEmpty(root, count) {
  const empty = root.querySelector('#timeline-empty');
  const scroller = root.querySelector('#timeline-scroller');
  const fab = root.querySelector('#timeline-jump-now');
  if (!empty) return;
  if (count > 0) {
    empty.hidden = true;
    empty.replaceChildren();
    if (scroller) scroller.hidden = false;
    return;
  }
  if (scroller) scroller.hidden = true;
  if (fab) fab.hidden = true;
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
          onClick: () => handlers.onAdd(),
        })
      : el('button', {
          type: 'button',
          className: 'btn btn-google',
          text: 'Sign in with Google',
          onClick: () => handlers.onSignIn(),
        })
  );
}

export function hideTimelineView() {
  const root = document.getElementById('timeline-view');
  if (!root) return;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  closeChooser();
  attached = false;
}

export function jumpToNow(nowMs = Date.now()) {
  const scroller = document.getElementById('timeline-scroller');
  if (!scroller) return;
  const vh = scroller.clientHeight || 400;
  if (!layout) rebuildLayout(nowMs, vh, { preserveTime: nowMs, originRatio: 0.5 });
  else {
    scroller.scrollTo({
      top: scrollTopForTime(layout, nowMs, vh, 0.5),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }
  lastCenterTime = nowMs;
  updateFab();
}

export function renderTimeline(nowMs = Date.now(), { centerNow = false } = {}) {
  const root = document.getElementById('timeline-view');
  if (!root) return;
  root.hidden = false;
  root.removeAttribute('aria-hidden');
  const scroller = ensureChrome(root);
  const vms = getTimelineViewModels(nowMs);
  renderEmpty(root, vms.length);
  if (!vms.length) {
    layout = null;
    attached = true;
    return;
  }

  const vh = Math.max(160, scroller.clientHeight || Math.round(window.innerHeight * 0.55));
  const justShown = !attached;
  attached = true;
  const preserve =
    centerNow || justShown ? nowMs : lastCenterTime != null ? lastCenterTime : nowMs;
  rebuildLayout(nowMs, vh, { preserveTime: preserve, originRatio: 0.5 });
  if (centerNow || justShown) jumpToNow(nowMs);
}

export function patchTimeline(nowMs = Date.now(), { relayout = false } = {}) {
  if (state.view !== EVENTS_VIEW_TIMELINE) return;
  const root = document.getElementById('timeline-view');
  if (!root || root.hidden) return;
  if (relayout || !layout) {
    const scroller = document.getElementById('timeline-scroller');
    const vh = scroller?.clientHeight || 400;
    const preserve = lastCenterTime != null ? lastCenterTime : yToTime(layout || { tMax: nowMs, tMin: nowMs, height: 1, segments: [] }, (scroller?.scrollTop || 0) + vh / 2);
    rebuildLayout(nowMs, vh, { preserveTime: preserve, originRatio: 0.5 });
    return;
  }
  const vms = getTimelineViewModels(nowMs);
  const byId = new Map(vms.map((vm) => [vm.event.id, vm]));
  const layer = document.getElementById('timeline-layer');
  if (!layer) return;
  for (const node of layer.querySelectorAll('.timeline-marker')) {
    const members = node._tpMembers || [];
    for (const m of members) {
      const vm = byId.get(m.id);
      if (vm) m.primary = vm.primary;
    }
    if (members[0]) fillMarker(node, { members, id: node.dataset.clusterId });
  }
}

export function timelineScale() {
  return scale;
}

if (typeof window !== 'undefined') {
  const onViewport = () => {
    if (state.view !== EVENTS_VIEW_TIMELINE) return;
    const scroller = document.getElementById('timeline-scroller');
    if (!scroller || !layout) return;
    const vh = scroller.clientHeight || 400;
    const preserve =
      lastCenterTime != null ? lastCenterTime : yToTime(layout, scroller.scrollTop + vh / 2);
    rebuildLayout(Date.now(), vh, { preserveTime: preserve, originRatio: 0.5 });
  };
  window.addEventListener('resize', onViewport);
  window.visualViewport?.addEventListener('resize', onViewport);
}
