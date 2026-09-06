import type { Point2D } from './wallPathMath';
import { ensureCCW, signedArea2D } from './slabMath';
import type { RoofDirection, RoofProfileSettings, RoofType, ShedDirection } from './RoofTypes';

const EPSILON = 1e-6;

export interface AxisAlignedRect {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

/**
 * Every pitched roof type in this file is built entirely from an axis-aligned rectangle — no
 * general straight-skeleton solver for arbitrary polygons (see the README's "Roofs" section for why
 * that's an explicitly deferred, much larger problem). This detects whether a closed polygon IS one:
 * exactly 4 points (after CCW normalization and dropping an accidental duplicate closing point),
 * with every edge parallel to X or Z. Returns `null` for anything else, including triangles,
 * L-shapes, or a rectangle rotated off-axis — all of which the building grid can still produce, but
 * none of which a rectangle-based roof profile can be built on top of.
 */
export function axisAlignedRectangleOf(points: readonly Point2D[]): AxisAlignedRect | null {
	if (points.length !== 4) return null;
	const ccw = ensureCCW(points);

	for (let i = 0; i < 4; i++) {
		const a = ccw[i];
		const b = ccw[(i + 1) % 4];
		const dx = Math.abs(a.x - b.x);
		const dz = Math.abs(a.z - b.z);
		if (dx > EPSILON && dz > EPSILON) return null; // a diagonal edge
	}

	const xs = ccw.map((p) => p.x);
	const zs = ccw.map((p) => p.z);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minZ = Math.min(...zs);
	const maxZ = Math.max(...zs);
	if (maxX - minX < EPSILON || maxZ - minZ < EPSILON) return null; // degenerate

	// Every corner of the bounding box must actually be one of the 4 points — rules out an
	// axis-aligned but non-rectangular shape (impossible with exactly 4 points and only
	// axis-parallel edges, but checked explicitly rather than assumed).
	for (const [x, z] of [
		[minX, minZ],
		[maxX, minZ],
		[maxX, maxZ],
		[minX, maxZ]
	] as const) {
		const hasCorner = ccw.some((p) => Math.abs(p.x - x) < EPSILON && Math.abs(p.z - z) < EPSILON);
		if (!hasCorner) return null;
	}

	return { minX, maxX, minZ, maxZ };
}

export function expandRect(rect: AxisAlignedRect, amount: number): AxisAlignedRect {
	return {
		minX: rect.minX - amount,
		maxX: rect.maxX + amount,
		minZ: rect.minZ - amount,
		maxZ: rect.maxZ + amount
	};
}

export function rectWidth(rect: AxisAlignedRect): number {
	return rect.maxX - rect.minX;
}
export function rectDepth(rect: AxisAlignedRect): number {
	return rect.maxZ - rect.minZ;
}

/** `hip` ignores the stored `direction` and always runs its ridge along the LONGER footprint axis — see the README's "Automatic initial orientation" section. */
export function hipRidgeDirection(rect: AxisAlignedRect): RoofDirection {
	return rectWidth(rect) >= rectDepth(rect) ? 'x' : 'z';
}

/** The initial orientation chosen when a polygon is first closed — the long dimension, per the README's "Automatic initial orientation" section. The player can still press `R` to override it. */
export function initialRoofDirection(rect: AxisAlignedRect): RoofDirection {
	return rectWidth(rect) >= rectDepth(rect) ? 'x' : 'z';
}

/** `pitch = atan(rise / halfSpan)`, in radians — never hardcoded, always derived from the actual rise and the perpendicular span the roof climbs across. `halfSpan` is the run for a symmetric two-sided roof (gable/hip/etc); a `shed` climbs the FULL span, so pass that directly as `run`. */
export function pitchFromRiseAndRun(rise: number, run: number): number {
	if (run <= EPSILON) return 0;
	return Math.atan(rise / run);
}

export function pitchDegrees(rise: number, run: number): number {
	return (pitchFromRiseAndRun(rise, run) * 180) / Math.PI;
}

/**
 * Whether `type` can slope in the traditional sense (rise/pitch/orientation are all meaningful) —
 * `'flat'` is the only exception, per the README's "Flat roof behaviour" section: ↑/↓ are ignored
 * for it and its HUD always reads "Rise: — / Pitch: 0°".
 */
export function roofTypeHasSlope(type: RoofType): boolean {
	return type !== 'flat';
}

/**
 * Whether `R` changes anything for `type` — `'flat'` has no orientation at all; `hip` and `mansard`
 * are both capped by a true hip (see `buildHipFaces`/`buildHipFrustumFaces`), whose ridge/frustum
 * shape is fully derived from the footprint's own proportions rather than a user choice, so rotating
 * either produces the exact same geometry. `dutch-gable` looks the same on its lower frustum but its
 * upper cap is a real gable (see `buildDutchGableFaces`), so it DOES rotate.
 */
export function roofTypeHasOrientationControl(type: RoofType): boolean {
	return type !== 'flat' && type !== 'hip' && type !== 'mansard';
}

// ---------------------------------------------------------------------------------------------
// Roof face generation
//
// Every pitched type below is expressed in the roof's own (u, v) coordinate system rather than
// directly in (x, z): `u` runs along the ridge (or, for `shed`, along the high/low edge), `v` runs
// across the span the roof climbs over. `direction: 'x'` maps u→x, v→z; `direction: 'z'` maps
// u→z, v→x. Writing the maths once in (u, v) and mapping to world axes at the very end is what lets
// `R` "rotate" a roof by 90° for free — every face-builder below takes the SAME numbers regardless
// of orientation, only `toXZ` changes.
// ---------------------------------------------------------------------------------------------

export interface RoofVertex {
	x: number;
	y: number;
	z: number;
}

/**
 * One planar, convex face of a roof solid's OUTER surface — the underside is generated
 * automatically (see RoofGeometryBuilder.ts) by offsetting every vertex down by the roof's
 * thickness and reversing winding, using the SAME vertex objects at shared edges (ridges, hips,
 * valleys) so the top and bottom shells stay watertight there with no extra code.
 *
 * `fasciaEdges[i]` says whether the edge from `points[i]` to `points[(i+1) % points.length]` is a
 * true outer boundary (an eave or a verge/rake — gets a vertical fascia strip connecting the top
 * face to the bottom one) or an INTERNAL edge shared with a neighbouring face (a ridge, hip, or
 * valley line) that must NOT get a fascia strip, since two faces already meet there.
 *
 * `vertical` marks a gable-end wall (the triangle or convex polygon you see looking at the roof
 * end-on). Those sit in a plane of constant `u` and must NOT be treated as a roof skin: offsetting
 * them down by thickness would put a second copy in the same plane. The geometry builder emits
 * them once, wound outward, and only fascias flagged edges (see `verticalEndCaps`).
 */
export interface RoofFace {
	points: RoofVertex[];
	fasciaEdges: boolean[];
	vertical?: boolean;
}

interface UvFrame {
	direction: RoofDirection;
	uMin: number;
	uMax: number;
	vMin: number;
	vMax: number;
	toXZ: (u: number, v: number) => { x: number; z: number };
}

function uvFrame(rect: AxisAlignedRect, direction: RoofDirection): UvFrame {
	if (direction === 'x') {
		return {
			direction,
			uMin: rect.minX,
			uMax: rect.maxX,
			vMin: rect.minZ,
			vMax: rect.maxZ,
			toXZ: (u, v) => ({ x: u, z: v })
		};
	}
	return {
		direction,
		uMin: rect.minZ,
		uMax: rect.maxZ,
		vMin: rect.minX,
		vMax: rect.maxX,
		toXZ: (u, v) => ({ x: v, z: u })
	};
}

function vertex(frame: UvFrame, u: number, v: number, y: number): RoofVertex {
	const { x, z } = frame.toXZ(u, v);
	return { x, y, z };
}

/**
 * A single rectangular slope spanning the full ridge length, climbing linearly in `v` from
 * `(vFrom, yFrom)` to `(vTo, yTo)` — the fundamental building block behind `shed` (one slope),
 * `gable`/`butterfly` (two, mirrored), and each segment of `gambrel`/`m-shaped` (several, stacked).
 * `startFascia`/`endFascia` mark whether the `vFrom`/`vTo` edges are true boundaries (true for an
 * eave or a valley/ridge that terminates the whole roof) or shared with a neighbouring segment
 * (false) — the two `u`-direction edges (the verges/rakes at `uMin`/`uMax`) stay true fascia
 * boundaries so the roof's thickness still shows along the rake; the hole between those rakes is
 * filled by `verticalEndCaps`, not by this slope.
 */
function slopeSegmentFace(
	frame: UvFrame,
	vFrom: number,
	yFrom: number,
	vTo: number,
	yTo: number,
	startFascia: boolean,
	endFascia: boolean
): RoofFace {
	return {
		points: [
			vertex(frame, frame.uMin, vFrom, yFrom),
			vertex(frame, frame.uMax, vFrom, yFrom),
			vertex(frame, frame.uMax, vTo, yTo),
			vertex(frame, frame.uMin, vTo, yTo)
		],
		// Edges, in order: (uMin,vFrom)->(uMax,vFrom) [the vFrom edge], (uMax,vFrom)->(uMax,vTo) [the
		// uMax verge], (uMax,vTo)->(uMin,vTo) [the vTo edge], (uMin,vTo)->(uMin,vFrom) [the uMin verge].
		fasciaEdges: [startFascia, true, endFascia, true]
	};
}

/** `shed`: one full-span slope from the low edge to the high edge. */
export function buildShedFaces(
	rect: AxisAlignedRect,
	baseY: number,
	rise: number,
	shedDirection: ShedDirection
): RoofFace[] {
	// `uvFrame('x')` maps v→z and `uvFrame('z')` maps v→x — a shed's high/low edges vary ALONG the
	// axis named in `shedDirection`, so the frame needs `v` mapped to THAT axis, which is the
	// opposite of the naming used for `RoofDirection` elsewhere in this file.
	const axis: RoofDirection = shedDirection === '+x' || shedDirection === '-x' ? 'z' : 'x';
	const frame = uvFrame(rect, axis);
	const low = shedDirection === '+x' || shedDirection === '+z' ? frame.vMin : frame.vMax;
	const high = low === frame.vMin ? frame.vMax : frame.vMin;
	const peakY = baseY + rise;
	return [
		// High eave is not fascia: the tall-side wall occupies that plane (a fascia strip there
		// would sit on top of the wall and z-fight).
		slopeSegmentFace(frame, low, baseY, high, peakY, true, false),
		...verticalEndCaps(
			frame,
			[
				{ v: low, y: baseY },
				{ v: high, y: peakY },
				{ v: high, y: baseY }
			],
			true
		),
		...verticalHighEndWall(frame, high, peakY, baseY)
	];
}

/**
 * `gable` (outerY at the eaves, `centerY` at the full-length ridge) and `butterfly` (the same shape
 * with the Y roles swapped — see RoofDefinition's doc comment on why `rise` always means "vertical
 * difference from the outer edge", never "how far down the valley sits").
 */
export function buildRidgeOrValleyFaces(
	rect: AxisAlignedRect,
	direction: RoofDirection,
	outerY: number,
	centerY: number,
	options?: { endCapCloseFascia?: boolean }
): RoofFace[] {
	const frame = uvFrame(rect, direction);
	const vMid = (frame.vMin + frame.vMax) / 2;
	return [
		slopeSegmentFace(frame, frame.vMin, outerY, vMid, centerY, true, false),
		slopeSegmentFace(frame, vMid, centerY, frame.vMax, outerY, false, true),
		...verticalEndCaps(
			frame,
			[
				{ v: frame.vMin, y: outerY },
				{ v: vMid, y: centerY },
				{ v: frame.vMax, y: outerY }
			],
			options?.endCapCloseFascia ?? true
		)
	];
}

export function buildGableFaces(
	rect: AxisAlignedRect,
	direction: RoofDirection,
	baseY: number,
	rise: number,
	options?: { endCapCloseFascia?: boolean }
) {
	return buildRidgeOrValleyFaces(rect, direction, baseY, baseY + rise, options);
}

export function buildButterflyFaces(
	rect: AxisAlignedRect,
	direction: RoofDirection,
	baseY: number,
	rise: number
) {
	// Closing edge is the two HIGH eaves — a downward fascia there would sit inside the inverted
	// triangle, so the end cap is fill-only.
	return buildRidgeOrValleyFaces(rect, direction, baseY + rise, baseY, {
		endCapCloseFascia: false
	});
}

/** `gambrel`: a two-pitch symmetric gable — a steep lower slope to a break, then a shallow upper slope to the ridge, mirrored on both sides. */
export function buildGambrelFaces(
	rect: AxisAlignedRect,
	direction: RoofDirection,
	baseY: number,
	rise: number,
	profile: RoofProfileSettings
): RoofFace[] {
	const frame = uvFrame(rect, direction);
	const halfSpan = (frame.vMax - frame.vMin) / 2;
	const lowerRun = halfSpan * clamp01(profile.gambrelLowerSlopeFraction);
	const breakY = baseY + rise * clamp01(profile.gambrelBreakHeightFraction);
	const vMid = (frame.vMin + frame.vMax) / 2;
	const vBreak1 = frame.vMin + lowerRun;
	const vBreak2 = frame.vMax - lowerRun;
	const peakY = baseY + rise;

	return [
		slopeSegmentFace(frame, frame.vMin, baseY, vBreak1, breakY, true, false),
		slopeSegmentFace(frame, vBreak1, breakY, vMid, peakY, false, false),
		slopeSegmentFace(frame, vMid, peakY, vBreak2, breakY, false, false),
		slopeSegmentFace(frame, vBreak2, breakY, frame.vMax, baseY, false, true),
		...verticalEndCaps(
			frame,
			[
				{ v: frame.vMin, y: baseY },
				{ v: vBreak1, y: breakY },
				{ v: vMid, y: peakY },
				{ v: vBreak2, y: breakY },
				{ v: frame.vMax, y: baseY }
			],
			true
		)
	];
}

/** `m-shaped`: two gables side by side, sharing a central valley — four full-span slopes. */
export function buildMShapedFaces(
	rect: AxisAlignedRect,
	direction: RoofDirection,
	baseY: number,
	rise: number,
	profile: RoofProfileSettings
): RoofFace[] {
	const frame = uvFrame(rect, direction);
	const quarterSpan = (frame.vMax - frame.vMin) / 4;
	const vMid = (frame.vMin + frame.vMax) / 2;
	const vRidge1 = frame.vMin + quarterSpan;
	const vRidge2 = frame.vMax - quarterSpan;
	const peakY = baseY + rise;
	const valleyY = baseY + rise * clamp01(profile.mShapedValleyFraction);

	return [
		slopeSegmentFace(frame, frame.vMin, baseY, vRidge1, peakY, true, false),
		slopeSegmentFace(frame, vRidge1, peakY, vMid, valleyY, false, false),
		slopeSegmentFace(frame, vMid, valleyY, vRidge2, peakY, false, false),
		slopeSegmentFace(frame, vRidge2, peakY, frame.vMax, baseY, false, true),
		// A single W is concave, so each end is three convex triangles: one per gable peak,
		// plus the valley fill between them down to the eave line.
		...verticalEndCaps(
			frame,
			[
				{ v: frame.vMin, y: baseY },
				{ v: vRidge1, y: peakY },
				{ v: vMid, y: valleyY }
			],
			false
		),
		...verticalEndCaps(
			frame,
			[
				{ v: vMid, y: valleyY },
				{ v: vRidge2, y: peakY },
				{ v: frame.vMax, y: baseY }
			],
			false
		),
		...verticalEndCaps(
			frame,
			[
				{ v: frame.vMin, y: baseY },
				{ v: vMid, y: valleyY },
				{ v: frame.vMax, y: baseY }
			],
			true
		)
	];
}

/**
 * `hip`: rises from all four eave edges to a real peak — a ridge LINE at `v = vMid` if the
 * footprint isn't square (spanning `u` from `uMin + halfSpan` to `uMax - halfSpan`, where
 * `halfSpan` is half the short span — the standard 45°-hip construction), or a single point if it
 * is (the two ridge endpoints coincide). Four faces: two trapezoids (the long "hip ends" — or, once
 * the ridge shrinks to a point, no ridge edge to speak of, but the trapezoid math still degenerates
 * safely) and two triangles (the short "hip ends", one at each end of the ridge).
 */
export function buildHipFaces(rect: AxisAlignedRect, baseY: number, rise: number): RoofFace[] {
	const direction = hipRidgeDirection(rect);
	const frame = uvFrame(rect, direction);
	const peakY = baseY + rise;
	const halfSpan = (frame.vMax - frame.vMin) / 2;
	const ridgeUMin = frame.uMin + halfSpan;
	const ridgeUMax = frame.uMax - halfSpan;
	const vMid = (frame.vMin + frame.vMax) / 2;

	// Pushed unconditionally, even for a square footprint (`ridgeUMax === ridgeUMin`, both equal to
	// the centre): the "trapezoid" then just has two coincident points, which is a perfectly valid
	// (if degenerate) quad — the geometry builder's fan triangulation turns it into one real triangle
	// plus one zero-area one, giving the correct 4-triangle pyramid rather than a hole where the
	// north/south faces should be.
	const faces: RoofFace[] = [
		{
			points: [
				vertex(frame, frame.uMin, frame.vMin, baseY),
				vertex(frame, frame.uMax, frame.vMin, baseY),
				vertex(frame, ridgeUMax, vMid, peakY),
				vertex(frame, ridgeUMin, vMid, peakY)
			],
			// eave (true) / east hip line (shared w/ east triangle) / ridge (shared w/ south) / west hip line (shared w/ west triangle)
			fasciaEdges: [true, false, false, false]
		},
		{
			points: [
				vertex(frame, ridgeUMin, vMid, peakY),
				vertex(frame, ridgeUMax, vMid, peakY),
				vertex(frame, frame.uMax, frame.vMax, baseY),
				vertex(frame, frame.uMin, frame.vMax, baseY)
			],
			fasciaEdges: [false, false, true, false]
		}
	];

	faces.push({
		points: [
			vertex(frame, frame.uMin, frame.vMin, baseY),
			vertex(frame, frame.uMin, frame.vMax, baseY),
			vertex(frame, ridgeUMin, vMid, peakY)
		],
		// west eave (true) / hip line shared w/ south trapezoid / hip line shared w/ north trapezoid
		fasciaEdges: [true, false, false]
	});
	faces.push({
		points: [
			vertex(frame, frame.uMax, frame.vMin, baseY),
			vertex(frame, ridgeUMax, vMid, peakY),
			vertex(frame, frame.uMax, frame.vMax, baseY)
		],
		// hip line shared w/ north trapezoid / hip line shared w/ south trapezoid / east eave (true)
		fasciaEdges: [false, false, true]
	});

	return faces.filter((face) => facePerimeter(face) > EPSILON);
}

/**
 * A hip roof stopped short of its natural peak, uniformly inset on all four sides by `inset` (a
 * true 45°-hip line rises 1 unit for every 1 unit it moves inward, so `inset` is exactly "how far
 * it has risen" — see `buildMansardFaces`/`buildDutchGableFaces`, the only two callers) — four
 * trapezoids meeting cleanly at the corners, with an intact smaller rectangle left at `innerY`
 * (unlike `buildHipFaces`, which converges all the way to a line/point). What sits on top of that
 * inner rectangle is the caller's job (another hip, for mansard; a gable, for dutch-gable).
 */
function buildHipFrustumFaces(
	rect: AxisAlignedRect,
	direction: RoofDirection,
	eaveY: number,
	innerY: number,
	inset: number
): RoofFace[] {
	const frame = uvFrame(rect, direction);
	const innerUMin = frame.uMin + inset;
	const innerUMax = frame.uMax - inset;
	const innerVMin = frame.vMin + inset;
	const innerVMax = frame.vMax - inset;

	return [
		{
			// "north" (v = vMin side)
			points: [
				vertex(frame, frame.uMin, frame.vMin, eaveY),
				vertex(frame, frame.uMax, frame.vMin, eaveY),
				vertex(frame, innerUMax, innerVMin, innerY),
				vertex(frame, innerUMin, innerVMin, innerY)
			],
			fasciaEdges: [true, false, false, false]
		},
		{
			// "south" (v = vMax side)
			points: [
				vertex(frame, frame.uMax, frame.vMax, eaveY),
				vertex(frame, frame.uMin, frame.vMax, eaveY),
				vertex(frame, innerUMin, innerVMax, innerY),
				vertex(frame, innerUMax, innerVMax, innerY)
			],
			fasciaEdges: [true, false, false, false]
		},
		{
			// "west" (u = uMin side)
			points: [
				vertex(frame, frame.uMin, frame.vMax, eaveY),
				vertex(frame, frame.uMin, frame.vMin, eaveY),
				vertex(frame, innerUMin, innerVMin, innerY),
				vertex(frame, innerUMin, innerVMax, innerY)
			],
			fasciaEdges: [true, false, false, false]
		},
		{
			// "east" (u = uMax side)
			points: [
				vertex(frame, frame.uMax, frame.vMin, eaveY),
				vertex(frame, frame.uMax, frame.vMax, eaveY),
				vertex(frame, innerUMax, innerVMax, innerY),
				vertex(frame, innerUMax, innerVMin, innerY)
			],
			fasciaEdges: [true, false, false, false]
		}
	];
}

/** `mansard`: a steep hip frustum from the eaves to an inset rectangle, topped by a shallower hip rising from there to a real peak. */
export function buildMansardFaces(
	rect: AxisAlignedRect,
	baseY: number,
	rise: number,
	profile: RoofProfileSettings
): RoofFace[] {
	const breakY = baseY + rise * clamp01(profile.mansardBreakFraction);
	const inset = Math.max(
		0,
		Math.min(breakY - baseY, Math.min(rectWidth(rect), rectDepth(rect)) / 2 - EPSILON)
	);

	const direction = hipRidgeDirection(rect);
	const lower = buildHipFrustumFaces(rect, direction, baseY, breakY, inset);
	const innerRect: AxisAlignedRect = {
		minX: rect.minX + inset,
		maxX: rect.maxX - inset,
		minZ: rect.minZ + inset,
		maxZ: rect.maxZ - inset
	};

	const upper = buildHipFaces(innerRect, breakY, rise - (breakY - baseY));
	return [...lower, ...upper];
}

/**
 * `dutch-gable`: a hip frustum from the eaves to an inset rectangle, topped by a full-length gable
 * cap rising from there to the peak. Unlike `mansard` (capped by another true hip), the upper cap
 * here is a real gable with a genuine ridge direction — `direction` is the user's own `R`-chosen
 * value (see `roofTypeHasOrientationControl`), NOT derived from the footprint the way `hip`'s is;
 * the lower frustum itself is direction-invariant (`buildHipFrustumFaces` insets uniformly on all
 * four sides either way) but still takes the same `direction` for a consistent (u, v) frame.
 */
export function buildDutchGableFaces(
	rect: AxisAlignedRect,
	direction: RoofDirection,
	baseY: number,
	rise: number,
	profile: RoofProfileSettings
): RoofFace[] {
	const breakY = baseY + rise * clamp01(profile.dutchGableHipFraction);
	const inset = Math.max(
		0,
		Math.min(breakY - baseY, Math.min(rectWidth(rect), rectDepth(rect)) / 2 - EPSILON)
	);

	const lower = buildHipFrustumFaces(rect, direction, baseY, breakY, inset);
	const innerRect: AxisAlignedRect = {
		minX: rect.minX + inset,
		maxX: rect.maxX - inset,
		minZ: rect.minZ + inset,
		maxZ: rect.maxZ - inset
	};

	const upper = buildGableFaces(innerRect, direction, breakY, rise - (breakY - baseY), {
		endCapCloseFascia: false
	});
	return [...lower, ...upper];
}

interface RoofProfilePoint {
	v: number;
	y: number;
}

/**
 * Vertical walls that close a gable-style profile at `uMin` and `uMax` — the triangle (or convex
 * polygon) visible looking at the roof end-on. Hip/mansard ends are sloped, so they never call this.
 *
 * A vertical face must not be extruded downward: the offset copy would lie in the same plane and
 * overlap. Thickness along each rake is already the slope's verge fascia. `closeFascia` adds a
 * strip under the profile's last→first edge only when that edge is the bottom of the shape (a
 * gable's eave-to-eave line). It stays off when that strip would sit inside the fill (butterfly)
 * or punch into a hip below (dutch-gable cap).
 */
/** Shed only: the vertical rectangle on the tallest eave, from the high edge down to the low-eave height. */
function verticalHighEndWall(frame: UvFrame, v: number, topY: number, bottomY: number): RoofFace[] {
	if (topY - bottomY < EPSILON) return [];
	return [
		{
			points: [
				vertex(frame, frame.uMin, v, topY),
				vertex(frame, frame.uMax, v, topY),
				vertex(frame, frame.uMax, v, bottomY),
				vertex(frame, frame.uMin, v, bottomY)
			],
			// Top + both sides are shared with the slope high eave / gable-end drops; only the
			// new baseline under the wall needs a thickness strip.
			fasciaEdges: [false, false, true, false],
			vertical: true
		}
	];
}

function verticalEndCaps(
	frame: UvFrame,
	profile: readonly RoofProfilePoint[],
	closeFascia: boolean
): RoofFace[] {
	if (profile.length < 3) return [];
	return [frame.uMin, frame.uMax].map((u) => ({
		points: profile.map((p) => vertex(frame, u, p.v, p.y)),
		fasciaEdges: profile.map((_, i) => closeFascia && i === profile.length - 1),
		vertical: true
	}));
}

function clamp01(value: number): number {
	return Math.max(0.01, Math.min(0.99, value));
}

function facePerimeter(face: RoofFace): number {
	let total = 0;
	for (let i = 0; i < face.points.length; i++) {
		const a = face.points[i];
		const b = face.points[(i + 1) % face.points.length];
		total += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
	}
	return total;
}

/**
 * The single dispatch point from `RoofDefinition.type` to its face list — every geometry-consuming
 * caller (`RoofGeometryBuilder`, and any future debug visualisation) goes through this rather than
 * switching on `type` itself. `'flat'` is handled by the caller instead (see
 * `RoofGeometryBuilder.buildRoofGeometry`'s own doc comment) since it supports arbitrary polygons,
 * not just rectangles, and reuses `SlabGeometryBuilder` directly.
 */
export function buildRoofFaces(
	type: Exclude<RoofType, 'flat'>,
	rect: AxisAlignedRect,
	direction: RoofDirection,
	shedDirection: ShedDirection,
	baseY: number,
	rise: number,
	profile: RoofProfileSettings
): RoofFace[] {
	switch (type) {
		case 'shed':
			return buildShedFaces(rect, baseY, rise, shedDirection);
		case 'gable':
			return buildGableFaces(rect, direction, baseY, rise);
		case 'hip':
			return buildHipFaces(rect, baseY, rise);
		case 'gambrel':
			return buildGambrelFaces(rect, direction, baseY, rise, profile);
		case 'mansard':
			return buildMansardFaces(rect, baseY, rise, profile);
		case 'butterfly':
			return buildButterflyFaces(rect, direction, baseY, rise);
		case 'm-shaped':
			return buildMShapedFaces(rect, direction, baseY, rise, profile);
		case 'dutch-gable':
			return buildDutchGableFaces(rect, direction, baseY, rise, profile);
	}
}

/** Re-exported for callers that only have a plain point list and want the signed area / winding check without reaching into `slabMath.ts` directly. */
export { ensureCCW, signedArea2D };
