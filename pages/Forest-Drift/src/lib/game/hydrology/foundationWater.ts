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

/**
 * Whether a lake or river surface anywhere over a footprint is above `floorY` — a basement whose
 * lowest floor is that deep would sit below the water (Basements and Joined Foundations, E5).
 * `surfaceAt` gives the water surface's height, or NaN where there is no water. Sampled every 2 m.
 */
export function basementBelowWater(
	surfaceAt: (worldX: number, worldZ: number) => number,
	minX: number,
	maxX: number,
	minZ: number,
	maxZ: number,
	floorY: number
): boolean {
	const stepsX = Math.max(1, Math.ceil((maxX - minX) / 2));
	const stepsZ = Math.max(1, Math.ceil((maxZ - minZ) / 2));
	for (let i = 0; i <= stepsX; i++)
		for (let j = 0; j <= stepsZ; j++) {
			const surface = surfaceAt(
				minX + ((maxX - minX) * i) / stepsX,
				minZ + ((maxZ - minZ) * j) / stepsZ
			);
			if (Number.isFinite(surface) && surface > floorY) return true;
		}
	return false;
}
