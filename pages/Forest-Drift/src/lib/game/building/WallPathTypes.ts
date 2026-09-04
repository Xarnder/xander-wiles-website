import type { WallOpeningDefinition } from './WallTypes';

export type { WallJoinStyle } from './wallPathMath';

/**
 * One logical wall segment within a WallPathDefinition — connects `points[index]` to
 * `points[index + 1]` (or, for the closing segment of a closed path, `points[length - 1]` back to
 * `points[0]`). Kept exactly as lightweight as a standalone WallDefinition's openings, on purpose:
 * a path segment is meant to behave like a normal wall everywhere except how its visible geometry
 * joins its neighbours — see WallPathManager.getSegmentAsWallView().
 */
export interface WallPathSegmentDefinition {
	id: string;
	openings: WallOpeningDefinition[];
}

/**
 * A continuous, ordered wall path on one foundation — the "Polygon/Continuous Wall" tool's output.
 * Points are foundation-local building-grid integers, exactly like a standalone WallDefinition's
 * endpoints (see FoundationLocalMath.BuildingGridPoint) — never world-space. `segments[i]`
 * corresponds to the edge `points[i] -> points[i+1]`; when `closed`, there is one additional
 * segment `points[length-1] -> points[0]` at `segments[length-1]`, so `segments.length` is always
 * `closed ? points.length : points.length - 1`.
 *
 * wallHeight/wallThickness/joinStyle/miterLimit/baseY are captured once per path (not per segment)
 * since a path is drawn as one continuous shape — unlike standalone walls, which each capture their
 * own height/thickness/baseY independently at placement time. `baseY` follows the same convention
 * as WallDefinition.baseY (0 for a ground-floor path; a level's baseY for an upper-storey one),
 * still relative to the one shared foundation-local Y=0 origin.
 */
export interface WallPathDefinition {
	id: string;
	foundationId: string;

	points: { gridX: number; gridZ: number }[];
	closed: boolean;

	baseY: number;
	wallHeight: number;
	wallThickness: number;
	joinStyle: 'miter' | 'bevel';
	miterLimit: number;

	segments: WallPathSegmentDefinition[];
}
