/**
 * Pure procedural-sizing math for window/door visual inserts — framework- and Three.js-free, same
 * rule as every other `*Math.ts` file in this project (roofMath.ts, wallGeometryMath.ts, ...), kept
 * separate from `OpeningVisualBuilder.ts` (the Three.js-touching layer) so every dimension here is
 * directly unit-testable without a renderer.
 *
 * Everything below is expressed in the SAME wall-local (U, Y) coordinate system
 * `WallOpeningDefinition` itself already uses — U runs along the wall from its start (U=0), Y is
 * vertical from the wall's own base (Y=0). A rect returned here can be placed directly at those
 * absolute U/Y coordinates by the caller, exactly like `wallGeometryMath.computeSolidWallSegments`'s
 * own solid segments already are — no separate "frame-local" coordinate space to keep in sync.
 */

export interface UvRect {
	minU: number;
	maxU: number;
	minY: number;
	maxY: number;
}

const MIN_DIMENSION = 0.005;
const DEFAULT_MAX_FRAME_WIDTH_FRACTION = 0.15;
const MIN_FRAME_DEPTH = 0.01;

/** `min(configured, wallThickness)`, floored at a small positive minimum so a frame never has literally zero depth (a degenerate, invisible-from-the-side plane) even on the thinnest configurable wall. */
export function clampFrameDepth(configuredFrameDepth: number, wallThickness: number): number {
	return Math.max(MIN_FRAME_DEPTH, Math.min(configuredFrameDepth, wallThickness));
}

/**
 * The adaptive frame-width rule: the configured value is the PREFERRED size, but a small opening
 * scales it down so the frame never eats more than `maxFrameWidthFraction` of either dimension —
 * see the README's "Openings" section (added alongside this feature) for the reasoning. Because
 * `maxFrameWidthFraction` defaults well under 0.5, `2 * actualFrameWidth` is always comfortably
 * smaller than both `width` and `height`, which is what guarantees the interior (glass pane / door
 * leaf) never comes out zero-or-negative-sized without any extra clamping.
 */
export function clampFrameWidth(
	configuredFrameWidth: number,
	openingWidth: number,
	openingHeight: number,
	maxFrameWidthFraction = DEFAULT_MAX_FRAME_WIDTH_FRACTION
): number {
	return Math.max(
		MIN_DIMENSION,
		Math.min(
			configuredFrameWidth,
			openingWidth * maxFrameWidthFraction,
			openingHeight * maxFrameWidthFraction
		)
	);
}

export interface WindowFrameLayout {
	/** The frame piece width actually used, after adaptive clamping — see `clampFrameWidth`. */
	frameWidth: number;
	frameDepth: number;
	left: UvRect;
	right: UvRect;
	top: UvRect;
	bottom: UvRect;
	/** The interior glazing rect — the frame's own inner edge, never wider/taller than the opening minus two frame widths. */
	glass: UvRect;
}

/**
 * Four-piece window frame layout (see the README's ASCII diagram) — left/right run the opening's
 * FULL height, top/bottom span only the gap between them, exactly the pseudocode the feature spec
 * calls for. Every returned rect is a sub-rect of `[minU,maxU] x [minY,maxY]` by construction, so
 * "frame pieces stay within the opening bounds" holds without a separate assertion.
 */
export function computeWindowFrameLayout(
	opening: UvRect,
	configuredFrameWidth: number,
	configuredFrameDepth: number,
	wallThickness: number,
	maxFrameWidthFraction = DEFAULT_MAX_FRAME_WIDTH_FRACTION
): WindowFrameLayout {
	const width = opening.maxU - opening.minU;
	const height = opening.maxY - opening.minY;
	const frameWidth = clampFrameWidth(configuredFrameWidth, width, height, maxFrameWidthFraction);
	const frameDepth = clampFrameDepth(configuredFrameDepth, wallThickness);

	return {
		frameWidth,
		frameDepth,
		left: {
			minU: opening.minU,
			maxU: opening.minU + frameWidth,
			minY: opening.minY,
			maxY: opening.maxY
		},
		right: {
			minU: opening.maxU - frameWidth,
			maxU: opening.maxU,
			minY: opening.minY,
			maxY: opening.maxY
		},
		top: {
			minU: opening.minU + frameWidth,
			maxU: opening.maxU - frameWidth,
			minY: opening.maxY - frameWidth,
			maxY: opening.maxY
		},
		bottom: {
			minU: opening.minU + frameWidth,
			maxU: opening.maxU - frameWidth,
			minY: opening.minY,
			maxY: opening.minY + frameWidth
		},
		glass: {
			minU: opening.minU + frameWidth,
			maxU: opening.maxU - frameWidth,
			minY: opening.minY + frameWidth,
			maxY: opening.maxY - frameWidth
		}
	};
}

export type HingeSide = 'left' | 'right';

/**
 * Deterministic (never `Math.random()`) hinge-side pick from an opening's own stable id — alternates
 * left/right across different doors purely as a bit of visual variety, per the feature spec's
 * explicit "do not use Math.random(), alternate based on opening ID if useful" guidance. A stable
 * multiplicative string hash (not cryptographic, doesn't need to be) so the SAME opening always
 * re-derives the SAME hinge side after a rebuild/reload without storing it anywhere.
 */
export function hingeSideForOpening(openingId: string): HingeSide {
	let hash = 0;
	for (let i = 0; i < openingId.length; i++) {
		hash = (Math.imul(hash, 31) + openingId.charCodeAt(i)) | 0;
	}
	return (hash & 1) === 0 ? 'left' : 'right';
}

export interface DoorFrameLayout {
	frameWidth: number;
	frameDepth: number;
	left: UvRect;
	right: UvRect;
	top: UvRect;
	/** The door leaf's own rect — always sits flush with `minY` (the floor), per the "bottom stays aligned with the floor" requirement; only the top and sides are inset from the jambs. */
	leaf: UvRect;
	hingeSide: HingeSide;
	/** The absolute wall-local U of the leaf's hinge-side edge — later interactive-door code rotates the leaf around exactly this line (see OpeningVisualBuilder's DoorAssembly doc comment). */
	hingeU: number;
}

/**
 * Three-piece door frame layout — left/right jambs plus a top lintel, deliberately NO bottom
 * crosspiece (a doorway's floor must stay open) — see the README's ASCII diagram. The leaf is inset
 * from the jambs/lintel by `clearance` (split evenly left/right, taken only off the top vertically —
 * never the bottom, which stays flush with the floor) so it never intersects the frame.
 */
export function computeDoorFrameLayout(
	opening: UvRect,
	configuredFrameWidth: number,
	configuredFrameDepth: number,
	wallThickness: number,
	clearance: number,
	hingeSide: HingeSide,
	maxFrameWidthFraction = DEFAULT_MAX_FRAME_WIDTH_FRACTION
): DoorFrameLayout {
	const width = opening.maxU - opening.minU;
	const height = opening.maxY - opening.minY;
	const frameWidth = clampFrameWidth(configuredFrameWidth, width, height, maxFrameWidthFraction);
	const frameDepth = clampFrameDepth(configuredFrameDepth, wallThickness);

	const jambInnerMinU = opening.minU + frameWidth;
	const jambInnerMaxU = opening.maxU - frameWidth;
	const lintelInnerMinY = opening.maxY - frameWidth;

	// Never let clearance alone eat the whole inner span — clamp it to at most a small fraction of
	// what's actually available, the same "adaptive, never negative" spirit as clampFrameWidth.
	const innerWidth = Math.max(MIN_DIMENSION, jambInnerMaxU - jambInnerMinU);
	const innerHeight = Math.max(MIN_DIMENSION, lintelInnerMinY - opening.minY);
	const horizontalClearance = Math.max(0, Math.min(clearance, innerWidth * 0.4));
	const verticalClearance = Math.max(0, Math.min(clearance, innerHeight * 0.4));

	const leafMinU = jambInnerMinU + horizontalClearance / 2;
	const leafMaxU = jambInnerMaxU - horizontalClearance / 2;
	const leafMinY = opening.minY;
	const leafMaxY = lintelInnerMinY - verticalClearance;

	const hingeU = hingeSide === 'left' ? leafMinU : leafMaxU;

	return {
		frameWidth,
		frameDepth,
		left: {
			minU: opening.minU,
			maxU: opening.minU + frameWidth,
			minY: opening.minY,
			maxY: opening.maxY
		},
		right: {
			minU: opening.maxU - frameWidth,
			maxU: opening.maxU,
			minY: opening.minY,
			maxY: opening.maxY
		},
		top: {
			minU: jambInnerMinU,
			maxU: jambInnerMaxU,
			minY: lintelInnerMinY,
			maxY: opening.maxY
		},
		leaf: {
			minU: Math.min(leafMinU, leafMaxU),
			maxU: Math.max(leafMinU, leafMaxU),
			minY: leafMinY,
			maxY: Math.max(leafMinY + MIN_DIMENSION, leafMaxY)
		},
		hingeSide,
		hingeU
	};
}
