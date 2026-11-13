/** A new biome must hold under the player this long before it counts (decision Q28). */
export const BIOME_HOLD_SECONDS = 3;
/** At most one biome-name card per this many seconds. */
export const BIOME_CARD_COOLDOWN_SECONDS = 20;

export interface BiomeTrackerChange {
	/** Biome index now under the player (null: biomes off). */
	current: number | null;
	/** True when this change should show the biome-name card. */
	announce: boolean;
}

/**
 * Which biome the player is in, with hysteresis: standing on a border, or crossing a thin strip,
 * never flickers the answer. A dominant biome must hold for `BIOME_HOLD_SECONDS` before it becomes
 * current; the biome-name card then shows at most once per `BIOME_CARD_COOLDOWN_SECONDS`, and a
 * biome entered during the cooldown is announced when it ends if the player is still there.
 *
 * Pure and frame-rate independent: feed it the dominant biome under the camera and the frame time.
 */
export class BiomeTracker {
	private current: number | null = null;
	private candidate: number | null = null;
	private held = 0;
	private sinceCard = Number.POSITIVE_INFINITY;
	/** Current biome not yet announced (entered during the cooldown). */
	private pending = false;

	getCurrent(): number | null {
		return this.current;
	}

	/** Forget everything (a new world, or biomes switched on/off). The next biome is announced. */
	reset(): void {
		this.current = null;
		this.candidate = null;
		this.held = 0;
		this.sinceCard = Number.POSITIVE_INFINITY;
		this.pending = false;
	}

	/** Returns a change when the current biome changes or a pending card becomes due; else null. */
	update(dominant: number | null, dt: number): BiomeTrackerChange | null {
		const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1) : 0;
		this.sinceCard += step;

		if (dominant === null) {
			const changed = this.current !== null;
			this.current = null;
			this.candidate = null;
			this.held = 0;
			this.pending = false;
			return changed ? { current: null, announce: false } : null;
		}

		if (dominant === this.current) {
			this.candidate = null;
			this.held = 0;
		} else {
			if (dominant !== this.candidate) {
				this.candidate = dominant;
				this.held = 0;
			}
			this.held += step;
			if (this.held >= BIOME_HOLD_SECONDS) {
				this.current = dominant;
				this.candidate = null;
				this.held = 0;
				return this.announceOrDefer();
			}
		}

		if (this.pending && this.sinceCard >= BIOME_CARD_COOLDOWN_SECONDS) {
			this.pending = false;
			this.sinceCard = 0;
			return { current: this.current, announce: true };
		}
		return null;
	}

	private announceOrDefer(): BiomeTrackerChange {
		if (this.sinceCard >= BIOME_CARD_COOLDOWN_SECONDS) {
			this.sinceCard = 0;
			this.pending = false;
			return { current: this.current, announce: true };
		}
		this.pending = true;
		return { current: this.current, announce: false };
	}
}
