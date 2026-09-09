import { describe, expect, it } from 'vitest';
import { computeStairMetrics } from '../stairMath';
import {
	computeStairFrameBoxes,
	STAIR_FRAME_FACE_INSET,
	STAIR_NOSING_LIFT,
	STAIR_RAIL_HEIGHT,
	STAIR_RAIL_INSET,
	STAIR_TOP_NEWEL_OVERSHOOT
} from '../stairFrameMath';

const SETTINGS = {
	stairFrameEnabled: true,
	stairRailingsEnabled: true,
	stairFrameWidth: 0.12,
	stairFrameDepthExtra: 0.05
};

function metrics() {
	return computeStairMetrics({
		minGridX: 0,
		maxGridX: 12,
		minGridZ: 0,
		maxGridZ: 4,
		direction: '+x',
		gridSizeAtCreation: 0.25,
		baseY: 0
	});
}

describe('computeStairFrameBoxes', () => {
	it('returns nothing when framing and railings are both disabled', () => {
		expect(
			computeStairFrameBoxes(metrics(), {
				...SETTINGS,
				stairFrameEnabled: false,
				stairRailingsEnabled: false
			})
		).toEqual([]);
	});

	it('keeps railings and newels when framing is off', () => {
		const m = metrics();
		const boxes = computeStairFrameBoxes(m, { ...SETTINGS, stairFrameEnabled: false });
		expect(boxes.length).toBeGreaterThan(0);
		expect(boxes.some((b) => b.role === 'rail')).toBe(true);
		const isPost = (b: (typeof boxes)[number]) =>
			Math.abs(b.maxRun - b.minRun - SETTINGS.stairFrameWidth) < 1e-6 &&
			Math.abs(b.maxWidth - b.minWidth - SETTINGS.stairFrameWidth) < 1e-6;
		expect(boxes.filter((b) => isPost(b) && b.minRise === 0)).toHaveLength(2);
	});

	it('drops railings and newels when they are disabled', () => {
		const m = metrics();
		const boxes = computeStairFrameBoxes(m, { ...SETTINGS, stairRailingsEnabled: false });
		expect(boxes.filter((b) => b.role === 'rail')).toEqual([]);
		const isPost = (b: (typeof boxes)[number]) =>
			Math.abs(b.maxRun - b.minRun - SETTINGS.stairFrameWidth) < 1e-6 &&
			Math.abs(b.maxWidth - b.minWidth - SETTINGS.stairFrameWidth) < 1e-6;
		expect(boxes.filter((b) => isPost(b))).toEqual([]);
		expect(boxes.length).toBeGreaterThan(0);
	});

	it('keeps every board within depth-extra of the stair faces, overlapping the solid instead of hanging outside', () => {
		const m = metrics();
		const boxes = computeStairFrameBoxes(m, SETTINGS);
		const extra = SETTINGS.stairFrameDepthExtra;
		const axisAligned = boxes.filter((b) => !b.pitch);
		expect(boxes.length).toBeGreaterThan(0);
		expect(boxes.every((b) => b.minWidth >= -extra - 1e-9)).toBe(true);
		expect(boxes.every((b) => b.maxWidth <= m.widthMeters + extra + 1e-9)).toBe(true);
		expect(axisAligned.every((b) => b.maxRun <= m.runMeters + extra + 1e-9)).toBe(true);

		const left = boxes.filter((b) => b.maxWidth <= SETTINGS.stairFrameWidth + extra + 1e-6);
		const right = boxes.filter(
			(b) => b.minWidth >= m.widthMeters - SETTINGS.stairFrameWidth - extra - 1e-6
		);
		expect(left.length).toBeGreaterThan(0);
		expect(right.length).toBeGreaterThan(0);
		expect(left.some((b) => b.minWidth < 0 && b.maxWidth > 0)).toBe(true);
		expect(right.some((b) => b.minWidth < m.widthMeters && b.maxWidth > m.widthMeters)).toBe(true);
	});

	it('frames the back vertical face with full-height side posts and top/bottom rails', () => {
		const m = metrics();
		const boxes = computeStairFrameBoxes(m, SETTINGS);
		const extra = SETTINGS.stairFrameDepthExtra;
		const onBack = (b: (typeof boxes)[number]) =>
			b.maxRun >= m.runMeters + extra - 1e-6 &&
			b.minRun >= m.runMeters - SETTINGS.stairFrameWidth - 1e-6;
		const back = boxes.filter(onBack);
		const lastCap = m.totalRise - STAIR_FRAME_FACE_INSET;
		const posts = back.filter((b) => b.minRise <= 1e-6 && b.maxRise >= lastCap - 1e-6);
		const bottomRail = back.find(
			(b) =>
				b.minRise <= 1e-6 &&
				Math.abs(b.maxRise - SETTINGS.stairFrameWidth) < 1e-6 &&
				b.minWidth > 0 &&
				b.maxWidth < m.widthMeters
		);
		const topRail = back.find(
			(b) =>
				Math.abs(b.minRise - (m.totalRise - SETTINGS.stairFrameWidth)) < 1e-6 &&
				Math.abs(b.maxRise - lastCap) < 1e-6 &&
				b.minWidth > 0 &&
				b.maxWidth < m.widthMeters
		);
		expect(posts.length).toBeGreaterThanOrEqual(2);
		expect(bottomRail).toBeDefined();
		expect(topRail).toBeDefined();
	});

	it('pulls last-step and back-top timber off the last tread so they do not share its faces', () => {
		const m = metrics();
		const boxes = computeStairFrameBoxes(m, SETTINGS);
		const lastRun0 = (m.stepCount - 1) * m.stepRun;
		const lastCap = m.totalRise - STAIR_FRAME_FACE_INSET;
		const overlapsLastTread = (b: (typeof boxes)[number]) =>
			b.minRun < m.runMeters - 1e-9 &&
			b.maxRun > lastRun0 + 1e-9 &&
			b.minWidth < m.widthMeters - 1e-9 &&
			b.maxWidth > 1e-9;

		const onLastTreadPlane = boxes.filter(
			(b) =>
				b.role !== 'rail' &&
				overlapsLastTread(b) &&
				b.maxRise <= m.totalRise + 1e-9 &&
				Math.abs(b.maxRise - m.totalRise) < 1e-9
		);
		const onLastBackFace = boxes.filter(
			(b) =>
				b.role !== 'rail' &&
				b.maxRise <= m.totalRise + 1e-9 &&
				Math.abs(b.maxRun - m.runMeters) < 1e-9
		);

		expect(onLastTreadPlane).toEqual([]);
		expect(onLastBackFace).toEqual([]);
		expect(
			boxes.filter((b) => overlapsLastTread(b) && Math.abs(b.minRise - m.totalRise) < 1e-9)
		).toEqual([]);
		expect(
			boxes.some(
				(b) => b.role !== 'rail' && overlapsLastTread(b) && Math.abs(b.maxRise - lastCap) < 1e-9
			)
		).toBe(true);
	});

	it('keeps every step end-cap off that step’s tread and riser faces', () => {
		const m = metrics();
		const boxes = computeStairFrameBoxes(m, SETTINGS);
		const sideCaps = boxes.filter(
			(b) => b.role !== 'rail' && (b.minWidth < -1e-9 || b.maxWidth > m.widthMeters + 1e-9)
		);
		expect(sideCaps.length).toBeGreaterThan(0);
		for (let i = 0; i < m.stepCount; i++) {
			const treadY = (i + 1) * m.stepRise;
			const riser = i * m.stepRun;
			expect(sideCaps.filter((b) => Math.abs(b.maxRise - treadY) < 1e-9)).toEqual([]);
			expect(sideCaps.filter((b) => Math.abs(b.minRun - riser) < 1e-9)).toEqual([]);
		}
	});

	it('puts a nosing on every tread, slightly above the walkable surface', () => {
		const m = metrics();
		const boxes = computeStairFrameBoxes(m, SETTINGS);
		for (let i = 0; i < m.stepCount; i++) {
			const treadY = (i + 1) * m.stepRise;
			const riser = i * m.stepRun;
			const nosing = boxes.find(
				(b) =>
					b.role !== 'rail' &&
					b.minRise >= treadY + STAIR_NOSING_LIFT - 1e-9 &&
					b.minRun <= riser + 1e-9 &&
					b.maxRun > riser + 1e-9 &&
					b.maxRise > treadY + STAIR_NOSING_LIFT + 1e-9
			);
			expect(nosing).toBeDefined();
			expect(nosing!.minWidth).toBeGreaterThan(0);
			expect(nosing!.maxWidth).toBeLessThan(m.widthMeters);
		}
	});

	it('puts a railing on both inside width edges, never past the stair sides', () => {
		const m = metrics();
		const boxes = computeStairFrameBoxes(m, SETTINGS);
		const rails = boxes.filter((b) => b.role === 'rail');
		expect(rails.length).toBeGreaterThan(0);
		expect(rails.every((b) => b.minWidth >= 0 && b.maxWidth <= m.widthMeters)).toBe(true);
		expect(rails.every((b) => b.minWidth >= STAIR_RAIL_INSET - 1e-9)).toBe(true);
		expect(rails.every((b) => b.maxWidth <= m.widthMeters - STAIR_RAIL_INSET + 1e-9)).toBe(true);

		const left = rails.filter((b) => b.maxWidth < m.widthMeters * 0.5);
		const right = rails.filter((b) => b.minWidth > m.widthMeters * 0.5);
		expect(left.length).toBeGreaterThan(0);
		expect(right.length).toBeGreaterThan(0);
		const slopedLeft = left.find((b) => (b.pitch ?? 0) > 0);
		const slopedRight = right.find((b) => (b.pitch ?? 0) > 0);
		expect(slopedLeft).toBeDefined();
		expect(slopedRight).toBeDefined();
		const railTop = (rail: NonNullable<typeof slopedLeft>) =>
			(rail.minRise + rail.maxRise) / 2 +
			((rail.maxRun - rail.minRun) / 2) * Math.sin(rail.pitch ?? 0);
		expect(railTop(slopedLeft!)).toBeCloseTo(m.totalRise + STAIR_RAIL_HEIGHT, 2);
		expect(railTop(slopedRight!)).toBeCloseTo(m.totalRise + STAIR_RAIL_HEIGHT, 2);
		expect(left.some((b) => b.minRise === 0 && b.maxRise >= STAIR_RAIL_HEIGHT)).toBe(true);
	});

	it('places newel posts at the bottom and above the top tread', () => {
		const m = metrics();
		const boxes = computeStairFrameBoxes(m, SETTINGS);
		const isPost = (b: (typeof boxes)[number]) =>
			Math.abs(b.maxRun - b.minRun - SETTINGS.stairFrameWidth) < 1e-6 &&
			Math.abs(b.maxWidth - b.minWidth - SETTINGS.stairFrameWidth) < 1e-6;
		const bottom = boxes.filter((b) => isPost(b) && b.minRise === 0);
		const top = boxes.filter((b) => isPost(b) && b.maxRise > m.totalRise);
		expect(bottom).toHaveLength(2);
		expect(top).toHaveLength(2);
		expect(top.every((b) => b.maxRise >= m.totalRise + STAIR_TOP_NEWEL_OVERSHOOT - 1e-6)).toBe(
			true
		);
	});
});
