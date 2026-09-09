import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingMaterialManager } from './BuildingMaterialManager';
import { FRAME_BEAM_END_OVERHANG, frameBeamTopY, framePostTopY } from './buildingVisualInsets';
import { buildingGridToLocal } from './FoundationLocalMath';
import type { WallFrameOverride } from './WallTypes';
import type { WallPathDefinition } from './WallPathTypes';
import {
	add,
	buildSegmentFootprint,
	computeWallPathJoints,
	normalize2D,
	orientJoinForSegmentEnd,
	perpLeft,
	scale,
	sub
} from './wallPathMath';
import type { JoinPoints, Point2D } from './wallPathMath';

/** Top plate height is twice the post face-width so the cap reads as the same timber thickness on the wall face. */
const TOP_BEAM_TO_POST_WIDTH = 2;

/**
 * The subset of `BuildingSettings` this module actually reads — kept as its own small interface, same
 * "decoupled from the debug-GUI settings shape" convention `OpeningVisualSettings` already follows.
 */
export interface WallFrameSettings {
	wallFrameEnabled: boolean;
	wallFrameWidth: number;
	wallFrameDepthExtra: number;
	showWallFrameBounds: boolean;
	showWallFrameJoins: boolean;
}

interface ResolvedFrameStyle {
	enabled: boolean;
	/** Post face-width along the wall. The top beam's vertical thickness is twice this. */
	width: number;
	/** How far the frame protrudes past each wall face, added to `thickness / 2` on both sides. */
	depthExtra: number;
	material?: import('./MaterialTypes').BuildingMaterialDefinition;
}

/** Merges a global `WallFrameSettings` default with an optional per-wall/path `WallFrameOverride` — every override field independently inherits the default when absent, same convention `BuildingMaterialManager.getMaterial`'s `definition ?? default` already follows for paint. */
function resolveFrameStyle(
	settings: WallFrameSettings,
	override: WallFrameOverride | undefined
): ResolvedFrameStyle {
	return {
		enabled: override?.enabled ?? settings.wallFrameEnabled,
		width: override?.width ?? settings.wallFrameWidth,
		depthExtra: override?.depth ?? settings.wallFrameDepthExtra,
		material: override?.material
	};
}

const debugJoinMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a3d, depthTest: false });
const debugBoundsMaterial = new THREE.LineBasicMaterial({ color: 0xff8a3d });

/** Fan-triangulated extrusion of a (foundation-local X/Z) polygon from minY to maxY — same algorithm `WallPathGeometryBuilder`'s own (unexported) `extrudePolygon` uses, kept as its own small copy here so this module stays decoupled, per this codebase's usual one-small-file-per-concern convention. */
function extrudePolygon(
	polygon: readonly Point2D[],
	minY: number,
	maxY: number
): THREE.BufferGeometry | null {
	const n = polygon.length;
	if (n < 3) return null;

	const positions: number[] = [];
	for (const p of polygon) positions.push(p.x, minY, p.z);
	for (const p of polygon) positions.push(p.x, maxY, p.z);

	const indices: number[] = [];
	for (let i = 0; i < n; i++) {
		const a = i;
		const b = (i + 1) % n;
		const aTop = n + i;
		const bTop = n + ((i + 1) % n);
		indices.push(a, b, bTop, a, bTop, aTop);
	}
	for (let i = 1; i < n - 1; i++) indices.push(0, i + 1, i);
	for (let i = 1; i < n - 1; i++) indices.push(n, n + i, n + i + 1);

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}

/** A small debug marker mesh at a corner post's centre — added only when `showWallFrameJoins` is on. */
function buildJoinMarker(center: Point2D, y: number, size: number): THREE.Mesh {
	const marker = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 5), debugJoinMaterial);
	marker.position.set(center.x, y, center.z);
	marker.name = 'debug-frame-join';
	return marker;
}

/** Wraps a merged frame mesh (already `castShadow`/`receiveShadow`) plus optional debug children into one disposable group — mirrors `OpeningVisualBuilder`'s own `object`/`disposeOpeningVisual` shape so callers can treat both derived-geometry systems identically. */
function wrapFrame(mesh: THREE.Mesh, debugChildren: THREE.Object3D[]): THREE.Group {
	const group = new THREE.Group();
	group.name = 'wall-frame';
	group.add(mesh);
	for (const child of debugChildren) group.add(child);
	return group;
}

/** Disposes every mesh/line geometry under a wall-frame group (never its materials — cached via `BuildingMaterialManager`, or one of this module's own never-disposed debug-wireframe constants) and detaches it. Call on rebuild (before building the replacement) and on the owning wall/path's removal — mirrors `disposeOpeningVisual`. */
export function disposeWallFrame(group: THREE.Object3D): void {
	group.traverse((child) => {
		if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
			child.geometry.dispose();
		}
	});
	group.removeFromParent();
}

/**
 * Builds one standalone wall's edge framing — a left post (centred at U=0), a right post (centred at
 * U=`length`), and a top beam that spans the wall and overhangs each end slightly so its end faces
 * are not coplanar with the wall's (see `FRAME_BEAM_END_OVERHANG`). The beam caps the wall just below
 * the authored wall height so a slab sitting on that storey (and the wall body itself) never share
 * its top plane — see buildingVisualInsets.ts. Posts stop inside the beam rather than reaching the
 * same top. Merged into ONE mesh, entirely in the SAME wall-local (U along the wall, Y vertical, Z
 * thickness) space `WallGeometryBuilder.buildWallGeometry` already uses, so it can be parented as a
 * child of the wall's own mesh (inheriting its `applyWallTransform` for free) exactly like
 * `WallManager`'s `openingVisuals` group. Returns `null` when framing is disabled or the wall is
 * degenerate.
 */
export function buildStandaloneWallFrame(
	length: number,
	height: number,
	thickness: number,
	settings: WallFrameSettings,
	override: WallFrameOverride | undefined,
	materialManager: BuildingMaterialManager
): THREE.Group | null {
	const style = resolveFrameStyle(settings, override);
	if (!style.enabled || length <= 0 || height <= 0) return null;

	const halfDepth = thickness / 2 + style.depthExtra;
	const fullDepth = halfDepth * 2;
	const boxes: THREE.BoxGeometry[] = [];

	const topHeight = style.width * TOP_BEAM_TO_POST_WIDTH;
	const beamTop = frameBeamTopY(height);
	const beamBottom = beamTop - topHeight;
	const postTop = framePostTopY(beamBottom, topHeight);

	const left = new THREE.BoxGeometry(style.width, postTop, fullDepth);
	left.translate(0, postTop / 2, 0);
	boxes.push(left);

	const right = new THREE.BoxGeometry(style.width, postTop, fullDepth);
	right.translate(length, postTop / 2, 0);
	boxes.push(right);

	const beamLength = length + FRAME_BEAM_END_OVERHANG * 2;
	const beam = new THREE.BoxGeometry(beamLength, topHeight, fullDepth);
	beam.translate(length / 2, (beamTop + beamBottom) / 2, 0);
	boxes.push(beam);

	const merged = mergeGeometries(boxes, false);
	for (const box of boxes) box.dispose();
	if (!merged) return null;

	const material = materialManager.getMaterial('wall-frame', style.material);
	const mesh = new THREE.Mesh(merged, material);
	mesh.name = 'wall-frame-solid';
	mesh.castShadow = true;
	mesh.receiveShadow = true;

	const debugChildren: THREE.Object3D[] = [];
	if (settings.showWallFrameBounds) {
		const edges = new THREE.EdgesGeometry(merged);
		debugChildren.push(new THREE.LineSegments(edges, debugBoundsMaterial));
	}
	if (settings.showWallFrameJoins) {
		debugChildren.push(buildJoinMarker({ x: 0, z: 0 }, beamTop, style.width * 0.6));
		debugChildren.push(buildJoinMarker({ x: length, z: 0 }, beamTop, style.width * 0.6));
	}

	return wrapFrame(mesh, debugChildren);
}

/**
 * One corner post that reaches both adjoining walls' outer faces — a single box, not two
 * side-by-side uprights. The AABB of the frame-thickness join (already at `halfThickness`) is
 * padded so it never shrinks inside the wall faces, even on a near-straight corner. Clockwise in
 * XZ so `extrudePolygon` sides face outward.
 */
function cornerPostFootprint(corner: Point2D, join: JoinPoints, halfThickness: number): Point2D[] {
	const points = [corner, ...join.left, ...join.right];
	let minX = Infinity;
	let maxX = -Infinity;
	let minZ = Infinity;
	let maxZ = -Infinity;
	for (const p of points) {
		minX = Math.min(minX, p.x);
		maxX = Math.max(maxX, p.x);
		minZ = Math.min(minZ, p.z);
		maxZ = Math.max(maxZ, p.z);
	}
	minX = Math.min(minX, corner.x - halfThickness);
	maxX = Math.max(maxX, corner.x + halfThickness);
	minZ = Math.min(minZ, corner.z - halfThickness);
	maxZ = Math.max(maxZ, corner.z + halfThickness);
	return [
		{ x: minX, z: minZ },
		{ x: minX, z: maxZ },
		{ x: maxX, z: maxZ },
		{ x: maxX, z: minZ }
	];
}

/** An open path endpoint's end-post footprint — oriented along its single adjoining segment's direction, straddling the endpoint exactly like a standalone wall's own end post (see `buildStandaloneWallFrame`'s left/right posts). */
function endPostFootprint(
	corner: Point2D,
	dir: Point2D,
	halfThickness: number,
	halfSize: number
): Point2D[] {
	const perp = perpLeft(dir);
	const forward = scale(dir, halfSize);
	const backward = scale(dir, -halfSize);
	const outer = scale(perp, halfThickness);
	const inner = scale(perp, -halfThickness);
	return [
		add(corner, add(forward, outer)),
		add(corner, add(forward, inner)),
		add(corner, add(backward, inner)),
		add(corner, add(backward, outer))
	];
}

/**
 * Builds one continuous wall path's ENTIRE edge framing — uprights per path VERTEX (never per
 * segment, so a shared corner like B in `A→B→C` is not built twice) plus a top beam per segment
 * whose horizontal footprint is derived from the SAME `buildSegmentFootprint`/`computeWallPathJoints`
 * miter/bevel math the wall body itself already uses (just with an expanded half-thickness —
 * `wallThickness/2 + depthExtra` — instead of the wall's own), so the beam automatically joins
 * cleanly at every corner without any separate join system. Open endpoints overhang the wall end
 * (`FRAME_BEAM_END_OVERHANG`) so the beam's end face is not coplanar with it; joined corners stay
 * on the miter. A joined corner is ONE post that
 * reaches both walls' outer faces (not two separate uprights). The top beam's vertical thickness
 * is twice the post face-width. All pieces are merged into ONE mesh, in FOUNDATION-LOCAL X/Z/Y
 * (matching `buildWallPath`'s own `visibleGeometry` convention), meant for a mesh added directly
 * to the path's BuildingRoot with no further transform — see `WallPathManager.rebuildEntry`.
 * Returns `null` when framing is disabled or the path is degenerate.
 */
export function buildWallPathFrame(
	path: WallPathDefinition,
	buildingGridSize: number,
	settings: WallFrameSettings,
	materialManager: BuildingMaterialManager
): THREE.Group | null {
	const style = resolveFrameStyle(settings, path.frameStyle);
	if (!style.enabled) return null;

	const localPoints: Point2D[] = path.points.map((p) => {
		const local = buildingGridToLocal(p, buildingGridSize);
		return { x: local.localX, z: local.localZ };
	});
	const n = localPoints.length;
	if (n < 2) return null;

	const halfThickness = path.wallThickness / 2 + style.depthExtra;
	const joints = computeWallPathJoints(
		localPoints,
		path.closed,
		halfThickness,
		path.joinStyle,
		path.miterLimit
	);

	const segmentCount = path.closed ? n : n - 1;
	const topHeight = style.width * TOP_BEAM_TO_POST_WIDTH;
	const topY = frameBeamTopY(path.baseY + path.wallHeight);
	const beamMinY = topY - topHeight;
	const postTopY = framePostTopY(beamMinY, topHeight);
	const pieces: THREE.BufferGeometry[] = [];
	const joinMarkers: Point2D[] = [];

	// Top beam: one piece per segment, footprint derived exactly like the wall body's own join
	// handling (buildSegmentFootprint), just at the frame's own expanded half-thickness. Open
	// endpoints overhang the wall end so the beam's end face is not coplanar with it.
	for (let i = 0; i < segmentCount; i++) {
		const start = localPoints[i];
		const end = localPoints[(i + 1) % n];
		const startJointRaw = joints[i];
		const endJointRaw = joints[(i + 1) % n];
		const startJoin = startJointRaw ? orientJoinForSegmentEnd(startJointRaw, true) : null;
		const endJoin = endJointRaw ? orientJoinForSegmentEnd(endJointRaw, false) : null;
		const dir = normalize2D(sub(end, start));
		const beamStart = startJoin ? start : add(start, scale(dir, -FRAME_BEAM_END_OVERHANG));
		const beamEnd = endJoin ? end : add(end, scale(dir, FRAME_BEAM_END_OVERHANG));
		const footprint = buildSegmentFootprint(beamStart, beamEnd, startJoin, endJoin, halfThickness);
		const geom = extrudePolygon(footprint, beamMinY, topY);
		if (geom) pieces.push(geom);
	}

	// One upright per path VERTEX — never per segment. A joined corner is a single edge-to-edge
	// post; an open endpoint is a plain end post.
	const minHalfSize = style.width / 2;
	for (let i = 0; i < n; i++) {
		const join = joints[i];
		const corner = localPoints[i];
		let footprint: Point2D[];
		if (join) {
			footprint = cornerPostFootprint(corner, join, halfThickness);
		} else {
			const neighbor = i === 0 ? localPoints[1] : localPoints[n - 2];
			footprint = endPostFootprint(
				corner,
				normalize2D(sub(neighbor, corner)),
				halfThickness,
				minHalfSize
			);
		}
		const geom = extrudePolygon(footprint, path.baseY, postTopY);
		if (geom) pieces.push(geom);
		joinMarkers.push(corner);
	}

	if (pieces.length === 0) return null;
	const merged = mergeGeometries(pieces, false);
	for (const piece of pieces) piece.dispose();
	if (!merged) return null;

	const material = materialManager.getMaterial('wall-frame', style.material);
	const mesh = new THREE.Mesh(merged, material);
	mesh.name = 'wall-frame-solid';
	mesh.castShadow = true;
	mesh.receiveShadow = true;

	const debugChildren: THREE.Object3D[] = [];
	if (settings.showWallFrameBounds) {
		const edges = new THREE.EdgesGeometry(merged);
		debugChildren.push(new THREE.LineSegments(edges, debugBoundsMaterial));
	}
	if (settings.showWallFrameJoins) {
		for (const corner of joinMarkers) {
			debugChildren.push(buildJoinMarker(corner, topY, style.width * 0.6));
		}
	}

	return wrapFrame(mesh, debugChildren);
}

const MIN_FOUNDATION_SPAN = 0.05;

/**
 * Edge framing for a foundation cuboid — the same closed-path recipe as polygon-wall framing
 * (one post per corner, a top beam per side, mitered joins, identical timber insets). The path
 * is inset by half the current wall thickness so each "wall" sits flush with the foundation's
 * outer face, and `wallFrameDepthExtra` protrudes past that face exactly as it does on a real wall.
 * Coordinates are world XZ / world Y, matching FoundationMesh. Returns `null` when framing is off
 * or the footprint is degenerate.
 */
export function buildFoundationFrame(
	bounds: {
		id: string;
		minX: number;
		maxX: number;
		minZ: number;
		maxZ: number;
		bottomY: number;
		topY: number;
	},
	settings: WallFrameSettings,
	wallThickness: number,
	miterLimit: number,
	materialManager: BuildingMaterialManager
): THREE.Group | null {
	const spanX = bounds.maxX - bounds.minX;
	const spanZ = bounds.maxZ - bounds.minZ;
	const height = bounds.topY - bounds.bottomY;
	if (spanX < MIN_FOUNDATION_SPAN || spanZ < MIN_FOUNDATION_SPAN || height <= 0) return null;

	const thickness = Math.min(Math.max(0, wallThickness), spanX * 0.45, spanZ * 0.45);
	const inset = thickness / 2;
	const path: WallPathDefinition = {
		id: `foundation-frame-${bounds.id}`,
		foundationId: bounds.id,
		points: [
			{ gridX: bounds.minX + inset, gridZ: bounds.minZ + inset },
			{ gridX: bounds.maxX - inset, gridZ: bounds.minZ + inset },
			{ gridX: bounds.maxX - inset, gridZ: bounds.maxZ - inset },
			{ gridX: bounds.minX + inset, gridZ: bounds.maxZ - inset }
		],
		closed: true,
		baseY: bounds.bottomY,
		wallHeight: height,
		wallThickness: thickness,
		joinStyle: 'miter',
		miterLimit,
		segments: [
			{ id: 'foundation-frame-n', openings: [] },
			{ id: 'foundation-frame-e', openings: [] },
			{ id: 'foundation-frame-s', openings: [] },
			{ id: 'foundation-frame-w', openings: [] }
		]
	};
	const group = buildWallPathFrame(path, 1, settings, materialManager);
	if (group) group.name = 'foundation-frame';
	return group;
}
