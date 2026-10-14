/**
 * Fence / railing layout: PATH + STYLE → structural members (posts, balusters, rails). Pure — no
 * Three.js — so every rule here is unit-tested directly; `BarrierGeometryCompiler` turns the members
 * into merged geometry. Members are derived build data and are never saved.
 *
 * The rules (see the README's "Fences and railings" section):
 * - ONE path vertex = ONE post. Every open end gets an end post, every shared vertex one corner post
 *   (the end-post style where the path turns, the structural style where it runs straight through),
 *   and a closed loop has no separate start/end post.
 * - Long segments get evenly spaced structural posts (`ceil(L / structuralPostSpacing) − 1`), so
 *   every bay between two posts is the same length.
 * - Balusters are balanced per bay: an integer count whose spacing divides the clear length between
 *   the two post faces exactly, with the same margin at both ends — never "every S metres and
 *   whatever is left at the end". Spacing is clamped so a style can't ask for 500 balusters.
 * - Rails die into posts that rise above them; where the rail runs OVER a post (deck rails) the
 *   top rail is mitred at corners with the wall-path join maths (`computeJoinAt`), falling back to a
 *   bevel past the miter limit.
 * - Posts are always vertical. Bases come from the base mode: level, a straight line between each
 *   segment's end points, or the surface under each member; the top rail is a straight line between
 *   neighbouring post tops, and each baluster spans from its own base to that line.
 */

import {
	BARRIER_LIMITS,
	BARRIER_MAX_BALUSTERS_PER_BAY,
	BARRIER_MIN_BALUSTER_GAP,
	type BarrierBaseMode,
	type BarrierPathPoint,
	type BarrierPostCap,
	type BarrierPostStyle,
	type BarrierRailProfile,
	type BarrierStyleDefinition
} from './BarrierTypes';
import { computeJoinAt, normalize2D, perpLeft, type Point2D } from './wallPathMath';

const EPSILON = 1e-6;
/** Post faces a rail dies into: the rail end sits this fraction of the half-width inside the post. */
const RAIL_INSET = 0.6;
/** How far rails and balusters reach into whatever they meet, so no hairline gap ever shows. */
const OVERLAP = 0.006;
/** Follow-surface posts are sunk this far so one side of the post never floats on a slope. */
const POST_SINK = 0.12;
const BALUSTER_SINK = 0.03;
/** Below this turn angle a vertex is "straight through" and gets a structural post. */
const STRAIGHT_THROUGH_RADIANS = (10 * Math.PI) / 180;
const RAIL_MITER_LIMIT = 4;

export type BarrierPostRole = 'end-post' | 'corner-post' | 'structural-post';
export type BarrierRailRole = 'top-rail' | 'bottom-rail' | 'mid-rail';

export interface BarrierPostMember {
	kind: 'post';
	role: BarrierPostRole;
	/** Path vertex index for end/corner posts; `-1` for structural posts. */
	vertexIndex: number;
	segmentIndex: number;
	x: number;
	z: number;
	/** Rotation about Y (radians) so the post's local +X runs along the path. */
	yaw: number;
	baseY: number;
	/** Top of the post body (the cap, if any, sits above it). */
	topY: number;
	style: BarrierPostStyle;
	cap: BarrierPostCap | null;
}

export interface BarrierBalusterMember {
	kind: 'baluster';
	segmentIndex: number;
	x: number;
	z: number;
	yaw: number;
	baseY: number;
	topY: number;
}

/**
 * One straight rail piece. The plan centre line runs from A to B; the top surface is the line
 * `y = yA + slope · (distance from A along dir)` — extended past A/B where a mitre reaches out. Each
 * end's cut is the plan offset per metre of cross-rail offset: `perpLeft(dir)` for a square cut, a
 * longer vector for a mitre.
 */
export interface BarrierRailMember {
	kind: 'rail';
	role: BarrierRailRole;
	segmentIndex: number;
	ax: number;
	az: number;
	bx: number;
	bz: number;
	dirX: number;
	dirZ: number;
	yA: number;
	slope: number;
	width: number;
	height: number;
	profile: BarrierRailProfile;
	startCut: Point2D;
	endCut: Point2D;
}

/** The wedge that fills the outside of a bevelled top-rail corner. */
export interface BarrierRailJointMember {
	kind: 'rail-joint';
	segmentIndex: number;
	polygon: Point2D[];
	topY: number;
	height: number;
}

export type BarrierMember =
	BarrierPostMember | BarrierBalusterMember | BarrierRailMember | BarrierRailJointMember;

/** Per-segment envelope for collision and picking. */
export interface BarrierSegmentEnvelope {
	ax: number;
	az: number;
	bx: number;
	bz: number;
	halfThickness: number;
	minY: number;
	maxY: number;
}

export interface BarrierLayout {
	posts: BarrierPostMember[];
	balusters: BarrierBalusterMember[];
	rails: BarrierRailMember[];
	joints: BarrierRailJointMember[];
	segments: BarrierSegmentEnvelope[];
}

export interface BarrierLayoutInput {
	points: readonly BarrierPathPoint[];
	closed: boolean;
	baseMode: BarrierBaseMode;
	/** Already sanitized (see `sanitizeBarrierStyle`). */
	style: BarrierStyleDefinition;
	/** Surface height at (x, z) in the barrier's own space — follow-surface only. `null` = unknown. */
	sampleBase?: (x: number, z: number) => number | null;
	/**
	 * Raises every rail line (and so every post top) above the post bases — stair railings run
	 * parallel to the nosing line, one step above the floor-to-landing line the newels stand on.
	 */
	railLift?: number;
	/** Where balusters without a bottom rail stand, when that isn't the base line (stair treads). */
	balusterBase?: (x: number, z: number) => number;
}

export function barrierSegmentCount(pointCount: number, closed: boolean): number {
	return closed ? pointCount : Math.max(0, pointCount - 1);
}

/**
 * A balanced baluster count for one bay: `count` balusters at `spacing` centre-to-centre, with the
 * first and last exactly `spacing` from the post faces. Spacing is held inside
 * [max(min spacing, baluster width + gap), max spacing].
 */
export function distributeBalusters(
	available: number,
	targetSpacing: number,
	balusterWidth: number
): { count: number; spacing: number } {
	const minSpacing = Math.max(
		BARRIER_LIMITS.balusterSpacing.min,
		balusterWidth + BARRIER_MIN_BALUSTER_GAP
	);
	const maxSpacing = BARRIER_LIMITS.balusterSpacing.max;
	if (!(available > minSpacing)) return { count: 0, spacing: Math.max(0, available) };
	const target = Math.min(maxSpacing, Math.max(minSpacing, targetSpacing));
	let count = Math.min(
		BARRIER_MAX_BALUSTERS_PER_BAY,
		Math.max(0, Math.round(available / target) - 1)
	);
	while (count > 0 && available / (count + 1) < minSpacing) count--;
	while (
		count < BARRIER_MAX_BALUSTERS_PER_BAY &&
		available / (count + 1) > maxSpacing &&
		available / (count + 2) >= minSpacing
	)
		count++;
	return { count, spacing: available / (count + 1) };
}

/** Intermediate structural posts along a segment of length `length` (excluding its two vertex posts). */
export function structuralPostCount(length: number, spacing: number): number {
	if (!(spacing > 0)) return 0;
	return Math.max(0, Math.ceil(length / spacing - 1e-6) - 1);
}

interface Stop {
	u: number;
	x: number;
	z: number;
	baseY: number;
	railTop: number;
	halfWidth: number;
	/** The post rises above the rail top, so rails die into it. */
	above: boolean;
	/** Path vertex index, or -1 for a structural post. */
	vertex: number;
}

/** `segmentIndex`'s start and end vertex indices. */
function segmentEnds(index: number, count: number): [number, number] {
	return [index, (index + 1) % count];
}

export function layoutBarrier(input: BarrierLayoutInput): BarrierLayout {
	const { points, closed, baseMode, style } = input;
	const n = points.length;
	const layout: BarrierLayout = { posts: [], balusters: [], rails: [], joints: [], segments: [] };
	const segmentCount = barrierSegmentCount(n, closed);
	if (n < 2 || segmentCount === 0) return layout;

	const height = style.height + (input.railLift ?? 0);
	const lift = input.railLift ?? 0;
	const railH = style.topRail.height;
	const railHalfW = style.topRail.width / 2;
	const sample = (x: number, z: number, fallback: number): number => {
		if (baseMode !== 'follow-surface' || !input.sampleBase) return fallback;
		const value = input.sampleBase(x, z);
		return value === null || !Number.isFinite(value) ? fallback : value;
	};
	const flatY = points[0].y;
	const vertexBase = points.map((p) =>
		baseMode === 'flat' ? flatY : baseMode === 'linear-slope' ? p.y : sample(p.x, p.z, p.y)
	);

	const dirs: Point2D[] = [];
	const lengths: number[] = [];
	for (let s = 0; s < segmentCount; s++) {
		const [a, b] = segmentEnds(s, n);
		const dx = points[b].x - points[a].x;
		const dz = points[b].z - points[a].z;
		lengths.push(Math.hypot(dx, dz));
		dirs.push(normalize2D({ x: dx, z: dz }));
	}

	// ---- one post per path vertex
	const vertexPost: (BarrierPostMember | null)[] = new Array(n).fill(null);
	const vertexJoin: ({ miter: Point2D } | { bevel: true } | null)[] = new Array(n).fill(null);
	for (let i = 0; i < n; i++) {
		const hasIn = closed || i > 0;
		const hasOut = closed || i < n - 1;
		const dirIn = hasIn ? dirs[(i - 1 + segmentCount) % segmentCount] : null;
		const dirOut = hasOut ? dirs[i % segmentCount] : null;
		let role: BarrierPostRole = 'end-post';
		let postStyle = style.endPost;
		let yaw = Math.atan2(-(dirOut ?? dirIn!).z, (dirOut ?? dirIn!).x);
		if (dirIn && dirOut) {
			const cross = dirIn.x * dirOut.z - dirIn.z * dirOut.x;
			const dot = dirIn.x * dirOut.x + dirIn.z * dirOut.z;
			const turn = Math.atan2(Math.abs(cross), dot);
			role = 'corner-post';
			if (turn < STRAIGHT_THROUGH_RADIANS) postStyle = style.structuralPost;
			const bx = dirIn.x + dirOut.x;
			const bz = dirIn.z + dirOut.z;
			if (Math.hypot(bx, bz) > 1e-3) yaw = Math.atan2(-bz, bx);
		}
		const baseY = vertexBase[i];
		const railTop = baseY + height;
		const above = postStyle.extendAbove > EPSILON;
		const post: BarrierPostMember = {
			kind: 'post',
			role,
			vertexIndex: i,
			segmentIndex: hasOut ? i % segmentCount : (i - 1 + segmentCount) % segmentCount,
			x: points[i].x,
			z: points[i].z,
			yaw,
			baseY: baseY - (baseMode === 'follow-surface' ? POST_SINK : 0),
			topY: above ? railTop + postStyle.extendAbove : railTop - railH + OVERLAP,
			style: postStyle,
			cap: above ? postStyle.cap : null
		};
		vertexPost[i] = post;
		layout.posts.push(post);

		// The top rail runs over a corner post that stays under it: mitre (or bevel) the join.
		if (!above && dirIn && dirOut) {
			const join = computeJoinAt(
				dirIn,
				dirOut,
				{ x: points[i].x, z: points[i].z },
				railHalfW,
				'miter',
				RAIL_MITER_LIMIT
			);
			if (join.left.length === 1) {
				vertexJoin[i] = {
					miter: {
						x: (join.left[0].x - points[i].x) / railHalfW,
						z: (join.left[0].z - points[i].z) / railHalfW
					}
				};
			} else {
				vertexJoin[i] = { bevel: true };
				const pIn = perpLeft(dirIn);
				const pOut = perpLeft(dirOut);
				const c = points[i];
				layout.joints.push({
					kind: 'rail-joint',
					segmentIndex: i % segmentCount,
					polygon: convexHull([
						{ x: c.x + pIn.x * railHalfW, z: c.z + pIn.z * railHalfW },
						{ x: c.x - pIn.x * railHalfW, z: c.z - pIn.z * railHalfW },
						{ x: c.x + pOut.x * railHalfW, z: c.z + pOut.z * railHalfW },
						{ x: c.x - pOut.x * railHalfW, z: c.z - pOut.z * railHalfW }
					]),
					topY: railTop,
					height: railH
				});
			}
		}
	}

	// ---- segments: structural posts, then rails and balusters bay by bay
	for (let s = 0; s < segmentCount; s++) {
		const [ia, ib] = segmentEnds(s, n);
		const a = points[ia];
		const b = points[ib];
		const L = lengths[s];
		const dir = dirs[s];
		const left = perpLeft(dir);
		const segYaw = Math.atan2(-dir.z, dir.x);
		const lineBase = (u: number) =>
			L > EPSILON ? vertexBase[ia] + ((vertexBase[ib] - vertexBase[ia]) * u) / L : vertexBase[ia];
		const at = (u: number) => ({ x: a.x + dir.x * u, z: a.z + dir.z * u });

		const postA = vertexPost[ia]!;
		const postB = vertexPost[ib]!;
		const stops: Stop[] = [
			{
				u: 0,
				x: a.x,
				z: a.z,
				baseY: vertexBase[ia],
				railTop: vertexBase[ia] + height,
				halfWidth: postA.style.width / 2,
				above: postA.style.extendAbove > EPSILON,
				vertex: ia
			}
		];
		const structural = style.structuralPost;
		const count = structural.enabled ? structuralPostCount(L, style.structuralPostSpacing) : 0;
		for (let k = 1; k <= count; k++) {
			const u = (L * k) / (count + 1);
			const p = at(u);
			const baseY = baseMode === 'follow-surface' ? sample(p.x, p.z, lineBase(u)) : lineBase(u);
			const railTop = baseY + height;
			const above = structural.extendAbove > EPSILON;
			layout.posts.push({
				kind: 'post',
				role: 'structural-post',
				vertexIndex: -1,
				segmentIndex: s,
				x: p.x,
				z: p.z,
				yaw: segYaw,
				baseY: baseY - (baseMode === 'follow-surface' ? POST_SINK : 0),
				topY: above ? railTop + structural.extendAbove : railTop - railH + OVERLAP,
				style: structural,
				cap: above ? structural.cap : null
			});
			stops.push({
				u,
				x: p.x,
				z: p.z,
				baseY,
				railTop,
				halfWidth: structural.width / 2,
				above,
				vertex: -1
			});
		}
		stops.push({
			u: L,
			x: b.x,
			z: b.z,
			baseY: vertexBase[ib],
			railTop: vertexBase[ib] + height,
			halfWidth: postB.style.width / 2,
			above: postB.style.extendAbove > EPSILON,
			vertex: ib
		});

		let minY = Infinity;
		let maxY = -Infinity;
		let halfThickness = Math.max(railHalfW, style.baluster.depth / 2);
		for (const stop of stops) halfThickness = Math.max(halfThickness, stop.halfWidth);

		for (let j = 0; j < stops.length - 1; j++) {
			const p0 = stops[j];
			const p1 = stops[j + 1];
			const span = p1.u - p0.u;
			if (span <= EPSILON) continue;
			const topSlope = (p1.railTop - p0.railTop) / span;
			const baseSlope = (p1.baseY - p0.baseY) / span;
			const topAt = (u: number) => p0.railTop + topSlope * (u - p0.u);
			const baseLineAt = (u: number) => p0.baseY + baseSlope * (u - p0.u);
			minY = Math.min(minY, p0.baseY, p1.baseY);

			// Top rail piece for this bay.
			let u0 = p0.u;
			let startCut = left;
			if (p0.above) u0 = p0.u + p0.halfWidth * RAIL_INSET;
			else if (p0.vertex >= 0) {
				const join = vertexJoin[p0.vertex];
				if (!join) u0 = p0.u - p0.halfWidth - style.topRail.overhang;
				else if ('miter' in join) startCut = join.miter;
			}
			let u1 = p1.u;
			let endCut = left;
			if (p1.above) u1 = p1.u - p1.halfWidth * RAIL_INSET;
			else if (p1.vertex >= 0) {
				const join = vertexJoin[p1.vertex];
				if (!join) u1 = p1.u + p1.halfWidth + style.topRail.overhang;
				else if ('miter' in join) endCut = join.miter;
			}
			if (u1 - u0 > EPSILON) {
				const s0 = at(u0);
				const s1 = at(u1);
				layout.rails.push({
					kind: 'rail',
					role: 'top-rail',
					segmentIndex: s,
					ax: s0.x,
					az: s0.z,
					bx: s1.x,
					bz: s1.z,
					dirX: dir.x,
					dirZ: dir.z,
					yA: topAt(u0),
					slope: topSlope,
					width: style.topRail.width,
					height: railH,
					profile: style.topRail.profile,
					startCut,
					endCut
				});
			}

			// Lower rails always die into both posts.
			const inner0 = p0.u + p0.halfWidth * RAIL_INSET;
			const inner1 = p1.u - p1.halfWidth * RAIL_INSET;
			const pushLowRail = (role: BarrierRailRole, yA: number, slope: number) => {
				if (inner1 - inner0 <= EPSILON) return;
				const s0 = at(inner0);
				const s1 = at(inner1);
				layout.rails.push({
					kind: 'rail',
					role,
					segmentIndex: s,
					ax: s0.x,
					az: s0.z,
					bx: s1.x,
					bz: s1.z,
					dirX: dir.x,
					dirZ: dir.z,
					yA,
					slope,
					width: style.bottomRail.width,
					height: style.bottomRail.thickness,
					profile: 'rectangular',
					startCut: left,
					endCut: left
				});
			};
			const bottomTop = (u: number) => baseLineAt(u) + lift + style.bottomRail.height;
			if (style.bottomRail.enabled) pushLowRail('bottom-rail', bottomTop(inner0), baseSlope);
			if (style.midRails > 0) {
				const lowAt = (u: number) =>
					style.bottomRail.enabled ? bottomTop(u) : baseLineAt(u) + lift + style.baluster.clearance;
				const highAt = (u: number) => topAt(u) - railH;
				for (let k = 1; k <= style.midRails; k++) {
					const f = k / (style.midRails + 1);
					const yAt = (u: number) =>
						lowAt(u) + f * (highAt(u) - lowAt(u)) + style.bottomRail.thickness / 2;
					pushLowRail('mid-rail', yAt(inner0), (yAt(inner1) - yAt(inner0)) / (inner1 - inner0));
				}
			}

			// Balusters, balanced between the two post faces.
			if (style.baluster.style !== 'none') {
				const face0 = p0.u + p0.halfWidth;
				const face1 = p1.u - p1.halfWidth;
				const { count: balusterCount, spacing } = distributeBalusters(
					face1 - face0,
					style.balusterSpacing,
					style.baluster.width
				);
				for (let k = 0; k < balusterCount; k++) {
					const u = face0 + spacing * (k + 1);
					const p = at(u);
					const topY = topAt(u) - railH + OVERLAP;
					let baseY: number;
					if (style.bottomRail.enabled) baseY = bottomTop(u) - OVERLAP;
					else if (input.balusterBase) baseY = input.balusterBase(p.x, p.z) - BALUSTER_SINK;
					else if (baseMode === 'follow-surface')
						baseY = sample(p.x, p.z, baseLineAt(u)) + style.baluster.clearance - BALUSTER_SINK;
					else baseY = baseLineAt(u) + style.baluster.clearance;
					if (topY - baseY < 0.05) continue;
					layout.balusters.push({
						kind: 'baluster',
						segmentIndex: s,
						x: p.x,
						z: p.z,
						yaw: segYaw,
						baseY,
						topY
					});
					minY = Math.min(minY, baseY);
				}
			}
		}

		for (const post of layout.posts) {
			if (post.segmentIndex !== s && !(post.vertexIndex === ia || post.vertexIndex === ib))
				continue;
			minY = Math.min(minY, post.baseY);
			maxY = Math.max(maxY, post.topY + (post.cap ? capHeight(post.cap, post.style.width) : 0));
		}
		for (const stop of stops) maxY = Math.max(maxY, stop.railTop);
		layout.segments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, halfThickness, minY, maxY });
	}

	return layout;
}

/** How tall each cap style stands above its post top — layout uses it for envelopes only. */
export function capHeight(cap: BarrierPostCap, postWidth: number): number {
	switch (cap) {
		case 'flat':
			return postWidth * 0.18;
		case 'bevelled':
			return postWidth * 0.3;
		case 'pyramid':
			return postWidth * 0.62;
		case 'ball':
			return postWidth * 1.05;
		case 'turned':
			return postWidth * 1.35;
	}
}

/** Total structural member count (what the layout would have to author by hand without this system). */
export function barrierMemberCount(layout: BarrierLayout): number {
	return layout.posts.length + layout.balusters.length + layout.rails.length + layout.joints.length;
}

function convexHull(points: Point2D[]): Point2D[] {
	const sorted = [...points].sort((p, q) => p.x - q.x || p.z - q.z);
	const cross = (o: Point2D, a: Point2D, b: Point2D) =>
		(a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
	const lower: Point2D[] = [];
	for (const p of sorted) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
			lower.pop();
		lower.push(p);
	}
	const upper: Point2D[] = [];
	for (let i = sorted.length - 1; i >= 0; i--) {
		const p = sorted[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
			upper.pop();
		upper.push(p);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
