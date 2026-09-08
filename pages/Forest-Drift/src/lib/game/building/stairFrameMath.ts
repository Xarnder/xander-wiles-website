import type { StairMetrics } from './stairMath';

/**
 * Pure layout for a staircase's timber framing — framework-free so box positions are unit-testable
 * without Three.js. Canonical stair space matches StairGeometryBuilder / stairMath: run along +X
 * (0 = bottom), width along +Z, rise along +Y. The builder remaps these boxes the same way the
 * stair solid is remapped, so the frame can never drift from the steps.
 *
 * All of this is decorative. Side-collision strips and tread rects stay exactly as stairMath
 * already computes them.
 */

export interface StairFrameSettings {
	stairFrameEnabled: boolean;
	stairFrameWidth: number;
	stairFrameDepthExtra: number;
}

/** Axis-aligned box in canonical stair space. `pitch` rotates in the run-rise plane (around +width). */
export interface CanonicalStairBox {
	minRun: number;
	maxRun: number;
	minRise: number;
	maxRise: number;
	minWidth: number;
	maxWidth: number;
	/** Radians, applied around the box centre before the canonical→local remap. */
	pitch?: number;
	role?: 'frame' | 'rail';
}

const MIN_SIZE = 0.005;
/** How far a tread nosing sits above the walkable tread — keeps it from sharing the solid's top plane. */
export const STAIR_NOSING_LIFT = 0.003;
/**
 * How far last-step / back-top timber sits inside the last tread's walkable plane and back face.
 * Those boards overlap the solid on purpose; without this they share the step's own faces and flicker.
 */
export const STAIR_FRAME_FACE_INSET = 0.003;
/** How far a newel continues above the top tread so it reads as meeting the landing / ceiling hole. */
export const STAIR_TOP_NEWEL_OVERSHOOT = 0.85;
/** Handrail height above the walking surface — typical domestic rise, kept inside the stair width. */
export const STAIR_RAIL_HEIGHT = 0.9;
/** How far the railing sits in from each width face so it cannot pass through an adjacent wall. */
export const STAIR_RAIL_INSET = 0.04;

function box(
	minRun: number,
	maxRun: number,
	minRise: number,
	maxRise: number,
	minWidth: number,
	maxWidth: number,
	extra?: Pick<CanonicalStairBox, 'pitch' | 'role'>
): CanonicalStairBox | null {
	if (maxRun - minRun < MIN_SIZE || maxRise - minRise < MIN_SIZE || maxWidth - minWidth < MIN_SIZE) {
		return null;
	}
	return { minRun, maxRun, minRise, maxRise, minWidth, maxWidth, ...extra };
}

function push(boxes: CanonicalStairBox[], piece: CanonicalStairBox | null): void {
	if (piece) boxes.push(piece);
}

function slopedRail(
	run0: number,
	rise0: number,
	run1: number,
	rise1: number,
	minWidth: number,
	maxWidth: number,
	thickness: number
): CanonicalStairBox | null {
	const length = Math.hypot(run1 - run0, rise1 - rise0);
	if (length < MIN_SIZE || thickness < MIN_SIZE) return null;
	const cx = (run0 + run1) / 2;
	const cy = (rise0 + rise1) / 2;
	return box(
		cx - length / 2,
		cx + length / 2,
		cy - thickness / 2,
		cy + thickness / 2,
		minWidth,
		maxWidth,
		{ pitch: Math.atan2(rise1 - rise0, run1 - run0), role: 'rail' }
	);
}

function railBands(
	widthMeters: number,
	frameWidth: number
): { minWidth: number; maxWidth: number }[] {
	const thickness = Math.min(Math.max(frameWidth * 0.45, 0.04), 0.07);
	const inset = Math.min(STAIR_RAIL_INSET, widthMeters * 0.2);
	const left = { minWidth: inset, maxWidth: inset + thickness };
	const right = { minWidth: widthMeters - inset - thickness, maxWidth: widthMeters - inset };
	if (left.maxWidth >= right.minWidth - MIN_SIZE) return [];
	return [left, right];
}

/**
 * Sawtooth stringers on both sides, a picture-frame on the back vertical face, a nosing on every
 * tread, newel posts at the four footprint corners, and an inner railing on both width edges.
 *
 * Side and back boards sit mostly on the stair solid. Last-step and back-top timber is pulled
 * `STAIR_FRAME_FACE_INSET` inside the last tread so it cannot share that step's own faces.
 * Only `stairFrameDepthExtra` may pass a width face or the back (`runMeters`) — so stairs against a
 * wall do not punch timber through it.
 * Railings stay strictly inside `0..widthMeters` so they cannot poke out the far side of a wall.
 * Returns `[]` when framing is disabled or the stair is degenerate.
 */
export function computeStairFrameBoxes(
	metrics: Pick<StairMetrics, 'stepCount' | 'stepRise' | 'stepRun' | 'widthMeters' | 'runMeters' | 'totalRise'>,
	settings: StairFrameSettings
): CanonicalStairBox[] {
	if (!settings.stairFrameEnabled) return [];
	const { stepCount, stepRise, stepRun, widthMeters, runMeters, totalRise } = metrics;
	const width = Math.max(0, settings.stairFrameWidth);
	const extra = Math.max(0, settings.stairFrameDepthExtra);
	if (stepCount <= 0 || widthMeters <= 0 || runMeters <= 0 || width < MIN_SIZE) return [];

	const boxes: CanonicalStairBox[] = [];
	const inset = Math.min(width, widthMeters * 0.45);
	const leftOuter = -extra;
	const leftInner = inset;
	const rightInner = widthMeters - inset;
	const rightOuter = widthMeters + extra;
	const backInner = runMeters - width;
	const backOuter = runMeters + extra;
	const sides = [
		[leftOuter, leftInner],
		[rightInner, rightOuter]
	] as const;

	const lastTreadCap = totalRise - STAIR_FRAME_FACE_INSET;

	for (let i = 0; i < stepCount; i++) {
		const run0 = i * stepRun;
		const run1 = (i + 1) * stepRun;
		const rise0 = i * stepRise;
		const rise1 = (i + 1) * stepRise;
		const isLast = i === stepCount - 1;
		const treadCap = isLast ? lastTreadCap : rise1;
		const runCap = isLast ? run1 - STAIR_FRAME_FACE_INSET : run1;

		for (const [minW, maxW] of sides) {
			push(boxes, box(run0, runCap, rise1 - width, treadCap, minW, maxW));
			push(boxes, box(run0, run0 + width, rise0, treadCap, minW, maxW));
		}

		push(
			boxes,
			box(
				run0 - extra,
				run0 + width * 0.35,
				rise1 - width * 0.4,
				rise1 + STAIR_NOSING_LIFT,
				0,
				widthMeters
			)
		);
	}

	for (const [minW, maxW] of sides) {
		push(boxes, box(backInner, backOuter, 0, lastTreadCap, minW, maxW));
	}
	push(boxes, box(backInner, backOuter, 0, width, leftInner, rightInner));
	push(boxes, box(backInner, backOuter, totalRise - width, lastTreadCap, leftInner, rightInner));

	const newelHeight = Math.min(0.9, Math.max(0.45, totalRise * 0.35 + 0.35));
	for (const w0 of [leftOuter, rightOuter - width]) {
		const w1 = w0 + width;
		push(boxes, box(-extra, -extra + width, 0, newelHeight, w0, w1));
		push(
			boxes,
			box(
				runMeters - width + extra,
				runMeters + extra,
				totalRise - width,
				totalRise + STAIR_TOP_NEWEL_OVERSHOOT,
				w0,
				w1
			)
		);
	}

	pushRailings(boxes, metrics, width);

	return boxes;
}

function pushRailings(
	boxes: CanonicalStairBox[],
	metrics: Pick<StairMetrics, 'stepCount' | 'stepRise' | 'stepRun' | 'widthMeters' | 'runMeters' | 'totalRise'>,
	frameWidth: number
): void {
	const { stepCount, stepRise, stepRun, widthMeters, runMeters, totalRise } = metrics;
	const bands = railBands(widthMeters, frameWidth);
	if (bands.length === 0) return;

	const railH = STAIR_RAIL_HEIGHT;
	const post = Math.min(frameWidth, runMeters * 0.2);
	const railThickness = bands[0].maxWidth - bands[0].minWidth;
	const run0 = post;
	const run1 = runMeters - post;
	if (run1 - run0 < MIN_SIZE) return;

	for (const band of bands) {
		push(boxes, box(0, post, 0, railH + railThickness, band.minWidth, band.maxWidth, { role: 'rail' }));
		push(
			boxes,
			box(
				runMeters - post,
				runMeters,
				totalRise - STAIR_FRAME_FACE_INSET,
				totalRise + railH + railThickness,
				band.minWidth,
				band.maxWidth,
				{ role: 'rail' }
			)
		);
		push(boxes, slopedRail(run0, railH, run1, totalRise + railH, band.minWidth, band.maxWidth, railThickness));

		for (let i = 0; i < stepCount; i++) {
			const runC = (i + 0.5) * stepRun;
			if (runC <= run0 || runC >= run1) continue;
			const treadY = (i + 1) * stepRise;
			const balusterStart = i === stepCount - 1 ? treadY - STAIR_FRAME_FACE_INSET : treadY;
			const railY = railH + (runC / runMeters) * totalRise - railThickness * 0.5;
			const balW = Math.min(railThickness * 0.7, post * 0.5);
			push(
				boxes,
				box(
					runC - balW / 2,
					runC + balW / 2,
					balusterStart,
					railY,
					band.minWidth,
					band.maxWidth,
					{ role: 'rail' }
				)
			);
		}
	}
}
