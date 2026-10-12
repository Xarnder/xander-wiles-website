/**
 * Simplified collision from source cuboids — never from render triangles.
 *
 *   1. classify: `solid` / `none` explicitly, `auto` blocks at or below a small volume are visual-only
 *      (legs, handles, trim, and every plane) so they never snag the player. A plane forced `solid`
 *      is thickened to 0.0625m so nothing can tunnel through a zero-width box
 *   1b. an angled block that stays upright (turned only about Y, in effect) keeps its exact shape as
 *      a box with a `yaw`; any other angled block collides as the grid box around what it draws
 *   2. drop boxes contained in another box
 *   3. exact merges: two boxes sharing extents on two axes and touching/overlapping on the third
 *      become one box (4 cabinet blocks → 1 cabinet box)
 *   4. if still over the per-design ceiling, merge the pair that adds the least empty volume (a yawed
 *      box takes part as the grid box around it)
 *
 * Pure and deterministic, like the render compiler.
 */
import {
	anchorGrid,
	blockBox,
	blockCenterGrid,
	blockExtentBox,
	computeBounds,
	gridToMeters,
	isAngledBlock,
	isQuarterTurn,
	orientationMatrix,
	snapAngle,
	snapCosSin,
	type GridBox
} from './miniBuildGrid';
import { MINI_BUILD_LIMITS, type MiniBuildBlock, type SnapAngle } from './MiniBuildTypes';

export interface MiniBuildCollisionBox {
	/** Metres relative to the design anchor. With `yaw`, the box *before* it is turned. */
	min: { x: number; y: number; z: number };
	max: { x: number; y: number; z: number };
	/**
	 * Degrees about +Y around the box's own centre (`THREE.Matrix4.makeRotationY` convention) — only
	 * on boxes from angled blocks, which would otherwise collide as a much larger square.
	 */
	yaw?: SnapAngle;
}

/** A grid-unit collision box; `yaw` as in MiniBuildCollisionBox (min/max may be half units then). */
type CollisionGridBox = GridBox & { yaw?: SnapAngle };

export interface MiniBuildCollisionRules {
	maxBoxesPerBuild: number;
	/** Metres³; `auto` blocks at or below it (including zero-volume planes) are visual-only. */
	decorativeMaxVolume: number;
}

function volume(box: GridBox): number {
	return (box.max.x - box.min.x) * (box.max.y - box.min.y) * (box.max.z - box.min.z);
}

function contains(outer: GridBox, inner: GridBox): boolean {
	return (
		outer.min.x <= inner.min.x &&
		outer.min.y <= inner.min.y &&
		outer.min.z <= inner.min.z &&
		outer.max.x >= inner.max.x &&
		outer.max.y >= inner.max.y &&
		outer.max.z >= inner.max.z
	);
}

function union(a: GridBox, b: GridBox): GridBox {
	return {
		min: {
			x: Math.min(a.min.x, b.min.x),
			y: Math.min(a.min.y, b.min.y),
			z: Math.min(a.min.z, b.min.z)
		},
		max: {
			x: Math.max(a.max.x, b.max.x),
			y: Math.max(a.max.y, b.max.y),
			z: Math.max(a.max.z, b.max.z)
		}
	};
}

function intersectionVolume(a: GridBox, b: GridBox): number {
	const dx = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
	const dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
	const dz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
	return dx > 0 && dy > 0 && dz > 0 ? dx * dy * dz : 0;
}

/** The union of two boxes is itself exactly a box (no added empty space). */
function mergesExactly(a: GridBox, b: GridBox): boolean {
	const axes = ['x', 'y', 'z'] as const;
	let differing = 0;
	for (const axis of axes) {
		const same = a.min[axis] === b.min[axis] && a.max[axis] === b.max[axis];
		if (same) continue;
		differing++;
		// Must touch or overlap along the one differing axis.
		if (a.max[axis] < b.min[axis] || b.max[axis] < a.min[axis]) return false;
	}
	return differing <= 1;
}

/** Collision thickness given to a plane forced solid, in metres. */
const PLANE_COLLISION_THICKNESS = 0.0625;

/** Gives a zero-thickness box a 0.0625m thickness, centred on its plane but never below the floor. */
function thickenFlat(box: CollisionGridBox, floorY: number): CollisionGridBox {
	const out: CollisionGridBox = { min: { ...box.min }, max: { ...box.max } };
	if (box.yaw !== undefined) out.yaw = box.yaw;
	const half = PLANE_COLLISION_THICKNESS / MINI_BUILD_LIMITS.gridSize / 2;
	for (const axis of ['x', 'y', 'z'] as const) {
		if (out.max[axis] !== out.min[axis]) continue;
		out.min[axis] -= half;
		out.max[axis] += half;
	}
	if (out.min.y < floorY) {
		out.max.y += floorY - out.min.y;
		out.min.y = floorY;
	}
	return out;
}

/**
 * An angled block's collision: when one of its own axes is still vertical its footprint is just a
 * turned rectangle, kept exactly as a yawed box; otherwise (tilted) the grid box around it.
 */
function angledBlockBox(block: MiniBuildBlock): CollisionGridBox {
	const m = orientationMatrix(block.rotation);
	const vertical = [0, 1, 2].find((k) => Math.abs(Math.abs(m[3 + k]) - 1) < 1e-9);
	if (vertical === undefined) return blockExtentBox(block);
	const [i, j] = [0, 1, 2].filter((k) => k !== vertical);
	// The box's own X axis is local axis i, which points along (m[i], m[6+i]) = (cos ψ, −sin ψ).
	const yaw = snapAngle((Math.atan2(-m[6 + i], m[i]) * 180) / Math.PI);
	if (isQuarterTurn(yaw)) return blockExtentBox(block);
	const [c, s] = snapCosSin(yaw);
	if (Math.abs(c - m[i]) > 1e-6 || Math.abs(-s - m[6 + i]) > 1e-6) return blockExtentBox(block);
	const size = [block.sizeGrid.x, block.sizeGrid.y, block.sizeGrid.z];
	const centre = blockCenterGrid(block);
	return {
		min: { x: centre.x - size[i] / 2, y: centre.y - size[vertical] / 2, z: centre.z - size[j] / 2 },
		max: { x: centre.x + size[i] / 2, y: centre.y + size[vertical] / 2, z: centre.z + size[j] / 2 },
		yaw
	};
}

/** The grid box around a (possibly yawed) collision box. */
function asAabb(box: CollisionGridBox): GridBox {
	if (box.yaw === undefined) return box;
	const [c, s] = snapCosSin(box.yaw);
	const hx = (box.max.x - box.min.x) / 2;
	const hz = (box.max.z - box.min.z) / 2;
	const ex = Math.abs(c) * hx + Math.abs(s) * hz;
	const ez = Math.abs(s) * hx + Math.abs(c) * hz;
	const cx = (box.min.x + box.max.x) / 2;
	const cz = (box.min.z + box.max.z) / 2;
	return {
		min: { x: Math.floor(cx - ex + 1e-6), y: box.min.y, z: Math.floor(cz - ez + 1e-6) },
		max: { x: Math.ceil(cx + ex - 1e-6), y: box.max.y, z: Math.ceil(cz + ez - 1e-6) }
	};
}

export function isDecorativeBlock(block: MiniBuildBlock, rules: MiniBuildCollisionRules): boolean {
	const mode = block.collision ?? 'auto';
	if (mode === 'none') return true;
	if (mode === 'solid') return false;
	const cell = MINI_BUILD_LIMITS.gridSize ** 3;
	return volume(blockBox(block)) * cell <= rules.decorativeMaxVolume + 1e-12;
}

export function compileCollisionGridBoxes(
	blocks: readonly MiniBuildBlock[],
	rules: MiniBuildCollisionRules
): CollisionGridBox[] {
	const collidable = blocks.filter((block) => (block.collision ?? 'auto') !== 'none');
	if (collidable.length === 0) return [];
	const floorY = computeBounds(blocks).min.y;
	let boxes = collidable
		.filter((block) => !isDecorativeBlock(block, rules))
		.map((block) =>
			thickenFlat(isAngledBlock(block) ? angledBlockBox(block) : blockBox(block), floorY)
		);
	// Only trim and handles? Keep the object solid as a whole rather than walk-through — unless the
	// whole design is flat (a rug, a poster), which stays visual-only.
	if (boxes.length === 0) {
		const bounds = computeBounds(collidable);
		if (volume(bounds) === 0) return [];
		return [{ min: { ...bounds.min }, max: { ...bounds.max } }];
	}

	// Containment and exact merges are axis-aligned ideas: a box contained in a grid box drops out
	// whatever its yaw (the bigger box already covers it), but a yawed box never absorbs another.
	boxes = boxes.filter(
		(box, i) =>
			!boxes.some(
				(other, j) =>
					j !== i &&
					other.yaw === undefined &&
					contains(other, asAabb(box)) &&
					(volume(other) > volume(asAabb(box)) || j < i || box.yaw !== undefined)
			)
	);

	let merged = true;
	while (merged) {
		merged = false;
		outer: for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				if (boxes[i].yaw !== undefined || boxes[j].yaw !== undefined) continue;
				if (
					mergesExactly(boxes[i], boxes[j]) ||
					contains(boxes[i], boxes[j]) ||
					contains(boxes[j], boxes[i])
				) {
					boxes[i] = union(boxes[i], boxes[j]);
					boxes.splice(j, 1);
					merged = true;
					break outer;
				}
			}
		}
	}

	while (boxes.length > rules.maxBoxesPerBuild) {
		let bestI = 0;
		let bestJ = 1;
		let bestWaste = Infinity;
		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				const a = asAabb(boxes[i]);
				const b = asAabb(boxes[j]);
				const waste = volume(union(a, b)) - (volume(a) + volume(b) - intersectionVolume(a, b));
				if (waste < bestWaste) {
					bestWaste = waste;
					bestI = i;
					bestJ = j;
				}
			}
		}
		boxes[bestI] = union(asAabb(boxes[bestI]), asAabb(boxes[bestJ]));
		boxes.splice(bestJ, 1);
	}
	return boxes;
}

export function compileMiniBuildCollision(
	blocks: readonly MiniBuildBlock[],
	rules: MiniBuildCollisionRules
): MiniBuildCollisionBox[] {
	if (blocks.length === 0) return [];
	const anchor = anchorGrid(computeBounds(blocks));
	return compileCollisionGridBoxes(blocks, rules).map((box) => ({
		min: {
			x: gridToMeters(box.min.x - anchor.x),
			y: gridToMeters(box.min.y - anchor.y),
			z: gridToMeters(box.min.z - anchor.z)
		},
		max: {
			x: gridToMeters(box.max.x - anchor.x),
			y: gridToMeters(box.max.y - anchor.y),
			z: gridToMeters(box.max.z - anchor.z)
		},
		...(box.yaw !== undefined ? { yaw: box.yaw } : {})
	}));
}
