import type { TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import type { FoundationManager } from './FoundationManager';
import type { SlabManager } from './SlabManager';

/** Candidates are only considered "supporting" up to this far above `referenceY` — see getSupportingSurfaceY. */
const SUPPORT_EPSILON = 0.05;

/**
 * Ground/floor height for player grounding, combining procedural terrain with any placed foundation
 * and slab (upper floor, flat roof) standing above it. This is the single source of truth
 * FirstPersonController uses instead of talking to TerrainHeightSampler directly, so walking onto a
 * foundation or an upper-storey floor "just works" without the controller knowing buildings exist.
 *
 * A single (worldX, worldZ) column can have several stacked horizontal surfaces — terrain, a
 * foundation top, one or more slabs at different levels. `getSupportingSurfaceY` deliberately takes
 * a `referenceY` (the player's own feet Y before this step) and only ever returns a surface at or
 * below `referenceY + SUPPORT_EPSILON`: this is what stops a player standing under a roof from being
 * magically snapped up onto it (the roof's top is a real "highest surface at this X/Z", but it is
 * NOT below the player, so it is correctly excluded). Terrain height is always included regardless of
 * `referenceY`, since it is the unconditional fallback floor — there is never a case where "falling
 * through the terrain because a surface above disqualified it" is the right behavior.
 */
export class WorldSurfaceSampler {
	constructor(
		private readonly terrainHeightSampler: TerrainHeightSampler,
		private readonly foundationManager: FoundationManager,
		private readonly slabManager: SlabManager
	) {}

	/**
	 * The highest walkable surface at (worldX, worldZ) that is not above `referenceY` (plus a small
	 * epsilon so standing still doesn't jitter). Pass `referenceY = Infinity` for "ignore current
	 * position, land on the highest surface" (e.g. on spawn).
	 */
	getSupportingSurfaceY(worldX: number, worldZ: number, referenceY: number): number {
		const limit = referenceY + SUPPORT_EPSILON;
		let best = this.terrainHeightSampler.sample(worldX, worldZ);

		const foundationTopY = this.foundationManager.getTopYAt(worldX, worldZ);
		if (foundationTopY !== null && foundationTopY > best && foundationTopY <= limit) {
			best = foundationTopY;
		}

		for (const slabTopY of this.slabManager.getTopSurfacesAt(worldX, worldZ)) {
			if (slabTopY > best && slabTopY <= limit) best = slabTopY;
		}

		return best;
	}

	/**
	 * The lowest slab underside at (worldX, worldZ) that would block an upward move from `fromY` to
	 * `toY` (i.e. lies strictly between them), or `null` if nothing blocks it. Used to stop the player
	 * jumping/rising up through a ceiling or floor from below.
	 */
	getCeilingBlockY(worldX: number, worldZ: number, fromY: number, toY: number): number | null {
		if (toY <= fromY) return null;
		let best: number | null = null;
		for (const undersideY of this.slabManager.getUndersidesAt(worldX, worldZ)) {
			if (undersideY > fromY && undersideY <= toY) {
				if (best === null || undersideY < best) best = undersideY;
			}
		}
		return best;
	}
}
