/**
 * Deterministic, address-independent per-cell hashing for vegetation placement. Given a numeric
 * seed hash plus integer cell coordinates and a channel index, returns a float in [0, 1).
 *
 * Unlike a sequential PRNG (mulberry32 et al.), this needs no prior state — any cell can be
 * queried independently, in any order, on any client, and always gets the same answer. That is
 * what lets vegetation chunks be generated in any order (or regenerated individually) without
 * depending on load history, which is essential for both correctness (loading chunk B before
 * chunk A must not change chunk A's trees) and future multiplayer (every client must derive the
 * same forest independently).
 */
export function hashCellToFloat01(
	seedHash: number,
	cellX: number,
	cellZ: number,
	channel: number
): number {
	let h = seedHash | 0;
	h = Math.imul(h ^ cellX, 0x27d4eb2d);
	h = Math.imul(h ^ cellZ, 0x165667b1);
	h = Math.imul(h ^ channel, 0x85ebca6b);
	h ^= h >>> 15;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 13;
	return (h >>> 0) / 4294967296;
}

/** Named channels so call sites read clearly instead of using bare integers. */
export const CellHashChannel = {
	OffsetX: 0,
	OffsetZ: 1,
	Existence: 2,
	Scale: 3,
	Rotation: 4,
	Variant: 5
} as const;
