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
/** Minimum total depth beyond the wall (split on both faces) so a frame always sits proud, never flush or recessed. */
export const FRAME_DEPTH_BEYOND_WALL = 0.08;
/** How far the glass overlaps the inner frame so pane-edge faces sit inside the timber, not on the hole. */
export const WINDOW_GLASS_FRAME_OVERLAP = 0.008;

function expandGlassIntoFrame(hole: UvRect, opening: UvRect, frameWidth: number): UvRect {
	const holeW = hole.maxU - hole.minU;
	const holeH = hole.maxY - hole.minY;
	const overlap = Math.min(
		WINDOW_GLASS_FRAME_OVERLAP,
		Math.max(0, frameWidth * 0.4),
		Math.max(0, holeW * 0.2),
		Math.max(0, holeH * 0.2)
	);
	return {
		minU: Math.max(opening.minU, hole.minU - overlap),
		maxU: Math.min(opening.maxU, hole.maxU + overlap),
		minY: Math.max(opening.minY, hole.minY - overlap),
		maxY: Math.min(opening.maxY, hole.maxY + overlap)
	};
}

/**
 * Window/door frame depth: always thicker than the wall so the frame extrudes past both faces.
 * `configuredFrameDepth` is a preferred TOTAL depth used when it already exceeds `wall + extra`;
 * otherwise the result is `wallThickness + FRAME_DEPTH_BEYOND_WALL`.
 */
export function clampFrameDepth(configuredFrameDepth: number, wallThickness: number): number {
	const wall = Math.max(0, wallThickness);
	const minProud = wall + FRAME_DEPTH_BEYOND_WALL;
	return Math.max(MIN_FRAME_DEPTH, minProud, configuredFrameDepth);
}

/** Depth for insets that must stay inside the wall (glass). Never thicker than the wall itself. */
export function clampInteriorDepth(configuredDepth: number, wallThickness: number): number {
	return Math.max(MIN_FRAME_DEPTH, Math.min(configuredDepth, Math.max(wallThickness, MIN_FRAME_DEPTH)));
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
	/**
	 * Vertical centre bar of the four-pane cross — same timber width as the outer frame, spanning
	 * the inner hole (not the slightly larger glass). `null` when the hole is too small for a cross
	 * that would still leave four visible panes (never split the glass; these bars sit in front of
	 * one intact pane).
	 */
	mullion: UvRect | null;
	/** Horizontal centre bar of the four-pane cross — same rules as `mullion`. */
	transom: UvRect | null;
	/**
	 * The glazing rect — slightly larger than the inner frame hole so its edge faces sit inside the
	 * timber (no coplanar z-fight). Still inside the opening. One pane, even when the centre cross
	 * is present.
	 */
	glass: UvRect;
}

/**
 * Outer four-piece window frame (see the README's ASCII diagram) plus an optional centre cross
 * (vertical mullion + horizontal transom) that reads as a traditional four-pane sash. Left/right
 * run the opening's FULL height; top/bottom span only the gap between them. The glass rect stays
 * one intact interior — the cross is extra frame timber in front of it, never a glass split.
 * Frame pieces are sub-rects of `[minU,maxU] x [minY,maxY]` by construction. The glass overlaps
 * the inner hole by `WINDOW_GLASS_FRAME_OVERLAP` but still stays inside the opening.
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

	const hole: UvRect = {
		minU: opening.minU + frameWidth,
		maxU: opening.maxU - frameWidth,
		minY: opening.minY + frameWidth,
		maxY: opening.maxY - frameWidth
	};
	const glass = expandGlassIntoFrame(hole, opening, frameWidth);
	const cross = computeWindowCentreCross(hole, frameWidth);

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
		mullion: cross?.mullion ?? null,
		transom: cross?.transom ?? null,
		glass
	};
}

/**
 * Traditional four-pane centre cross: one vertical bar and one horizontal bar, each `barWidth`
 * thick, meeting at the glass centroid. Omitted when the glass cannot fit both bars and still
 * leave a positive pane on every side (a bar that filled the opening would hide the glass, not
 * divide it).
 */
export function computeWindowCentreCross(
	glass: UvRect,
	barWidth: number
): { mullion: UvRect; transom: UvRect } | null {
	const glassWidth = glass.maxU - glass.minU;
	const glassHeight = glass.maxY - glass.minY;
	if (barWidth <= 0 || glassWidth <= barWidth * 2 || glassHeight <= barWidth * 2) return null;

	const midU = (glass.minU + glass.maxU) / 2;
	const midY = (glass.minY + glass.maxY) / 2;
	const half = barWidth / 2;
	return {
		mullion: {
			minU: midU - half,
			maxU: midU + half,
			minY: glass.minY,
			maxY: glass.maxY
		},
		transom: {
			minU: glass.minU,
			maxU: glass.maxU,
			minY: midY - half,
			maxY: midY + half
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

/** Standard standing-reach height for a door handle (metres above the leaf's own minY / the floor). */
export const DOOR_HANDLE_HEIGHT = 1;
/** How far the handle sits in from the latch (swing) edge — never from the hinge. */
export const DOOR_HANDLE_EDGE_INSET = 0.07;

export interface DoorHandlePlacement {
	/**
	 * Door-local X from the hinge pivot: the same space `OpeningVisualBuilder` translates the leaf
	 * into (left-hinged leaf extends +X, right-hinged extends −X). Always on the latch/swing half,
	 * never the hinge half.
	 */
	localX: number;
	/** Door-local Y from the leaf bottom (hinge pivot Y). */
	localY: number;
	/**
	 * Which way the lever bar extends from the plate toward the hinge (`+1` = +X, `−1` = −X) so
	 * the grip points inward from the latch edge on both left- and right-hinged doors.
	 */
	leverSign: number;
}

/**
 * Latch-side handle placement in the door leaf's own hinge-local frame. Both faces of the door
 * share this X/Y (the builder mirrors them in ±Z). Short leaves drop the handle to mid-height
 * rather than floating it above the door.
 */
export function computeDoorHandlePlacement(
	leafWidth: number,
	leafHeight: number,
	hingeSide: HingeSide
): DoorHandlePlacement {
	const inset = Math.min(DOOR_HANDLE_EDGE_INSET, Math.max(leafWidth * 0.2, MIN_DIMENSION));
	const alongLeaf = Math.max(MIN_DIMENSION, leafWidth - inset);
	const localX = hingeSide === 'left' ? alongLeaf : -alongLeaf;
	const localY =
		leafHeight < DOOR_HANDLE_HEIGHT + 0.25
			? leafHeight * 0.5
			: Math.min(DOOR_HANDLE_HEIGHT, leafHeight - 0.15);
	return {
		localX,
		localY,
		leverSign: hingeSide === 'left' ? -1 : 1
	};
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
 * crosspiece (a doorway's floor must stay open) — see the README's ASCII diagram. The leaf fills
 * the inner jambs and lintel; `clearance` is an optional extra inset (split evenly left/right,
 * taken only off the top vertically — never the bottom, which stays flush with the floor).
 * Default clearance is 0 so there is no gap between the door and its frame.
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
