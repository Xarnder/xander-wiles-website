import type { TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import type { FoundationManager } from './FoundationManager';
import type { SlabManager } from './SlabManager';
import type { StairManager } from './StairManager';

/** Non-stair candidates (foundation/slab tops) are only considered "supporting" up to this far above `referenceY` — see getSupportingSurfaceY. Deliberately tiny/fixed, unlike stair treads below, which use the much larger, GUI-configurable `maxStepHeight`. */
const SUPPORT_EPSILON = 0.05;

/**
 * Ground/floor height for player grounding, combining procedural terrain with any placed foundation
 * and slab (upper floor, flat roof) standing above it. This is the single source of truth
 * FirstPersonController uses instead of talking to TerrainHeightSampler directly, so walking onto a
 * foundation or an upper-storey floor "just works" without the controller knowing buildings exist.
 *
 * A single (worldX, worldZ) column can have several stacked horizontal surfaces — terrain, a
 * foundation top, one or more slabs at different levels. `getSupportingSurfaceY` deliberately takes
 * a `referenceY` (the player's own feet Y before this step) and only ever returns a SLAB at or below
 * `referenceY + SUPPORT_EPSILON`: this is what stops a player standing under a roof from being
 * magically snapped up onto it (the roof's top is a real "highest surface at this X/Z", but it is
 * NOT below the player, so it is correctly excluded).
 *
 * Terrain and foundation tops are always included regardless of `referenceY` — both are
 * unconditional "ground level" surfaces, never something a player can legitimately be standing
 * *underneath* the way a room sits under a roof or upper floor (there are no basements yet; a
 * foundation is a raised platform, not a ceiling). A foundation's top is very often several metres
 * above the terrain right at its edge (it levels out to the site's *highest* point, so on sloped
 * ground the edge can be a real step up) — restricting it the same way slabs are restricted meant
 * walking up to a foundation from lower ground could fail to register at all, leaving the player
 * clipped through it at the wrong height, which then threw off everything measured relative to that
 * foundation (stairs included, since their `baseY` is foundation-local).
 */
export class WorldSurfaceSampler {
	constructor(
		private readonly terrainHeightSampler: TerrainHeightSampler,
		private readonly foundationManager: FoundationManager,
		private readonly slabManager: SlabManager,
		private readonly stairManager: StairManager,
		/** Read live (a GUI setting), same convention as every other tunable in this codebase. */
		private readonly getMaxStepHeight: () => number
	) {}

	/**
	 * The highest walkable surface at (worldX, worldZ) that is not above `referenceY` (plus a small
	 * epsilon so standing still doesn't jitter). Pass `referenceY = Infinity` for "ignore current
	 * position, land on the highest surface" (e.g. on spawn).
	 *
	 * Stair tread tops use a much larger tolerance (`maxStepHeight`, typically ~0.3m) than every
	 * other surface (foundation/slab tops, `SUPPORT_EPSILON` ~0.05m) — this is deliberate and is
	 * what makes walking up a staircase feel like walking, not jumping: a step within `maxStepHeight`
	 * of the player's current feet Y is treated as ordinary walkable ground and snapped onto
	 * automatically, the same way this method already snaps onto a foundation edge or a curb.
	 */
	getSupportingSurfaceY(worldX: number, worldZ: number, referenceY: number): number {
		const limit = referenceY + SUPPORT_EPSILON;
		let best = this.terrainHeightSampler.sample(worldX, worldZ);

		// Unconditional, like terrain — see the class doc comment on why foundations don't need the
		// "not above referenceY" guard slabs do.
		const foundationTopY = this.foundationManager.getTopYAt(worldX, worldZ);
		if (foundationTopY !== null && foundationTopY > best) {
			best = foundationTopY;
		}

		for (const slabTopY of this.slabManager.getTopSurfacesAt(worldX, worldZ)) {
			if (slabTopY > best && slabTopY <= limit) best = slabTopY;
		}

		const stepLimit = referenceY + this.getMaxStepHeight();
		for (const stepTopY of this.stairManager.getStepSurfacesAt(worldX, worldZ)) {
			if (stepTopY > best && stepTopY <= stepLimit) best = stepTopY;
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
