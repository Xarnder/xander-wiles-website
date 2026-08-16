import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toViewModel } from './filters.js';
import {
  buildTimelineLayout,
  clampScale,
  clusterMarkers,
  estimatedMarkerHeightPx,
  isVoidWorthy,
  pxPerMsFromScale,
  queryWindow,
  timeToY,
  yToTime,
  DAY_MS,
  DEFAULT_PX_PER_DAY,
  HOUR_MS,
  MIN_MARKER_GAP_PX,
  VOID_MIN_MS,
} from './timeline-layout.js';

const TZ = 'UTC';
const NOW = Date.UTC(2026, 7, 16, 12, 0, 0);

function marker(id, instant, name = id) {
  return { id, name, instant, color: '#3cf0ff' };
}

function layoutOf(markers, extra = {}) {
  return buildTimelineLayout({
    markers,
    nowMs: NOW,
    viewportHeight: extra.viewportHeight ?? 400,
    scale: extra.scale ?? 1,
    timeZone: TZ,
    ...extra,
  });
}

describe('timeline-layout', () => {
  it('places future above now and past below (smaller y = later)', () => {
    const future = NOW + 2 * DAY_MS;
    const past = NOW - 2 * DAY_MS;
    const layout = layoutOf([marker('f', future, 'Soon'), marker('p', past, 'Ago')]);
    const f = layout.markers.find((m) => m.members[0].id === 'f');
    const p = layout.markers.find((m) => m.members[0].id === 'p');
    assert.ok(f && p && layout.now);
    assert.ok(f.y < layout.now.y, 'future y should be less than now');
    assert.ok(layout.now.y < p.y, 'now y should be less than past');
  });

  it('sits now between a past and a future instant', () => {
    const layout = layoutOf([
      marker('f', NOW + 5 * DAY_MS),
      marker('p', NOW - 5 * DAY_MS),
    ]);
    const ys = layout.markers.map((m) => m.y).sort((a, b) => a - b);
    assert.ok(layout.now.y > ys[0] && layout.now.y < ys[1]);
  });

  it('spaces a 3-day pair farther than a 6-hour pair, roughly proportional', () => {
    const sixHours = 6 * HOUR_MS;
    const threeDays = 3 * DAY_MS;
    const near = layoutOf([
      marker('a', NOW + 10 * DAY_MS),
      marker('b', NOW + 10 * DAY_MS + sixHours),
    ], { scale: 8 });
    const far = layoutOf([
      marker('a', NOW + 10 * DAY_MS),
      marker('b', NOW + 10 * DAY_MS + threeDays),
    ], { scale: 8 });
    const nearGap = Math.abs(near.markers[0].y - near.markers[1].y);
    const farGap = Math.abs(far.markers[0].y - far.markers[1].y);
    assert.ok(farGap > nearGap);
    const ratio = farGap / nearGap;
    const expected = threeDays / sixHours;
    assert.ok(Math.abs(ratio - expected) / expected < 0.05);
  });

  it('compresses a 10-year empty pair into a void much shorter than linear', () => {
    const tenYears = 10 * 365 * DAY_MS;
    const layout = layoutOf([marker('a', NOW), marker('b', NOW - tenYears)], {
      viewportHeight: 400,
      scale: 1,
    });
    const voids = layout.segments.filter((s) => s.kind === 'void');
    assert.ok(voids.length >= 1, 'expected a compressed void');
    const linear = tenYears * pxPerMsFromScale(1);
    assert.ok(voids[0].y1 - voids[0].y0 < linear / 20);
    assert.match(voids[0].label, /compressed/i);
  });

  it('decreasing scale can convert a void back to linear (void uses projected height)', () => {
    const gap = 30 * DAY_MS;
    const vh = 400;
    const px = pxPerMsFromScale(1);
    assert.ok(isVoidWorthy(gap, px, vh));
    const zoomedOut = pxPerMsFromScale(0.05);
    assert.equal(isVoidWorthy(gap, zoomedOut, vh), false);
    const open = layoutOf([marker('a', NOW + gap), marker('b', NOW)], { scale: 0.05 });
    const between = open.segments.filter(
      (s) => s.fromKind !== 'pad' && s.toKind !== 'pad'
    );
    assert.ok(between.every((s) => s.kind === 'linear'));
  });

  it('keeps a longer gap visually longer than a shorter one when zoomed in', () => {
    const scale = 8;
    const far = NOW + 80 * DAY_MS;
    const five = layoutOf(
      [marker('a', far), marker('b', far - 5 * DAY_MS)],
      { scale }
    );
    const forty = layoutOf(
      [marker('a', far), marker('b', far - 40 * DAY_MS)],
      { scale }
    );
    const fiveGap = Math.abs(five.markers[0].y - five.markers[1].y);
    const fortyGap = Math.abs(forty.markers[0].y - forty.markers[1].y);
    assert.ok(fortyGap > fiveGap, '40 days must not look shorter than 5 days');
  });

  it('grows compressed voids with scale so zoom stays proportional', () => {
    const tenYears = 10 * 365 * DAY_MS;
    const markers = [marker('a', NOW + DAY_MS), marker('b', NOW + DAY_MS - tenYears)];
    const at1 = layoutOf(markers, { scale: 1 });
    const at8 = layoutOf(markers, { scale: 8 });
    const void1 = at1.segments.find((s) => s.kind === 'void');
    const void8 = at8.segments.find((s) => s.kind === 'void');
    assert.ok(void1 && void8);
    assert.ok(void8.y1 - void8.y0 > (void1.y1 - void1.y0) * 4);
  });

  it('clusters two equal instants into one stem with two ids', () => {
    const t = NOW + DAY_MS;
    const clusters = clusterMarkers([marker('a', t, 'Alpha'), marker('b', t, 'Beta')]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].members.length, 2);
    const ids = clusters[0].members.map((m) => m.id).sort();
    assert.deepEqual(ids, ['a', 'b']);
    const layout = layoutOf([marker('a', t, 'Alpha'), marker('b', t, 'Beta')]);
    assert.equal(layout.markers.length, 1);
    assert.equal(layout.markers[0].members.length, 2);
  });

  it('clusters nearby distinct instants that would overlap at the current scale', () => {
    const a = NOW + 2 * DAY_MS;
    const b = a - 2 * HOUR_MS;
    const px = pxPerMsFromScale(1);
    assert.ok(2 * HOUR_MS * px < MIN_MARKER_GAP_PX);
    const clusters = clusterMarkers([marker('a', a, 'Alpha'), marker('b', b, 'Beta')], {
      pxPerMs: px,
      nowMs: NOW,
    });
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].members.length, 2);
    const layout = layoutOf([marker('a', a, 'Alpha'), marker('b', b, 'Beta')]);
    assert.equal(layout.markers.length, 1);
  });

  it('splits a proximity cluster when zoomed in enough for labels to fit', () => {
    const a = NOW + 2 * DAY_MS;
    const b = a - 2 * HOUR_MS;
    const zoomed = 24;
    const px = pxPerMsFromScale(zoomed);
    assert.ok(2 * HOUR_MS * px >= estimatedMarkerHeightPx(1));
    const clusters = clusterMarkers([marker('a', a, 'Alpha'), marker('b', b, 'Beta')], {
      pxPerMs: px,
      nowMs: NOW,
    });
    assert.equal(clusters.length, 2);
    const layout = layoutOf([marker('a', a, 'Alpha'), marker('b', b, 'Beta')], { scale: zoomed });
    assert.equal(layout.markers.length, 2);
    const gap = Math.abs(layout.markers[0].y - layout.markers[1].y);
    assert.ok(gap >= MIN_MARKER_GAP_PX);
  });

  it('does not merge past and future events across now', () => {
    const clusters = clusterMarkers(
      [marker('f', NOW + HOUR_MS, 'Soon'), marker('p', NOW - HOUR_MS, 'Ago')],
      { pxPerMs: pxPerMsFromScale(1), nowMs: NOW }
    );
    assert.equal(clusters.length, 2);
  });

  it('keeps a near-now event far enough from Now that labels can sit apart', () => {
    const layout = layoutOf([marker('soon', NOW + HOUR_MS, 'Soon')]);
    const soon = layout.markers.find((m) => m.members[0].id === 'soon');
    assert.ok(soon && layout.now);
    assert.ok(Math.abs(soon.y - layout.now.y) >= 72);
  });

  it('does not stretch a far event just because Now is a neighbour', () => {
    const five = 5 * DAY_MS;
    const layout = layoutOf([marker('f', NOW + five, 'Later')]);
    const f = layout.markers.find((m) => m.members[0].id === 'f');
    const expected = five * pxPerMsFromScale(1);
    assert.ok(Math.abs(Math.abs(f.y - layout.now.y) - expected) < 1);
  });

  it('queryWindow returns only items in range plus overscan contract', () => {
    const layout = layoutOf([
      marker('f', NOW + 3 * DAY_MS),
      marker('p', NOW - 3 * DAY_MS),
    ]);
    const band = queryWindow(layout, layout.now.y - 10, layout.now.y + 10, 0);
    assert.ok(band.now);
    assert.ok(band.markers.length <= 2);
    const all = queryWindow(layout, 0, layout.height, 0);
    assert.equal(all.markers.length, layout.markers.length);
  });

  it('removing a middle event can collapse two linear spans into a void', () => {
    const a = NOW + 41 * DAY_MS;
    const b = NOW + 21 * DAY_MS;
    const c = NOW + DAY_MS;
    const three = layoutOf([marker('a', a), marker('b', b), marker('c', c)]);
    const two = layoutOf([marker('a', a), marker('c', c)]);
    const gapThree = Math.abs(
      three.markers.find((m) => m.members[0].id === 'a').y -
        three.markers.find((m) => m.members[0].id === 'c').y
    );
    const gapTwo = Math.abs(
      two.markers.find((m) => m.members[0].id === 'a').y -
        two.markers.find((m) => m.members[0].id === 'c').y
    );
    assert.ok(gapThree > gapTwo + 50, 'linear A–B–C should be taller than void A–C');
    assert.ok(two.segments.some((s) => s.kind === 'void'));
  });

  it('timeToY / yToTime stay consistent on linear segments', () => {
    const t = NOW + 3 * DAY_MS;
    const layout = layoutOf([marker('f', t), marker('p', NOW - 3 * DAY_MS)]);
    const y = timeToY(layout, t);
    const back = yToTime(layout, y);
    assert.ok(Math.abs(back - t) < 1000);
  });

  it('recurring view-model produces a single marker at primary.targetMs', () => {
    const event = {
      id: 'rec',
      name: 'Weekly',
      date: '2026-01-05',
      time: '09:00',
      timeZone: 'UTC',
      color: '#3cf0ff',
      units: ['days', 'hours', 'minutes'],
      recurrence: { frequency: 'weekly' },
    };
    const vm = toViewModel(event, NOW);
    assert.ok(Number.isFinite(vm.primary?.targetMs));
    const layout = layoutOf([
      marker('rec', vm.primary.targetMs, 'Weekly'),
    ]);
    assert.equal(layout.markers.length, 1);
    assert.equal(layout.markers[0].instant, vm.primary.targetMs);
  });

  it('clampScale keeps scale within min/max', () => {
    const c = clampScale(9999, { spanMs: 365 * DAY_MS, viewportHeight: 400, pxPerDay: DEFAULT_PX_PER_DAY });
    const d = clampScale(0.0001, { spanMs: 365 * DAY_MS, viewportHeight: 400, pxPerDay: DEFAULT_PX_PER_DAY });
    assert.ok(c <= 64);
    assert.ok(d >= 0.02);
    assert.ok(c >= d);
  });

  it('void-worthy matches 21-day and two-viewport rule', () => {
    const vh = 400;
    const px = pxPerMsFromScale(1);
    assert.equal(isVoidWorthy(VOID_MIN_MS, px, vh), false);
    const long = 40 * DAY_MS;
    assert.equal(isVoidWorthy(long, px, vh), long * px > 2 * vh);
  });

  it('default nearby spacing uses DEFAULT_PX_PER_DAY', () => {
    assert.equal(pxPerMsFromScale(1) * DAY_MS, DEFAULT_PX_PER_DAY);
  });

  it('marks a new year on a linear span that crosses 1 January', () => {
    const layout = layoutOf([
      marker('a', Date.UTC(2026, 11, 22, 12, 0, 0)),
      marker('b', Date.UTC(2027, 0, 10, 12, 0, 0)),
    ]);
    const years = layout.ticks.filter((t) => t.kind === 'year');
    assert.ok(years.some((t) => t.year === 2027));
  });

  it('marks month starts on a linear span that crosses a month', () => {
    const layout = layoutOf([
      marker('a', Date.UTC(2026, 2, 25, 12, 0, 0)),
      marker('b', Date.UTC(2026, 3, 10, 12, 0, 0)),
    ]);
    const months = layout.ticks.filter((t) => t.kind === 'month');
    assert.ok(months.some((t) => t.month === 4 && t.year === 2026));
    assert.ok(layout.ticks.every((t) => t.kind !== 'year' || t.month === 1));
  });

  it('omits month ticks when a month is too short on screen', () => {
    const layout = layoutOf(
      [marker('a', Date.UTC(2026, 2, 1)), marker('b', Date.UTC(2026, 5, 1))],
      { scale: 0.02, viewportHeight: 400 }
    );
    assert.ok(layout.ticks.every((t) => t.kind !== 'month'));
  });
});
