/**
 * Integer grid math for Mini Builds. Pure and Three.js-free so the compiler, validator, editor state
 * and tests all share exactly one definition of "where is this block".
 */
import {
	MINI_BUILD_COMPILER_VERSION,
	MINI_BUILD_LIMITS,
	MINI_BUILD_ROTATION,
	MINI_BUILD_WORLD_LIMITS,
	type GridVec3,
	type MiniBuildBlock,
	type MiniBuildBlockRotation,
	type MiniBuildBounds,
	type MiniBuildDefinition,
	type MiniBuildInteractionLocation,
	type MiniBuildMaterialSlot,
	type QuarterTurn,
	type SnapAngle,
	type WorldChunkId
} from './MiniBuildTypes';

export type Axis = 'x' | 'y' | 'z';
export const AXES: readonly Axis[] = ['x', 'y', 'z'];

export function gridToMeters(value: number): number {
	return value * MINI_BUILD_LIMITS.gridSize;
}

/** Nearest grid unit. Used for every metre value entering the system (inputs, drags). */
export function metersToGrid(meters: number): number {
	if (!Number.isFinite(meters)) return 0;
	return Math.round(meters / MINI_BUILD_LIMITS.gridSize);
}

export function snapMeters(meters: number): number {
	return gridToMeters(metersToGrid(meters));
}

export function isQuarterTurn(value: unknown): value is QuarterTurn {
	return value === 0 || value === 90 || value === 180 || value === 270;
}

export function nextQuarterTurn(turn: QuarterTurn): QuarterTurn {
	return ((turn + 90) % 360) as QuarterTurn;
}

export function normalizeQuarterTurn(degrees: number): QuarterTurn {
	if (!Number.isFinite(degrees)) return 0;
	const snapped = Math.round(degrees / 90) * 90;
	return ((((snapped % 360) + 360) % 360) + 0) as QuarterTurn;
}

// ---------------------------------------------------------------------------------------------
// Snap angles. All arithmetic runs in whole 7.5° units (48 per turn), so no sequence of steps can
// accumulate floating-point error — see MINI_BUILD_ROTATION.

const UNITS_PER_TURN = Math.round(360 / MINI_BUILD_ROTATION.unitDegrees);

function angleUnits(degrees: number): number {
	const units = Math.round(degrees / MINI_BUILD_ROTATION.unitDegrees) % UNITS_PER_TURN;
	return units < 0 ? units + UNITS_PER_TURN : units;
}

function unitsToAngle(units: number): SnapAngle {
	return (
		(((units % UNITS_PER_TURN) + UNITS_PER_TURN) % UNITS_PER_TURN) * MINI_BUILD_ROTATION.unitDegrees
	);
}

/** A stored angle: a whole number of 7.5° units in [0, 360). */
export function isSnapAngle(value: unknown): value is SnapAngle {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 360)
		return false;
	return Number.isInteger(value / MINI_BUILD_ROTATION.unitDegrees);
}

export function isRotationSnapStep(
	value: unknown
): value is (typeof MINI_BUILD_ROTATION.snapSteps)[number] {
	return (MINI_BUILD_ROTATION.snapSteps as readonly unknown[]).includes(value);
}

/** Any angle → the nearest whole multiple of `step` (default: the 7.5° unit), wrapped to [0, 360). */
export function snapAngle(
	degrees: number,
	step: number = MINI_BUILD_ROTATION.unitDegrees
): SnapAngle {
	if (!Number.isFinite(degrees)) return 0;
	const stepUnits = Math.max(1, Math.round(step / MINI_BUILD_ROTATION.unitDegrees));
	const units = Math.round(degrees / MINI_BUILD_ROTATION.unitDegrees);
	return unitsToAngle(Math.round(units / stepUnits) * stepUnits);
}

/**
 * Turns by `direction` steps of `step` degrees. An angle that is not on the step's grid (it was set
 * with a finer step) first snaps to the neighbouring step-grid angle in the direction of travel, so
 * pressing rotate always lands on a "round" angle for the current step and never skips past one.
 */
export function stepAngle(angle: SnapAngle, step: number, direction: 1 | -1 = 1): SnapAngle {
	const stepUnits = Math.max(1, Math.round(step / MINI_BUILD_ROTATION.unitDegrees));
	const units = angleUnits(angle);
	const offGrid = units % stepUnits;
	if (offGrid !== 0)
		return unitsToAngle(direction > 0 ? units - offGrid + stepUnits : units - offGrid);
	return unitsToAngle(units + direction * stepUnits);
}

/** Signed shortest turn from `from` to `to`, in 7.5° units (−24…24). */
export function angleDeltaUnits(from: SnapAngle, to: SnapAngle): number {
	let delta = angleUnits(to) - angleUnits(from);
	if (delta > UNITS_PER_TURN / 2) delta -= UNITS_PER_TURN;
	if (delta < -UNITS_PER_TURN / 2) delta += UNITS_PER_TURN;
	return delta;
}

/** One 7.5° unit forward or back. */
export function stepAngleUnit(angle: SnapAngle, direction: 1 | -1): SnapAngle {
	return unitsToAngle(angleUnits(angle) + direction);
}

/** The quarter turn at or below an angle — the part of a block's rotation its grid box follows. */
export function quarterOf(angle: SnapAngle): QuarterTurn {
	return (Math.floor(angleUnits(angle) / (UNITS_PER_TURN / 4)) * 90) as QuarterTurn;
}

export function quarterRotation(rotation: MiniBuildBlockRotation): {
	x: QuarterTurn;
	y: QuarterTurn;
	z: QuarterTurn;
} {
	return { x: quarterOf(rotation.x), y: quarterOf(rotation.y), z: quarterOf(rotation.z) };
}

/** True when any angle is not a quarter turn — the block is not a grid-aligned box. */
export function isAngledRotation(rotation: MiniBuildBlockRotation): boolean {
	return !isQuarterTurn(rotation.x) || !isQuarterTurn(rotation.y) || !isQuarterTurn(rotation.z);
}

export function isAngledBlock(block: Pick<MiniBuildBlock, 'rotation'>): boolean {
	return isAngledRotation(block.rotation);
}

type Matrix3 = [number, number, number, number, number, number, number, number, number];

function cosSin(turn: QuarterTurn): [number, number] {
	switch (turn) {
		case 0:
			return [1, 0];
		case 90:
			return [0, 1];
		case 180:
			return [-1, 0];
		case 270:
			return [0, -1];
	}
}

/** cos/sin of a snap angle — exact at quarter turns, so axis-aligned results stay integers. */
export function snapCosSin(angle: SnapAngle): [number, number] {
	if (isQuarterTurn(angle)) return cosSin(angle);
	const radians = (angle * Math.PI) / 180;
	return [Math.cos(radians), Math.sin(radians)];
}

function multiply(a: Matrix3, b: Matrix3): Matrix3 {
	const out = new Array(9).fill(0) as Matrix3;
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 3; c++) {
			let sum = 0;
			for (let k = 0; k < 3; k++) sum += a[r * 3 + k] * b[k * 3 + c];
			out[r * 3 + c] = sum;
		}
	}
	return out;
}

function eulerMatrix(x: SnapAngle, y: SnapAngle, z: SnapAngle): Matrix3 {
	const [cy, sy] = snapCosSin(y);
	const [cx, sx] = snapCosSin(x);
	const [cz, sz] = snapCosSin(z);
	const ry: Matrix3 = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
	const rx: Matrix3 = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
	const rz: Matrix3 = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
	return multiply(rz, multiply(rx, ry));
}

/**
 * Integer rotation matrix (row-major) of the block's *grid box*: the rotation with every angle
 * rounded down to a quarter turn, applied Y then X then Z (`v' = Rz · Rx · Ry · v`). For a block
 * that is not angled this is its whole rotation.
 */
export function rotationMatrix(rotation: MiniBuildBlockRotation): Matrix3 {
	const q = quarterRotation(rotation);
	return eulerMatrix(q.x, q.y, q.z);
}

/** The block's full rotation (row-major, `Rz · Rx · Ry`) — what the visible cuboid uses. */
export function orientationMatrix(rotation: MiniBuildBlockRotation): Matrix3 {
	return eulerMatrix(rotation.x, rotation.y, rotation.z);
}

/** The block's grid-box extents along world X/Y/Z — always a permutation of `sizeGrid`. */
export function effectiveSize(block: Pick<MiniBuildBlock, 'sizeGrid' | 'rotation'>): GridVec3 {
	const m = rotationMatrix(block.rotation);
	const { x, y, z } = block.sizeGrid;
	return {
		x: Math.abs(m[0] * x + m[1] * y + m[2] * z),
		y: Math.abs(m[3] * x + m[4] * y + m[5] * z),
		z: Math.abs(m[6] * x + m[7] * y + m[8] * z)
	};
}

/** Which world axis (0 = X, 1 = Y, 2 = Z) the block's local X ("grain") axis ends up on. */
export function grainAxis(rotation: MiniBuildBlockRotation): 0 | 1 | 2 {
	const m = rotationMatrix(rotation);
	if (m[0] !== 0) return 0;
	if (m[3] !== 0) return 1;
	return 2;
}

/**
 * Local sizes that produce the requested effective size under `rotation` — the inverse of
 * `effectiveSize`, used when the editor's Size X/Y/Z fields (world axes) change a rotated block.
 */
export function localSizeForEffective(
	effective: GridVec3,
	rotation: MiniBuildBlockRotation
): GridVec3 {
	const m = rotationMatrix(rotation);
	// Rotation matrices are orthogonal, so the inverse is the transpose.
	return {
		x: Math.abs(m[0] * effective.x + m[3] * effective.y + m[6] * effective.z),
		y: Math.abs(m[1] * effective.x + m[4] * effective.y + m[7] * effective.z),
		z: Math.abs(m[2] * effective.x + m[5] * effective.y + m[8] * effective.z)
	};
}

/** Number of zero-size axes in a size vector: 0 for a cuboid, 1 for a plane. */
export function flatAxisCount(size: GridVec3): number {
	return (size.x === 0 ? 1 : 0) + (size.y === 0 ? 1 : 0) + (size.z === 0 ? 1 : 0);
}

/** The world axis a plane is flat on, or null for a cuboid. */
export function flatAxis(size: GridVec3): Axis | null {
	if (size.x === 0) return 'x';
	if (size.y === 0) return 'y';
	if (size.z === 0) return 'z';
	return null;
}

export function isPlaneBlock(block: Pick<MiniBuildBlock, 'sizeGrid'>): boolean {
	return flatAxisCount(block.sizeGrid) > 0;
}

export interface GridBox {
	min: GridVec3;
	max: GridVec3;
}

/**
 * The block's grid box: its effective box under the quarter-turn part of its rotation. For an
 * ordinary block this is exactly the cuboid; an angled block turns about this box's centre.
 */
export function blockBox(
	block: Pick<MiniBuildBlock, 'positionGrid' | 'sizeGrid' | 'rotation'>
): GridBox {
	const size = effectiveSize(block);
	const p = block.positionGrid;
	return {
		min: { x: p.x, y: p.y, z: p.z },
		max: { x: p.x + size.x, y: p.y + size.y, z: p.z + size.z }
	};
}

/** Centre of the block's grid box (and pivot of an angled block), in grid units — may be a half unit. */
export function blockCenterGrid(
	block: Pick<MiniBuildBlock, 'positionGrid' | 'sizeGrid' | 'rotation'>
): GridVec3 {
	const size = effectiveSize(block);
	const p = block.positionGrid;
	return { x: p.x + size.x / 2, y: p.y + size.y / 2, z: p.z + size.z / 2 };
}

/** The eight corners of the visible cuboid in grid units (a plane's corners coincide in pairs). */
export function blockCornersGrid(
	block: Pick<MiniBuildBlock, 'positionGrid' | 'sizeGrid' | 'rotation'>
): GridVec3[] {
	const m = orientationMatrix(block.rotation);
	const c = blockCenterGrid(block);
	const h = { x: block.sizeGrid.x / 2, y: block.sizeGrid.y / 2, z: block.sizeGrid.z / 2 };
	const corners: GridVec3[] = [];
	for (const sx of [-1, 1])
		for (const sy of [-1, 1])
			for (const sz of [-1, 1]) {
				const lx = sx * h.x;
				const ly = sy * h.y;
				const lz = sz * h.z;
				corners.push({
					x: c.x + m[0] * lx + m[1] * ly + m[2] * lz,
					y: c.y + m[3] * lx + m[4] * ly + m[5] * lz,
					z: c.z + m[6] * lx + m[7] * ly + m[8] * lz
				});
			}
	return corners;
}

/** Tolerance when rounding an angled block's corners out to the grid (rotations are never exact). */
const EXTENT_EPSILON = 1e-6;

/**
 * Smallest grid box containing everything the block draws. Identical to `blockBox` for an ordinary
 * block; an angled block's turned corners are rounded outwards to whole grid units, so bounds,
 * workspace limits and grounding stay integer.
 */
export function blockExtentBox(
	block: Pick<MiniBuildBlock, 'positionGrid' | 'sizeGrid' | 'rotation'>
): GridBox {
	if (!isAngledBlock(block)) return blockBox(block);
	const min = { x: Infinity, y: Infinity, z: Infinity };
	const max = { x: -Infinity, y: -Infinity, z: -Infinity };
	for (const corner of blockCornersGrid(block)) {
		for (const axis of AXES) {
			min[axis] = Math.min(min[axis], corner[axis]);
			max[axis] = Math.max(max[axis], corner[axis]);
		}
	}
	for (const axis of AXES) {
		min[axis] = Math.floor(min[axis] + EXTENT_EPSILON);
		max[axis] = Math.ceil(max[axis] - EXTENT_EPSILON);
	}
	return { min, max };
}

export function computeBounds(blocks: readonly MiniBuildBlock[]): MiniBuildBounds {
	if (blocks.length === 0) {
		return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
	}
	const min = { x: Infinity, y: Infinity, z: Infinity };
	const max = { x: -Infinity, y: -Infinity, z: -Infinity };
	for (const block of blocks) {
		const box = blockExtentBox(block);
		for (const axis of AXES) {
			min[axis] = Math.min(min[axis], box.min[axis]);
			max[axis] = Math.max(max[axis], box.max[axis]);
		}
	}
	return { min, max };
}

export function boundsSizeGrid(bounds: MiniBuildBounds): GridVec3 {
	return {
		x: bounds.max.x - bounds.min.x,
		y: bounds.max.y - bounds.min.y,
		z: bounds.max.z - bounds.min.z
	};
}

export function boundsFit(bounds: MiniBuildBounds): boolean {
	const size = boundsSizeGrid(bounds);
	const max = MINI_BUILD_LIMITS.maxBoundsGrid;
	return size.x <= max.x && size.y <= max.y && size.z <= max.z;
}

/** Every block inside the editor workspace (X/Z ±4m around the origin, Y from the floor to 4m). */
export function blockInWorkspace(block: MiniBuildBlock): boolean {
	const box = blockExtentBox(block);
	const half = MINI_BUILD_LIMITS.workspaceHalfGrid;
	return (
		box.min.x >= -half &&
		box.max.x <= half &&
		box.min.z >= -half &&
		box.max.z <= half &&
		box.min.y >= 0 &&
		box.max.y <= MINI_BUILD_LIMITS.maxBoundsGrid.y
	);
}

/**
 * Shifts every block so the lowest point sits on Y = 0 — saved designs never float above (or sink
 * below) their placement anchor.
 */
export function groundBlocks(blocks: readonly MiniBuildBlock[]): MiniBuildBlock[] {
	if (blocks.length === 0) return [];
	const minY = computeBounds(blocks).min.y;
	return blocks.map((block) => ({
		...block,
		positionGrid: { ...block.positionGrid, y: block.positionGrid.y - minY },
		sizeGrid: { ...block.sizeGrid },
		rotation: { ...block.rotation }
	}));
}

/** Anchor in grid units: bottom-centre of the bounds. X/Z may be half-units for odd widths. */
export function anchorGrid(bounds: MiniBuildBounds): GridVec3 {
	return {
		x: (bounds.min.x + bounds.max.x) / 2,
		y: bounds.min.y,
		z: (bounds.min.z + bounds.max.z) / 2
	};
}

/** Design bounds in metres relative to the anchor (what the world sees). */
export function localBoundsMeters(bounds: MiniBuildBounds): {
	min: GridVec3;
	max: GridVec3;
} {
	const anchor = anchorGrid(bounds);
	return {
		min: {
			x: gridToMeters(bounds.min.x - anchor.x),
			y: gridToMeters(bounds.min.y - anchor.y),
			z: gridToMeters(bounds.min.z - anchor.z)
		},
		max: {
			x: gridToMeters(bounds.max.x - anchor.x),
			y: gridToMeters(bounds.max.y - anchor.y),
			z: gridToMeters(bounds.max.z - anchor.z)
		}
	};
}

/**
 * Rotates a local (x, z) offset by a quarter turn about +Y, matching `THREE.Matrix4.makeRotationY`
 * (so instanced render matrices, collision and picking all agree).
 */
export function rotateQuarterY(x: number, z: number, turn: QuarterTurn): { x: number; z: number } {
	switch (turn) {
		case 0:
			return { x, z };
		case 90:
			return { x: z, z: -x };
		case 180:
			return { x: -x, z: -z };
		case 270:
			return { x: -z, z: x };
	}
}

/** `rotateQuarterY` for any snap angle (exact at quarter turns). */
export function rotateY(x: number, z: number, angle: SnapAngle): { x: number; z: number } {
	if (isQuarterTurn(angle)) return rotateQuarterY(x, z, angle);
	const [c, s] = snapCosSin(angle);
	return { x: x * c + z * s, z: -x * s + z * c };
}

export interface WorldAabb {
	minX: number;
	minY: number;
	minZ: number;
	maxX: number;
	maxY: number;
	maxZ: number;
}

/**
 * A local metre box (relative to the anchor) placed at `position` with a yaw — the world AABB that
 * contains it. Exact for quarter turns; for other angles it bounds the turned footprint (use
 * `transformLocalObb` where the real, oriented shape matters).
 */
export function transformLocalBox(
	min: GridVec3,
	max: GridVec3,
	position: { x: number; y: number; z: number },
	angle: SnapAngle
): WorldAabb {
	if (isQuarterTurn(angle)) {
		const a = rotateQuarterY(min.x, min.z, angle);
		const b = rotateQuarterY(max.x, max.z, angle);
		return {
			minX: position.x + Math.min(a.x, b.x),
			maxX: position.x + Math.max(a.x, b.x),
			minY: position.y + min.y,
			maxY: position.y + max.y,
			minZ: position.z + Math.min(a.z, b.z),
			maxZ: position.z + Math.max(a.z, b.z)
		};
	}
	return obbAabb(transformLocalObb(min, max, position, angle));
}

/**
 * A box in the world's horizontal plane, extruded over a Y range: centre, half extents along its own
 * axes, and its yaw as cos/sin. The box's own X axis points along (cos, −sin) in world X/Z — the
 * `THREE.Matrix4.makeRotationY` convention — and its own Z axis along (sin, cos).
 */
export interface WorldObb {
	centerX: number;
	centerZ: number;
	halfX: number;
	halfZ: number;
	cos: number;
	sin: number;
	minY: number;
	maxY: number;
}

/**
 * A local metre box (relative to the anchor), optionally turned by `boxYaw` about its own centre
 * first, placed at `position` with yaw `angle` — as an oriented box, so a 45° object collides as
 * itself rather than as the larger square around it.
 */
export function transformLocalObb(
	min: GridVec3,
	max: GridVec3,
	position: { x: number; y: number; z: number },
	angle: SnapAngle,
	boxYaw: SnapAngle = 0
): WorldObb {
	const centre = rotateY((min.x + max.x) / 2, (min.z + max.z) / 2, angle);
	const [cos, sin] = snapCosSin(snapAngle(angle + boxYaw));
	return {
		centerX: position.x + centre.x,
		centerZ: position.z + centre.z,
		halfX: (max.x - min.x) / 2,
		halfZ: (max.z - min.z) / 2,
		cos,
		sin,
		minY: position.y + min.y,
		maxY: position.y + max.y
	};
}

/** Footprint corners (x, z) of an oriented box. */
export function obbCorners(box: WorldObb, inset = 0): [number, number][] {
	const hx = Math.max(0, box.halfX - inset);
	const hz = Math.max(0, box.halfZ - inset);
	const out: [number, number][] = [];
	for (const [sx, sz] of [
		[-1, -1],
		[1, -1],
		[1, 1],
		[-1, 1]
	]) {
		const lx = sx * hx;
		const lz = sz * hz;
		out.push([
			box.centerX + lx * box.cos + lz * box.sin,
			box.centerZ - lx * box.sin + lz * box.cos
		]);
	}
	return out;
}

export function obbAabb(box: WorldObb): WorldAabb {
	const ex = Math.abs(box.cos) * box.halfX + Math.abs(box.sin) * box.halfZ;
	const ez = Math.abs(box.sin) * box.halfX + Math.abs(box.cos) * box.halfZ;
	return {
		minX: box.centerX - ex,
		maxX: box.centerX + ex,
		minY: box.minY,
		maxY: box.maxY,
		minZ: box.centerZ - ez,
		maxZ: box.centerZ + ez
	};
}

export function aabbToObb(box: WorldAabb): WorldObb {
	return {
		centerX: (box.minX + box.maxX) / 2,
		centerZ: (box.minZ + box.maxZ) / 2,
		halfX: (box.maxX - box.minX) / 2,
		halfZ: (box.maxZ - box.minZ) / 2,
		cos: 1,
		sin: 0,
		minY: box.minY,
		maxY: box.maxY
	};
}

/**
 * Separating-axis test for two oriented boxes. Like `aabbsOverlap`, boxes may touch or interpenetrate
 * by up to `gap` on any axis without counting as overlapping.
 */
export function obbsOverlap(a: WorldObb, b: WorldObb, gap = 0): boolean {
	if (!(a.minY < b.maxY - gap && a.maxY > b.minY + gap)) return false;
	const dx = b.centerX - a.centerX;
	const dz = b.centerZ - a.centerZ;
	// Each box's own X and Z axes in world X/Z.
	const axes: [number, number][] = [
		[a.cos, -a.sin],
		[a.sin, a.cos],
		[b.cos, -b.sin],
		[b.sin, b.cos]
	];
	for (const [ax, az] of axes) {
		const ra =
			a.halfX * Math.abs(a.cos * ax - a.sin * az) + a.halfZ * Math.abs(a.sin * ax + a.cos * az);
		const rb =
			b.halfX * Math.abs(b.cos * ax - b.sin * az) + b.halfZ * Math.abs(b.sin * ax + b.cos * az);
		if (Math.abs(dx * ax + dz * az) >= ra + rb - gap) return false;
	}
	return true;
}

export function aabbsOverlap(a: WorldAabb, b: WorldAabb, gap = 0): boolean {
	return (
		a.minX < b.maxX - gap &&
		a.maxX > b.minX + gap &&
		a.minY < b.maxY - gap &&
		a.maxY > b.minY + gap &&
		a.minZ < b.maxZ - gap &&
		a.maxZ > b.minZ + gap
	);
}

export function chunkCoordsForPosition(x: number, z: number): { cx: number; cz: number } {
	const size = MINI_BUILD_WORLD_LIMITS.chunkSize;
	return { cx: Math.floor(x / size), cz: Math.floor(z / size) };
}

/** An instance belongs to exactly one chunk: the one containing its anchor. */
export function chunkIdForPosition(x: number, z: number): WorldChunkId {
	const { cx, cz } = chunkCoordsForPosition(x, z);
	return chunkIdFromCoords(cx, cz);
}

export function chunkIdFromCoords(cx: number, cz: number): WorldChunkId {
	return `${cx}:${cz}`;
}

export function parseChunkId(id: WorldChunkId): { cx: number; cz: number } {
	const [cx, cz] = id.split(':').map(Number);
	return { cx, cz };
}

function fnv1a(text: string, seed: number): number {
	let hash = seed >>> 0;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

/**
 * Deterministic fingerprint of everything that affects compiled output: blocks (order matters for
 * coplanar-face ownership), materials and the compiler version. Names and timestamps are excluded,
 * so renaming never invalidates an asset or a thumbnail.
 */
export function contentHash(definition: Pick<MiniBuildDefinition, 'blocks' | 'materials'>): string {
	const parts: string[] = [`c${MINI_BUILD_COMPILER_VERSION}`];
	for (const block of definition.blocks) {
		const p = block.positionGrid;
		const s = block.sizeGrid;
		const r = block.rotation;
		parts.push(
			`b${block.shape ?? 'cuboid'}|${p.x},${p.y},${p.z}|${s.x},${s.y},${s.z}|${r.x},${r.y},${r.z}|${block.materialSlot}|${block.collision ?? 'auto'}|${block.layer ?? 0}`
		);
	}
	for (const slot of definition.materials) {
		// The texture joins the key only when set, so designs saved before textures keep their hash.
		parts.push(
			`m${slot.finish}|${materialKey(slot)}${slot.texture && slot.texture !== 'auto' ? `|${slot.texture}` : ''}`
		);
	}
	const text = parts.join(';');
	return (
		fnv1a(text, 0x811c9dc5).toString(16).padStart(8, '0') +
		fnv1a(text, 0x01000193 ^ 0x9e3779b9)
			.toString(16)
			.padStart(8, '0')
	);
}

export function materialKey(slot: Pick<MiniBuildMaterialSlot, 'material'>): string {
	return slot.material.type === 'color' ? slot.material.color.toUpperCase() : 'unknown';
}

/** "Chair", "Chair 2", "Chair 3" — display names may repeat, but defaults avoid it. */
export function uniqueName(base: string, existing: Iterable<string>): string {
	const trimmed = base.trim() || 'Untitled Build';
	const taken = new Set(Array.from(existing, (name) => name.trim().toLowerCase()));
	if (!taken.has(trimmed.toLowerCase())) return trimmed;
	const stem = trimmed.replace(/\s+\d+$/, '');
	for (let n = 2; n < 10_000; n++) {
		const candidate = `${stem} ${n}`;
		if (!taken.has(candidate.toLowerCase())) return candidate;
	}
	return `${stem} ${Date.now()}`;
}

export function sanitizeName(name: string): string {
	const collapsed = name.replace(/\s+/g, ' ').trim();
	return (collapsed || 'Untitled Build').slice(0, MINI_BUILD_LIMITS.maxNameLength);
}

export function cloneBlock(block: MiniBuildBlock): MiniBuildBlock {
	return {
		id: block.id,
		...(block.shape && block.shape !== 'cuboid' ? { shape: block.shape } : {}),
		positionGrid: { ...block.positionGrid },
		sizeGrid: { ...block.sizeGrid },
		rotation: { ...block.rotation },
		materialSlot: block.materialSlot,
		...(block.collision && block.collision !== 'auto' ? { collision: block.collision } : {}),
		// Layers only order planes; a block that is no longer flat drops its layer.
		...(block.layer && isPlaneBlock(block) ? { layer: block.layer } : {})
	};
}

export function cloneMaterials(
	materials: readonly MiniBuildMaterialSlot[]
): MiniBuildMaterialSlot[] {
	return materials.map((slot) => ({
		name: slot.name,
		finish: slot.finish,
		material: { ...slot.material },
		...(slot.texture && slot.texture !== 'auto' ? { texture: slot.texture } : {})
	}));
}

/** Copy logical interaction data explicitly: reactive UI proxies cannot be structured-cloned. */
export function cloneInteraction(
	location: MiniBuildInteractionLocation
): MiniBuildInteractionLocation {
	return {
		id: location.id,
		type: location.type,
		rotationY: location.rotationY,
		enabled: location.enabled,
		positionGrid: { ...location.positionGrid },
		collider: {
			type: location.collider.type,
			centerOffsetGrid: { ...location.collider.centerOffsetGrid },
			sizeGrid: { ...location.collider.sizeGrid }
		}
	};
}

export function cloneDefinition(definition: MiniBuildDefinition): MiniBuildDefinition {
	return {
		...definition,
		interactionLocations: (definition.interactionLocations ?? []).map(cloneInteraction),
		blocks: definition.blocks.map(cloneBlock),
		materials: cloneMaterials(definition.materials),
		bounds: {
			min: { ...definition.bounds.min },
			max: { ...definition.bounds.max }
		},
		anchor: { ...definition.anchor }
	};
}

export function newId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	// Non-secure contexts without randomUUID — still unique enough for local ids.
	return `mb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
