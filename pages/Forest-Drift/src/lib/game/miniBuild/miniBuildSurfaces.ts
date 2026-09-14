/**
 * Which surface is drawn where two faces of a Mini Build lie in exactly the same place.
 *
 * Two coplanar faces facing the same way would z-fight, so exactly one of them may be drawn. The
 * compiler (world render) removes the loser's cells outright, and the editor viewport — which draws
 * one mesh per block and cannot remove anything while blocks are being dragged — pulls the winner
 * towards the camera with a depth offset. Both read the same precedence from here, so the editor
 * always shows what the placed object will look like:
 *
 *   1. opaque beats transparent (glass never hides the surface it lies on)
 *   2. a plane beats a cuboid face (a tablecloth sits on top of the table)
 *   3. between planes, the higher `layer` wins — the plane selected last in the editor
 *   4. otherwise the earlier block wins
 *
 * Pure and Three.js-free.
 */
import { blockBox, cloneBlock, isPlaneBlock, type GridBox } from './miniBuildGrid';
import type { MiniBuildBlock, MiniBuildMaterialSlot } from './MiniBuildTypes';

export interface SurfaceRank {
	index: number;
	plane: boolean;
	transparent: boolean;
	layer: number;
}

export function isTransparentSlot(
	slot: Pick<MiniBuildMaterialSlot, 'finish'> | undefined
): boolean {
	return slot?.finish === 'glass';
}

export function planeLayer(block: Pick<MiniBuildBlock, 'layer'>): number {
	return block.layer ?? 0;
}

export function surfaceRanks(
	blocks: readonly MiniBuildBlock[],
	materials: readonly Pick<MiniBuildMaterialSlot, 'finish'>[]
): SurfaceRank[] {
	return blocks.map((block, index) => ({
		index,
		plane: isPlaneBlock(block),
		transparent: isTransparentSlot(materials[block.materialSlot]),
		layer: planeLayer(block)
	}));
}

/** True when `a`'s surface is drawn instead of `b`'s where both lie in one plane facing the same way. */
export function surfaceWins(a: SurfaceRank, b: SurfaceRank): boolean {
	if (a.transparent !== b.transparent) return !a.transparent;
	if (a.plane !== b.plane) return a.plane;
	if (a.plane && a.layer !== b.layer) return a.layer > b.layer;
	return a.index < b.index;
}

/**
 * True when two effective boxes have a pair of same-facing faces in one plane with overlapping area —
 * the only arrangement that can z-fight. A plane's two faces share its single coordinate.
 */
export function sharesCoplanarSurface(a: GridBox, b: GridBox): boolean {
	const axes = ['x', 'y', 'z'] as const;
	for (const n of axes) {
		if (a.max[n] !== b.max[n] && a.min[n] !== b.min[n]) continue;
		let overlaps = true;
		for (const t of axes) {
			if (t !== n && Math.min(a.max[t], b.max[t]) - Math.max(a.min[t], b.min[t]) <= 0) {
				overlaps = false;
				break;
			}
		}
		if (overlaps) return true;
	}
	return false;
}

/**
 * Editor depth-offset level per block: 0 unless the block shares a surface with a block it beats,
 * then one more than the highest level it beats. Levels stay small (usually 0–2) so the offset never
 * pulls a surface in front of geometry it is not actually coplanar with.
 */
export function surfaceOffsetLevels(
	blocks: readonly MiniBuildBlock[],
	materials: readonly Pick<MiniBuildMaterialSlot, 'finish'>[]
): number[] {
	const ranks = surfaceRanks(blocks, materials);
	const boxes = blocks.map(blockBox);
	const losersFirst = [...ranks].sort((a, b) => (surfaceWins(a, b) ? 1 : -1));
	const levels = new Array<number>(blocks.length).fill(0);
	const placed: number[] = [];
	for (const rank of losersFirst) {
		let level = 0;
		for (const j of placed) {
			if (sharesCoplanarSurface(boxes[rank.index], boxes[j]))
				level = Math.max(level, levels[j] + 1);
		}
		levels[rank.index] = level;
		placed.push(rank.index);
	}
	return levels;
}

/**
 * Puts a plane on top of every plane it shares a surface with — the editor calls this whenever a
 * plane is selected. Returns null when it is already on top (or is not a plane), so selecting never
 * changes a design needlessly. Plane layers are then compacted to 0…n−1 in their existing order.
 */
export function raisePlaneLayer(
	blocks: readonly MiniBuildBlock[],
	id: string | null
): MiniBuildBlock[] | null {
	const index = blocks.findIndex((block) => block.id === id);
	if (index < 0 || !isPlaneBlock(blocks[index])) return null;
	const box = blockBox(blocks[index]);
	const own = planeLayer(blocks[index]);
	let top = own;
	let beaten = false;
	blocks.forEach((other, j) => {
		if (j === index || !isPlaneBlock(other) || !sharesCoplanarSurface(box, blockBox(other))) return;
		const layer = planeLayer(other);
		top = Math.max(top, layer);
		if (layer > own || (layer === own && j < index)) beaten = true;
	});
	if (!beaten) return null;
	const raised = blocks.map((block, j) =>
		j === index ? { ...cloneBlock(block), layer: top + 1 } : block
	);
	const values = [...new Set(raised.filter(isPlaneBlock).map(planeLayer))].sort((a, b) => a - b);
	return raised.map((block) => {
		const copy = cloneBlock(block);
		delete copy.layer;
		const layer = isPlaneBlock(block) ? values.indexOf(planeLayer(block)) : 0;
		if (layer > 0) copy.layer = layer;
		return copy;
	});
}
