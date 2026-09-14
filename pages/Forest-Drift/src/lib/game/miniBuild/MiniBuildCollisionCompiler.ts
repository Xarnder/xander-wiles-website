/**
 * Simplified collision from source cuboids — never from render triangles.
 *
 *   1. classify: `solid` / `none` explicitly, `auto` blocks at or below a small volume are visual-only
 *      (legs, handles, trim, and every plane) so they never snag the player. A plane forced `solid`
 *      is thickened to one grid unit so nothing can tunnel through a zero-width box
 *   2. drop boxes contained in another box
 *   3. exact merges: two boxes sharing extents on two axes and touching/overlapping on the third
 *      become one box (4 cabinet blocks → 1 cabinet box)
 *   4. if still over the per-design ceiling, merge the pair that adds the least empty volume
 *
 * Pure and deterministic, like the render compiler.
 */
import { anchorGrid, blockBox, computeBounds, gridToMeters, type GridBox } from './miniBuildGrid';
import { MINI_BUILD_LIMITS, type MiniBuildBlock } from './MiniBuildTypes';

export interface MiniBuildCollisionBox {
	/** Metres relative to the design anchor. */
	min: { x: number; y: number; z: number };
	max: { x: number; y: number; z: number };
}

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

/** Gives a zero-thickness box one grid unit of thickness, centred on its plane but never below the floor. */
function thickenFlat(box: GridBox, floorY: number): GridBox {
	const out: GridBox = { min: { ...box.min }, max: { ...box.max } };
	for (const axis of ['x', 'y', 'z'] as const) {
		if (out.max[axis] !== out.min[axis]) continue;
		out.min[axis] -= 0.5;
		out.max[axis] += 0.5;
	}
	if (out.min.y < floorY) {
		out.max.y += floorY - out.min.y;
		out.min.y = floorY;
	}
	return out;
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
): GridBox[] {
	const collidable = blocks.filter((block) => (block.collision ?? 'auto') !== 'none');
	if (collidable.length === 0) return [];
	const floorY = computeBounds(blocks).min.y;
	let boxes = collidable
		.filter((block) => !isDecorativeBlock(block, rules))
		.map((block) => thickenFlat(blockBox(block), floorY));
	// Only trim and handles? Keep the object solid as a whole rather than walk-through — unless the
	// whole design is flat (a rug, a poster), which stays visual-only.
	if (boxes.length === 0) {
		const bounds = computeBounds(collidable);
		if (volume(bounds) === 0) return [];
		return [{ min: { ...bounds.min }, max: { ...bounds.max } }];
	}

	boxes = boxes.filter(
		(box, i) =>
			!boxes.some(
				(other, j) => j !== i && contains(other, box) && (volume(other) > volume(box) || j < i)
			)
	);

	let merged = true;
	while (merged) {
		merged = false;
		outer: for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
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
				const waste =
					volume(union(boxes[i], boxes[j])) -
					(volume(boxes[i]) + volume(boxes[j]) - intersectionVolume(boxes[i], boxes[j]));
				if (waste < bestWaste) {
					bestWaste = waste;
					bestI = i;
					bestJ = j;
				}
			}
		}
		boxes[bestI] = union(boxes[bestI], boxes[bestJ]);
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
		}
	}));
}
