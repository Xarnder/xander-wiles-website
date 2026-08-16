/**
 * Pure timeline geometry: instants → Y, clusters, labeled voids, year ticks.
 * No DOM. Now-centered: y grows downward into the past (scroll up = future).
 */

import { DEFAULT_UNITS, getBrowserTimeZone } from './constants.js';
import { decomposeDuration, getVisibleUnits, getZonedParts, zonedCivilToUtcMs } from './time-engine.js';
import { formatRelativeCue } from './format.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const VOID_MIN_MS = 21 * DAY_MS;
export const VOID_HEIGHT = 80;
export const VOID_HEIGHT_MIN = 72;
export const VOID_HEIGHT_MAX = 96;
export const DEFAULT_PX_PER_DAY = 40;
export const PAD_VIEWPORTS = 1;
export const VOID_VIEWPORTS = 2;
export const MIN_SPAN_VIEWPORTS = 1.2;
export const MAX_HOUR_VIEWPORTS = 2;
export const MIN_MARKER_GAP_PX = 56;
export const MAX_STACK_NAMES = 4;
export const CLUSTER_GUTTER_PX = 8;
/** Min Y between Now and the nearest marker so labels do not stack. */
export const NOW_CLEARANCE_PX = 72;
export const GAP_LABEL_MIN_PX = 48;
export const GAP_LABEL_CLEAR_PX = 28;
export const MIN_MONTH_TICK_PX = 36;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function pxPerMsFromScale(scale, pxPerDay = DEFAULT_PX_PER_DAY) {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const day = Number.isFinite(pxPerDay) && pxPerDay > 0 ? pxPerDay : DEFAULT_PX_PER_DAY;
  return (day * s) / DAY_MS;
}

export function isVoidWorthy(deltaMs, pxPerMs, viewportHeight) {
  const dt = Math.abs(deltaMs);
  const vh = Math.max(1, viewportHeight || 1);
  const px = Number.isFinite(pxPerMs) && pxPerMs > 0 ? pxPerMs : pxPerMsFromScale(1);
  const linearH = dt * px;
  if (!(dt > VOID_MIN_MS && linearH > VOID_VIEWPORTS * vh)) return false;
  // Skip the void if it would barely shrink the span — keep true linear instead.
  return voidHeightPx(dt, px) < linearH * 0.85;
}

/**
 * Compressed-gap height tracks the current zoom so a month never looks shorter
 * than a week. Floor is the linear size of VOID_MIN_MS; extra empty time adds a
 * log bump, still far below a fully linear multi-year stretch.
 */
export function voidHeightPx(deltaMs = VOID_MIN_MS, pxPerMs = pxPerMsFromScale(1)) {
  const dt = Math.max(0, Math.abs(deltaMs));
  const px = Number.isFinite(pxPerMs) && pxPerMs > 0 ? pxPerMs : pxPerMsFromScale(1);
  const linearH = dt * px;
  const floor = Math.max(VOID_HEIGHT_MIN, VOID_MIN_MS * px);
  const extra = Math.log2(1 + Math.max(0, dt - VOID_MIN_MS) / DAY_MS) * 20;
  return Math.min(linearH, floor + extra);
}

/**
 * Clamp pinch scale so the padded span cannot collapse to a dot,
 * and 1 hour cannot expand beyond two viewports.
 */
export function clampScale(scale, { spanMs, viewportHeight, pxPerDay = DEFAULT_PX_PER_DAY } = {}) {
  const vh = Math.max(1, viewportHeight || 1);
  let minScale = 0.02;
  let maxScale = 64;
  const dayPx = pxPerDay > 0 ? pxPerDay : DEFAULT_PX_PER_DAY;
  if (Number.isFinite(spanMs) && spanMs > 0) {
    minScale = Math.max(0.02, (MIN_SPAN_VIEWPORTS * vh) / ((spanMs / DAY_MS) * dayPx));
  }
  maxScale = Math.min(64, (MAX_HOUR_VIEWPORTS * vh) / ((HOUR_MS / DAY_MS) * dayPx));
  if (minScale > maxScale) minScale = maxScale;
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.min(maxScale, Math.max(minScale, s));
}

function compareMarkerName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

export function estimatedMarkerHeightPx(memberCount) {
  const n = Math.max(1, Number(memberCount) || 1);
  if (n === 1) return MIN_MARKER_GAP_PX;
  const shown = Math.min(n, MAX_STACK_NAMES);
  const extra = n > MAX_STACK_NAMES ? 1 : 0;
  return 52 + (shown + extra) * 20;
}

function representativeInstant(members) {
  const times = members.map((m) => m.instant).sort((a, b) => a - b);
  return times[Math.floor((times.length - 1) / 2)];
}

function clusterId(members) {
  return `c:${members.map((m) => m.id || String(m.instant)).sort().join('|')}`;
}

function nowSplitsGroups(aMembers, bMembers, nowMs) {
  if (!Number.isFinite(nowMs)) return false;
  const aMin = Math.min(...aMembers.map((m) => m.instant));
  const aMax = Math.max(...aMembers.map((m) => m.instant));
  const bMin = Math.min(...bMembers.map((m) => m.instant));
  const bMax = Math.max(...bMembers.map((m) => m.instant));
  const lo = Math.min(aMin, bMin);
  const hi = Math.max(aMax, bMax);
  return nowMs > lo && nowMs < hi;
}

function finalizeClusters(groups) {
  return groups.map((g) => {
    const members = [...g.members].sort(
      (a, b) => b.instant - a.instant || compareMarkerName(a, b)
    );
    return {
      id: clusterId(members),
      instant: representativeInstant(members),
      tMin: Math.min(...members.map((m) => m.instant)),
      tMax: Math.max(...members.map((m) => m.instant)),
      members,
    };
  });
}

/**
 * Group markers that share an instant, then fold neighbours whose labels
 * would overlap at the current scale. Zooming in (higher pxPerMs) splits them.
 * Groups on opposite sides of now stay separate.
 */
export function clusterMarkers(markers, { pxPerMs, minGapPx = MIN_MARKER_GAP_PX, nowMs } = {}) {
  const sorted = [...(markers || [])]
    .filter((m) => m && Number.isFinite(m.instant))
    .sort((a, b) => b.instant - a.instant || compareMarkerName(a, b));

  const exact = [];
  for (const m of sorted) {
    const last = exact[exact.length - 1];
    if (last && last.instant === m.instant) last.members.push(m);
    else exact.push({ instant: m.instant, members: [m] });
  }

  const px = Number.isFinite(pxPerMs) && pxPerMs > 0 ? pxPerMs : 0;
  if (!px) return finalizeClusters(exact);

  const gapFloor = Number.isFinite(minGapPx) && minGapPx > 0 ? minGapPx : MIN_MARKER_GAP_PX;
  const groups = exact.map((c) => ({ members: [...c.members] }));
  let i = 0;
  while (i < groups.length - 1) {
    const a = groups[i];
    const b = groups[i + 1];
    const closestMs =
      Math.min(...a.members.map((m) => m.instant)) - Math.max(...b.members.map((m) => m.instant));
    const needPx =
      (estimatedMarkerHeightPx(a.members.length) + estimatedMarkerHeightPx(b.members.length)) / 2 +
      CLUSTER_GUTTER_PX;
    const pxGap = Math.max(0, closestMs) * px;
    if (!nowSplitsGroups(a.members, b.members, nowMs) && pxGap < Math.max(gapFloor, needPx)) {
      a.members.push(...b.members);
      groups.splice(i + 1, 1);
      continue;
    }
    i += 1;
  }
  return finalizeClusters(groups);
}

export function gapLabelVisible(seg, { nowY, markerYs } = {}) {
  if (!seg) return false;
  const h = seg.y1 - seg.y0;
  if (!(h >= GAP_LABEL_MIN_PX)) return false;
  const mid = (seg.y0 + seg.y1) / 2;
  if (Number.isFinite(nowY) && Math.abs(mid - nowY) < GAP_LABEL_CLEAR_PX) return false;
  for (const y of markerYs || []) {
    if (Math.abs(mid - y) < GAP_LABEL_CLEAR_PX) return false;
  }
  return true;
}

export function formatGapLabel(fromMs, toMs, timeZone, { compressed = false, maxUnits = 2 } = {}) {
  const earlier = Math.min(fromMs, toMs);
  const later = Math.max(fromMs, toMs);
  const tz = timeZone || 'UTC';
  const parts = decomposeDuration(earlier, later, tz, DEFAULT_UNITS);
  const visibleUnits = getVisibleUnits(parts, DEFAULT_UNITS);
  const cue = formatRelativeCue(
    { direction: 'until', parts, visibleUnits },
    { maxUnits, format: 'words' }
  );
  const phrase = String(cue || '').replace(/^in\s+/, '') || 'now';
  if (phrase === 'now' || phrase === 'just now') return compressed ? 'same time' : 'now';
  return compressed ? `${phrase} compressed` : phrase;
}

function calendarTickInstants(tPast, tFuture, timeZone, pxPerMs) {
  if (!(tFuture > tPast)) return [];
  const tz = timeZone || 'UTC';
  const past = getZonedParts(tPast, tz);
  const future = getZonedParts(tFuture, tz);
  const showMonths = 30 * DAY_MS * (pxPerMs || 0) >= MIN_MONTH_TICK_PX;
  const ticks = [];
  let year = past.year;
  let month = past.month + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  const yearLimit = future.year + 2;
  while (year <= yearLimit) {
    const instant = zonedCivilToUtcMs(year, month, 1, 0, 0, 0, tz);
    if (instant >= tFuture) break;
    if (instant > tPast) {
      if (month === 1) {
        ticks.push({
          kind: 'year',
          year,
          month: 1,
          instant,
          label: String(year),
        });
      } else if (showMonths) {
        ticks.push({
          kind: 'month',
          year,
          month,
          instant,
          label: MONTH_SHORT[month - 1] || String(month),
        });
      }
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return ticks;
}

function interpolateY(seg, instant) {
  const spanT = seg.t0 - seg.t1;
  const spanY = seg.y1 - seg.y0;
  if (spanT === 0) return seg.y0;
  if (seg.kind === 'void') {
    const mid = (seg.t0 + seg.t1) / 2;
    return instant >= mid ? seg.y0 : seg.y1;
  }
  return seg.y0 + ((seg.t0 - instant) / spanT) * spanY;
}

function interpolateT(seg, y) {
  const spanY = seg.y1 - seg.y0;
  const spanT = seg.t0 - seg.t1;
  if (spanY === 0) return seg.t0;
  if (seg.kind === 'void') {
    const mid = (seg.y0 + seg.y1) / 2;
    return y <= mid ? seg.t0 : seg.t1;
  }
  return seg.t0 - ((y - seg.y0) / spanY) * spanT;
}

/**
 * @param {object} opts
 * @param {Array} opts.markers
 * @param {number} opts.nowMs
 * @param {number} opts.viewportHeight
 * @param {number} [opts.scale]
 * @param {string} [opts.timeZone]
 */
export function buildTimelineLayout({
  markers = [],
  nowMs = Date.now(),
  viewportHeight = 640,
  scale = 1,
  timeZone,
} = {}) {
  const tz = timeZone || getBrowserTimeZone();
  const vh = Math.max(1, Number(viewportHeight) || 640);
  const pxPerMs = pxPerMsFromScale(scale);
  const clusters = clusterMarkers(markers, { pxPerMs, nowMs, minGapPx: MIN_MARKER_GAP_PX });

  const points = clusters.map((cluster) => ({
    kind: 'cluster',
    instant: cluster.instant,
    cluster,
  }));
  points.push({ kind: 'now', instant: nowMs, cluster: null });
  points.sort((a, b) => {
    const dt = b.instant - a.instant;
    if (dt !== 0) return dt;
    if (a.kind === 'now') return -1;
    if (b.kind === 'now') return 1;
    return 0;
  });

  const instants = points.map((p) => p.instant);
  const maxInstant = instants.length ? Math.max(...instants) : nowMs;
  const minInstant = instants.length ? Math.min(...instants) : nowMs;
  const padTime = vh / pxPerMs;
  const tMax = maxInstant + padTime;
  const tMin = minInstant - padTime;
  const spanMs = Math.max(1, tMax - tMin);

  const chain = [{ kind: 'pad', instant: tMax, cluster: null }, ...points, { kind: 'pad', instant: tMin, cluster: null }];

  const segments = [];
  const placed = [];
  const ticks = [];
  let y = 0;

  placed.push({ kind: 'pad', instant: chain[0].instant, y: 0, cluster: null });

  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i];
    const b = chain[i + 1];
    const dt = a.instant - b.instant;
    if (dt <= 0) {
      placed.push({ kind: b.kind, instant: b.instant, y, cluster: b.cluster || null });
      continue;
    }
    const linearH = dt * pxPerMs;
    const compressed = isVoidWorthy(dt, pxPerMs, vh);
    const nearNow = a.kind === 'now' || b.kind === 'now';
    let height = compressed ? voidHeightPx(dt, pxPerMs) : linearH;
    if (!compressed && nearNow) height = Math.max(height, NOW_CLEARANCE_PX);
    const y0 = y;
    const y1 = y + height;
    const kind = compressed ? 'void' : 'linear';
    const label = formatGapLabel(a.instant, b.instant, tz, { compressed });
    segments.push({
      id: `s:${a.instant}:${b.instant}:${kind}`,
      kind,
      y0,
      y1,
      t0: a.instant,
      t1: b.instant,
      label,
      fromKind: a.kind,
      toKind: b.kind,
    });
    if (!compressed) {
      for (const tick of calendarTickInstants(b.instant, a.instant, tz, pxPerMs)) {
        const kind = tick.kind === 'month' ? 'month' : 'year';
        ticks.push({
          id: kind === 'year' ? `y:${tick.year}` : `m:${tick.year}-${tick.month}`,
          kind,
          year: tick.year,
          month: tick.month,
          instant: tick.instant,
          label: tick.label,
          y: interpolateY({ y0, y1, t0: a.instant, t1: b.instant, kind: 'linear' }, tick.instant),
        });
      }
    }
    y = y1;
    placed.push({ kind: b.kind, instant: b.instant, y, cluster: b.cluster || null });
  }

  const nowPlaced = placed.find((p) => p.kind === 'now');
  const markerNodes = placed
    .filter((p) => p.kind === 'cluster' && p.cluster)
    .map((p) => ({
      type: 'cluster',
      id: p.cluster.id,
      y: p.y,
      instant: p.instant,
      cluster: p.cluster,
      members: p.cluster.members,
    }));

  return {
    timeZone: tz,
    nowMs,
    scale,
    pxPerMs,
    viewportHeight: vh,
    tMax,
    tMin,
    spanMs,
    height: y,
    nowY: nowPlaced ? nowPlaced.y : vh / 2,
    markers: markerNodes,
    now: nowPlaced ? { type: 'now', y: nowPlaced.y, instant: nowMs } : null,
    segments,
    ticks,
    points: placed,
  };
}

export function queryWindow(layout, y0, y1, overscan = 0) {
  const a = Math.min(y0, y1) - overscan;
  const b = Math.max(y0, y1) + overscan;
  const inY = (y) => y >= a && y <= b;
  return {
    markers: (layout.markers || []).filter((m) => inY(m.y)),
    now: layout.now && inY(layout.now.y) ? layout.now : null,
    segments: (layout.segments || []).filter((s) => s.y1 >= a && s.y0 <= b),
    ticks: (layout.ticks || []).filter((t) => inY(t.y)),
  };
}

export function yToTime(layout, y) {
  if (!layout) return Date.now();
  if (y <= 0) return layout.tMax;
  if (y >= layout.height) return layout.tMin;
  const segs = layout.segments || [];
  for (const seg of segs) {
    if (y >= seg.y0 && y <= seg.y1) return interpolateT(seg, y);
  }
  if (!segs.length) return layout.nowMs;
  if (y < segs[0].y0) return segs[0].t0;
  return segs[segs.length - 1].t1;
}

export function timeToY(layout, instant) {
  if (!layout || !Number.isFinite(instant)) return 0;
  if (instant >= layout.tMax) return 0;
  if (instant <= layout.tMin) return layout.height;
  const segs = layout.segments || [];
  for (const seg of segs) {
    if (instant <= seg.t0 && instant >= seg.t1) return interpolateY(seg, instant);
  }
  if (layout.now && instant === layout.now.instant) return layout.now.y;
  const markers = layout.markers || [];
  let best = layout.nowY;
  let bestDt = Infinity;
  for (const m of markers) {
    const dt = Math.abs(m.instant - instant);
    if (dt < bestDt) {
      bestDt = dt;
      best = m.y;
    }
  }
  return best;
}

export function scrollTopForTime(layout, instant, viewportHeight, anchorRatio = 0.5) {
  const y = timeToY(layout, instant);
  const vh = Math.max(1, viewportHeight || layout.viewportHeight || 1);
  const maxScroll = Math.max(0, layout.height - vh);
  return Math.min(maxScroll, Math.max(0, y - vh * anchorRatio));
}
