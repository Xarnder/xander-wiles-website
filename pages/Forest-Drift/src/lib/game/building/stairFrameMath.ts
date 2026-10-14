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
	/**
	 * Solid footing below the first tread (outside stairs on uneven ground, see
	 * `stairFootingDepth`). Every timber piece that starts at the stair's base — the bottom riser
	 * boards, back posts and back bottom rail — extends down by this so
	 * the framing reaches the ground with the stone. Default 0.
	 */
	footingDepth?: number;
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
 * How far step caps, last-step timber, and back-top timber sit inside the stair solid's own faces.
 * Those boards overlap the solid on purpose; without this they share the step's planes and flicker.
 */
export const STAIR_FRAME_FACE_INSET = 0.003;
function box(
	minRun: number,
	maxRun: number,
	minRise: number,
	maxRise: number,
	minWidth: number,
	maxWidth: number,
	extra?: Pick<CanonicalStairBox, 'pitch' | 'role'>
): CanonicalStairBox | null {
	if (
		maxRun - minRun < MIN_SIZE ||
		maxRise - minRise < MIN_SIZE ||
		maxWidth - minWidth < MIN_SIZE
	) {
		return null;
	}
	return { minRun, maxRun, minRise, maxRise, minWidth, maxWidth, ...extra };
}

function push(boxes: CanonicalStairBox[], piece: CanonicalStairBox | null): void {
	if (piece) boxes.push(piece);
}

/**
 * Sawtooth stringers on both sides, a picture-frame on the back vertical face and a nosing on every
 * tread. Railings and newels are not here: they are fences (`stairRailingMath.ts`), built in the
 * Fence / Railing style.
 *
 * Side boards sit mostly on the stair solid, but every step's tread and riser caps are pulled
 * `STAIR_FRAME_FACE_INSET` inside those faces so they cannot share the step's own planes (which
 * flickers — cream step vs timber). Nosings sit above the tread and in front of the riser, never
 * through it, and are inset from the width faces for the same reason.
 * Only `stairFrameDepthExtra` may pass a width face or the back (`runMeters`) — so stairs against a
 * wall do not punch timber through it.
 * Returns `[]` when framing is disabled, or the stair is degenerate.
 */
export function computeStairFrameBoxes(
	metrics: Pick<
		StairMetrics,
		'stepCount' | 'stepRise' | 'stepRun' | 'widthMeters' | 'runMeters' | 'totalRise'
	>,
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

	const face = STAIR_FRAME_FACE_INSET;
	const lastTreadCap = totalRise - face;
	// Where base-level timber starts: the stair's base, or the bottom of its footing.
	const footing = Math.max(0, settings.footingDepth ?? 0);
	const ground = -footing;
	const nosingThick = Math.min(Math.max(width * 0.2, 0.018), 0.03);

	for (let i = 0; i < stepCount; i++) {
		const run0 = i * stepRun;
		const run1 = (i + 1) * stepRun;
		const rise0 = i * stepRise;
		const rise1 = (i + 1) * stepRise;
		const treadCap = rise1 - face;
		const runCap = run1 - face;
		const runFront = run0 + face;
		const riseFloor = rise0 + face;

		for (const [minW, maxW] of sides) {
			push(boxes, box(runFront, runCap, rise1 - width, treadCap, minW, maxW));
			const riserBottom = i === 0 && footing > 0 ? ground : riseFloor;
			push(boxes, box(runFront, run0 + width, riserBottom, rise1 - width - face, minW, maxW));
		}

		const lipBottom = rise1 + STAIR_NOSING_LIFT;
		const nosingTop = lipBottom + nosingThick;
		push(boxes, box(run0, run0 + width * 0.35, lipBottom, nosingTop, face, widthMeters - face));
		push(
			boxes,
			box(run0 - extra, run0 - face, rise1 - width * 0.4, nosingTop, face, widthMeters - face)
		);
	}

	for (const [minW, maxW] of sides) {
		push(boxes, box(backInner, backOuter, ground, lastTreadCap, minW, maxW));
	}
	push(boxes, box(backInner, backOuter, ground, ground + width, leftInner, rightInner));
	push(boxes, box(backInner, backOuter, totalRise - width, lastTreadCap, leftInner, rightInner));

	return boxes;
}
