import { DEEP_WATER_DEPTH, SHALLOW_WATER_DEPTH } from './HydrologyTypes';

/**
 * A foundation that sits in a river or lake is rejected. Shallow bank edges can clip one sample
 * without failing; a deep sample, or several wet samples, cannot.
 */
export function foundationOverlapsWater(
	depthAt: (worldX: number, worldZ: number) => number,
	minX: number,
	maxX: number,
	minZ: number,
	maxZ: number
): boolean {
	const midX = (minX + maxX) * 0.5;
	const midZ = (minZ + maxZ) * 0.5;
	const samples = [
		[midX, midZ],
		[minX, minZ],
		[minX, maxZ],
		[maxX, minZ],
		[maxX, maxZ],
		[midX, minZ],
		[midX, maxZ],
		[minX, midZ],
		[maxX, midZ]
	];
	let wet = 0;
	for (const [x, z] of samples) {
		const depth = depthAt(x, z);
		if (depth > DEEP_WATER_DEPTH) return true;
		if (depth > SHALLOW_WATER_DEPTH) wet++;
	}
	return wet >= 2;
}
