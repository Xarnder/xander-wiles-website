/**
 * Integer grid math for Mini Builds. Pure and Three.js-free so the compiler, validator, editor state
 * and tests all share exactly one definition of "where is this block".
 */
import {
	MINI_BUILD_COMPILER_VERSION,
	MINI_BUILD_LIMITS,
	MINI_BUILD_WORLD_LIMITS,
	type GridVec3,
	type MiniBuildBlock,
	type MiniBuildBlockRotation,
	type MiniBuildBounds,
	type MiniBuildDefinition,
	type MiniBuildMaterialSlot,
	type QuarterTurn,
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

/** Integer rotation matrix (row-major), applied Y then X then Z: `v' = Rz · Rx · Ry · v`. */
export function rotationMatrix(rotation: MiniBuildBlockRotation): Matrix3 {
	const [cy, sy] = cosSin(rotation.y);
	const [cx, sx] = cosSin(rotation.x);
	const [cz, sz] = cosSin(rotation.z);
	const ry: Matrix3 = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
	const rx: Matrix3 = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
	const rz: Matrix3 = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
	return multiply(rz, multiply(rx, ry));
}

/** The block's extents along world X/Y/Z after rotation — always a permutation of `sizeGrid`. */
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

export function blockBox(block: MiniBuildBlock): GridBox {
	const size = effectiveSize(block);
	const p = block.positionGrid;
	return {
		min: { x: p.x, y: p.y, z: p.z },
		max: { x: p.x + size.x, y: p.y + size.y, z: p.z + size.z }
	};
}

export function computeBounds(blocks: readonly MiniBuildBlock[]): MiniBuildBounds {
	if (blocks.length === 0) {
		return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
	}
	const min = { x: Infinity, y: Infinity, z: Infinity };
	const max = { x: -Infinity, y: -Infinity, z: -Infinity };
	for (const block of blocks) {
		const box = blockBox(block);
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
	const box = blockBox(block);
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

export interface WorldAabb {
	minX: number;
	minY: number;
	minZ: number;
	maxX: number;
	maxY: number;
	maxZ: number;
}

/** A local metre box (relative to the anchor) placed at `position` with a quarter-turn yaw. */
export function transformLocalBox(
	min: GridVec3,
	max: GridVec3,
	position: { x: number; y: number; z: number },
	turn: QuarterTurn
): WorldAabb {
	const a = rotateQuarterY(min.x, min.z, turn);
	const b = rotateQuarterY(max.x, max.z, turn);
	return {
		minX: position.x + Math.min(a.x, b.x),
		maxX: position.x + Math.max(a.x, b.x),
		minY: position.y + min.y,
		maxY: position.y + max.y,
		minZ: position.z + Math.min(a.z, b.z),
		maxZ: position.z + Math.max(a.z, b.z)
	};
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
			`b${p.x},${p.y},${p.z}|${s.x},${s.y},${s.z}|${r.x},${r.y},${r.z}|${block.materialSlot}|${block.collision ?? 'auto'}|${block.layer ?? 0}`
		);
	}
	for (const slot of definition.materials) {
		parts.push(`m${slot.finish}|${materialKey(slot)}`);
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
		material: { ...slot.material }
	}));
}

export function cloneDefinition(definition: MiniBuildDefinition): MiniBuildDefinition {
	return {
		...definition,
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
