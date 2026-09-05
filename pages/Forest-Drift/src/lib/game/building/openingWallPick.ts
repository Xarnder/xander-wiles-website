/**
 * Which wall a window/door should apply to, and whether it's on the level the player has selected.
 * Framework- and Three.js-free (the caller resolves raycast hits into plain candidates first), so
 * the decision itself is directly unit-testable — same split every other math module in this project
 * uses.
 *
 * The rule is deliberately "the wall you are pointing at, validated against the selected level" —
 * NOT "the nearest wall that happens to be on the selected level". A raycaster reports every wall
 * along the ray, including ones hidden behind the one in front of you: in a closed room, aiming
 * slightly upward at the near ground-floor wall also passes through the far first-floor wall above
 * and beyond it. An earlier version picked the first on-level candidate, which meant the opening
 * silently landed on a wall the player could not see, and the only way to hit an upper-floor wall
 * was to aim at a lower one — precisely backwards. Taking the nearest hit keeps what you see and
 * what you get the same thing; the level check then either allows it or explains why not.
 */

/** One raycast hit already resolved to a real wall. `hit` is passed straight back out untouched, so callers can carry whatever payload they need (a THREE.Intersection, in practice). */
export interface OpeningWallCandidate<THit> {
	hit: THit;
	wallId: string;
	foundationId: string;
	/** The wall's own bottom elevation, foundation-local — compared against its foundation's current level. */
	baseY: number;
}

export interface OpeningWallPick<THit> {
	hit: THit;
	wallId: string;
	foundationId: string;
	baseY: number;
	/**
	 * Whether the wall being pointed at is on its foundation's currently-selected level. `false`
	 * means the player is aiming at a wall belonging to another storey — callers should surface that
	 * (highlight it, say which floor it's on) rather than cutting an opening into it.
	 */
	onCurrentLevel: boolean;
}

/** How close (world units) a wall's `baseY` must be to a level's own `baseY` to count as being on it. A wall copies its level's `baseY` verbatim when placed, so this only absorbs float drift through serialization — not a "near enough" allowance. */
export const LEVEL_MATCH_EPSILON = 0.01;

export function isWallOnLevel(wallBaseY: number, levelBaseY: number): boolean {
	return Math.abs(wallBaseY - levelBaseY) <= LEVEL_MATCH_EPSILON;
}

/**
 * Picks from `candidates` — which MUST be ordered nearest-first, exactly as a raycaster returns
 * them. Returns the nearest one (the wall actually in front of the crosshair, never one hidden
 * behind it), flagged with whether it sits on its own foundation's currently-selected level, or
 * `null` if no wall was hit at all.
 *
 * `currentLevelBaseYOf` is keyed by foundation rather than resolved once up front because levels are
 * per-foundation — two foundations in view can legitimately be on different storeys at the same time.
 */
export function pickOpeningWall<THit>(
	candidates: readonly OpeningWallCandidate<THit>[],
	currentLevelBaseYOf: (foundationId: string) => number
): OpeningWallPick<THit> | null {
	const nearest = candidates[0];
	if (!nearest) return null;

	return {
		...nearest,
		onCurrentLevel: isWallOnLevel(nearest.baseY, currentLevelBaseYOf(nearest.foundationId))
	};
}
