import type { TreeLod } from './TreeSpeciesTypes';

/** Effective LOD switch distances, metres (settings × graphics preset). */
export interface TreeLodDistances {
	lod1: number;
	lod2: number;
	lod3: number;
	/** Fractional hysteresis band around each threshold. */
	hysteresis: number;
}

function thresholds(distances: TreeLodDistances): [number, number, number] {
	return [distances.lod1, distances.lod2, distances.lod3];
}

/**
 * LOD for a tree at `distance`, given the LOD it currently shows. A tree only moves to a farther
 * LOD once it is `hysteresis` beyond the threshold, and back to a nearer one once it is
 * `hysteresis` inside it — so small camera movements around a threshold never flicker.
 * `current = -1` means "no previous LOD" (plain thresholds).
 */
export function selectTreeLod(
	distance: number,
	current: number,
	distances: TreeLodDistances
): TreeLod {
	const t = thresholds(distances);
	const h = Math.max(0, distances.hysteresis);
	let lod = 0;
	for (let i = 0; i < 3; i++) {
		const boundary = t[i];
		// Crossing boundary i separates LOD i (nearer) from LOD i+1 (farther).
		const effective =
			current < 0 ? boundary : current > i ? boundary * (1 - h) : boundary * (1 + h);
		if (distance >= effective) lod = i + 1;
	}
	return lod as TreeLod;
}

/**
 * The LOD every tree in a distance range would get if it had no history — used to skip chunks
 * that lie entirely inside one LOD band (most far chunks), so they are never re-evaluated per tree.
 * Returns `null` when the range straddles a threshold (± hysteresis).
 */
export function uniformLodForRange(
	minDistance: number,
	maxDistance: number,
	distances: TreeLodDistances
): TreeLod | null {
	const t = thresholds(distances);
	const h = Math.max(0, distances.hysteresis);
	const lodAt = (d: number) => selectTreeLod(d, -1, distances);
	const lo = lodAt(minDistance);
	if (lo !== lodAt(maxDistance)) return null;
	// Also require the whole range to be clear of every hysteresis band, so a tree that is still
	// showing a neighbouring LOD inside the band is not forced across early.
	for (const boundary of t) {
		if (maxDistance >= boundary * (1 - h) && minDistance <= boundary * (1 + h)) return null;
	}
	return lo;
}

/** Shadow casting policy: LODs at or below `maxShadowLod` cast (−1 = none). Far LODs never do. */
export function lodCastsShadow(lod: TreeLod, maxShadowLod: number): boolean {
	return lod <= maxShadowLod && lod <= 1;
}

/** Far silhouettes don't receive shadows either — invisible at that distance, and cheaper. */
export function lodReceivesShadow(lod: TreeLod): boolean {
	return lod <= 2;
}
