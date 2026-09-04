import type { TerrainGridPoint } from './FoundationTypes';

export type HeightSampleFn = (worldX: number, worldZ: number) => number;

/** Spacing between adjacent terrain grid vertices — the same grid the terrain mesh itself uses. */
export function vertexSpacingFor(chunkSize: number, chunkResolution: number): number {
	return chunkSize / chunkResolution;
}

/**
 * Nearest global grid coordinate for a world coordinate. Deliberate integer math (Math.round),
 * not Math.floor/truncation, so snapping is symmetric on both sides of world zero.
 */
export function worldToGridCoord(worldCoord: number, spacing: number): number {
	// Math.round can return -0 for small negative inputs (e.g. Math.round(-0.1) === -0). Canonicalize
	// to +0 so grid coordinates near zero compare and serialize predictably.
	const rounded = Math.round(worldCoord / spacing);
	return rounded === 0 ? 0 : rounded;
}

export function gridToWorldCoord(gridCoord: number, spacing: number): number {
	return gridCoord * spacing;
}

export function sampleGridPoint(
	gridX: number,
	gridZ: number,
	spacing: number,
	sample: HeightSampleFn
): TerrainGridPoint {
	const worldX = gridToWorldCoord(gridX, spacing);
	const worldZ = gridToWorldCoord(gridZ, spacing);
	return { gridX, gridZ, worldX, worldZ, height: sample(worldX, worldZ) };
}

export interface FoundationSelectionResult {
	valid: boolean;
	reason?: string;
	minGridX: number;
	maxGridX: number;
	minGridZ: number;
	maxGridZ: number;
	cellsX: number;
	cellsZ: number;
	/** Only meaningful when valid — 0 on an invalid result. */
	topY: number;
	bottomY: number;
	/** The terrain grid vertex responsible for topY (or the near corner, on an invalid result). */
	highestPoint: TerrainGridPoint;
}

/**
 * Core foundation math: normalizes two corners into a footprint, validates size, and — for a
 * valid footprint — finds the highest and lowest terrain grid vertex inside it by sampling the
 * shared procedural height function directly (never rendered mesh vertices). This is what makes
 * a foundation correct across chunk boundaries and unloaded chunks, and identical on any client
 * that shares the same seed/settings.
 *
 * No arrays are allocated for the sampled points — just a numeric min/max scan — so this stays
 * cheap enough to call synchronously for the default 64x64-cell maximum.
 */
export function computeFoundationSelection(
	cornerA: { gridX: number; gridZ: number },
	cornerB: { gridX: number; gridZ: number },
	spacing: number,
	sample: HeightSampleFn,
	maxFoundationCells: number,
	foundationUndergroundDepth: number
): FoundationSelectionResult {
	const minGridX = Math.min(cornerA.gridX, cornerB.gridX);
	const maxGridX = Math.max(cornerA.gridX, cornerB.gridX);
	const minGridZ = Math.min(cornerA.gridZ, cornerB.gridZ);
	const maxGridZ = Math.max(cornerA.gridZ, cornerB.gridZ);
	const cellsX = maxGridX - minGridX;
	const cellsZ = maxGridZ - minGridZ;

	const base = { minGridX, maxGridX, minGridZ, maxGridZ, cellsX, cellsZ };

	if (cellsX === 0 || cellsZ === 0) {
		return {
			...base,
			valid: false,
			reason: 'Foundation needs width and depth',
			topY: 0,
			bottomY: 0,
			highestPoint: sampleGridPoint(minGridX, minGridZ, spacing, sample)
		};
	}

	if (cellsX > maxFoundationCells || cellsZ > maxFoundationCells) {
		return {
			...base,
			valid: false,
			reason: 'Foundation too large',
			topY: 0,
			bottomY: 0,
			highestPoint: sampleGridPoint(minGridX, minGridZ, spacing, sample)
		};
	}

	let minHeight = Infinity;
	let maxHeight = -Infinity;
	let highestGridX = minGridX;
	let highestGridZ = minGridZ;

	for (let gx = minGridX; gx <= maxGridX; gx++) {
		for (let gz = minGridZ; gz <= maxGridZ; gz++) {
			const worldX = gridToWorldCoord(gx, spacing);
			const worldZ = gridToWorldCoord(gz, spacing);
			const height = sample(worldX, worldZ);

			if (height < minHeight) minHeight = height;
			if (height > maxHeight) {
				maxHeight = height;
				highestGridX = gx;
				highestGridZ = gz;
			}
		}
	}

	return {
		...base,
		valid: true,
		topY: maxHeight,
		bottomY: minHeight - foundationUndergroundDepth,
		highestPoint: sampleGridPoint(highestGridX, highestGridZ, spacing, sample)
	};
}
