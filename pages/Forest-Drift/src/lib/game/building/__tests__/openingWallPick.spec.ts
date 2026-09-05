import { describe, expect, it } from 'vitest';
import type { OpeningWallCandidate } from '../openingWallPick';
import { isWallOnLevel, LEVEL_MATCH_EPSILON, pickOpeningWall } from '../openingWallPick';

/** Candidates are always ordered nearest-first, exactly as a raycaster returns them. `hit` is an opaque label here — the real tool passes the THREE.Intersection through. */
function candidate(
	label: string,
	baseY: number,
	foundationId = 'f1'
): OpeningWallCandidate<string> {
	return { hit: label, wallId: `wall-${label}`, foundationId, baseY };
}

/** Every foundation is on the level whose baseY this returns. */
function levelAt(baseY: number) {
	return () => baseY;
}

describe('isWallOnLevel', () => {
	it('matches an exact elevation', () => {
		expect(isWallOnLevel(3, 3)).toBe(true);
	});

	it('absorbs float drift within the epsilon, but nothing beyond it', () => {
		expect(isWallOnLevel(3 + LEVEL_MATCH_EPSILON / 2, 3)).toBe(true);
		expect(isWallOnLevel(3 + LEVEL_MATCH_EPSILON * 2, 3)).toBe(false);
	});

	it('does not treat adjacent storeys as the same level', () => {
		expect(isWallOnLevel(0, 3)).toBe(false);
		expect(isWallOnLevel(6, 3)).toBe(false);
	});
});

describe('pickOpeningWall', () => {
	it('returns null when nothing was hit', () => {
		expect(pickOpeningWall([], levelAt(0))).toBeNull();
	});

	it('takes the nearest wall, marked on-level, when that is what the crosshair is pointing at', () => {
		const picked = pickOpeningWall([candidate('near', 3), candidate('far', 0)], levelAt(3));
		expect(picked?.hit).toBe('near');
		expect(picked?.onCurrentLevel).toBe(true);
	});

	it('marks the nearest wall off-level rather than placing on it, when it belongs to another storey', () => {
		const picked = pickOpeningWall([candidate('ground', 0), candidate('second', 6)], levelAt(3));
		expect(picked?.hit).toBe('ground');
		expect(picked?.onCurrentLevel).toBe(false);
	});

	it('regression: never reaches THROUGH the wall being pointed at to a farther one that happens to be on the selected level — a raycaster reports hidden walls too, and reaching for them meant aiming at a ground-floor wall to place upstairs', () => {
		// Nearest-first: the ground-floor wall is the one actually in front of the crosshair; the
		// first-floor wall is behind/above it, through the wall, and must NOT be chosen.
		const picked = pickOpeningWall([candidate('ground', 0), candidate('first', 3)], levelAt(3));
		expect(picked?.hit).toBe('ground');
		expect(picked?.onCurrentLevel).toBe(false);
	});

	it('places on an upper-floor wall when that is the wall actually being pointed at', () => {
		// Standing on the first floor aiming at its own wall: it is the nearest hit, and on-level.
		const picked = pickOpeningWall(
			[candidate('first', 3), candidate('groundBehind', 0)],
			levelAt(3)
		);
		expect(picked?.hit).toBe('first');
		expect(picked?.onCurrentLevel).toBe(true);
	});

	it('resolves the current level per foundation — two foundations can be on different storeys at once', () => {
		const currentLevelBaseYOf = (foundationId: string) => (foundationId === 'f1' ? 0 : 3);
		// The nearest wall belongs to f2, which IS on the storey this wall sits at.
		const picked = pickOpeningWall(
			[candidate('f2-upper', 3, 'f2'), candidate('f1-upper', 3, 'f1')],
			currentLevelBaseYOf
		);
		expect(picked?.hit).toBe('f2-upper');
		expect(picked?.onCurrentLevel).toBe(true);

		// Same wall elevation, but pointing at f1's — f1 is on the ground floor, so it's off-level.
		const other = pickOpeningWall([candidate('f1-upper', 3, 'f1')], currentLevelBaseYOf);
		expect(other?.onCurrentLevel).toBe(false);
	});

	it('carries the candidate through unchanged, so callers keep their own hit payload', () => {
		const picked = pickOpeningWall([candidate('only', 3, 'fX')], levelAt(3));
		expect(picked).toEqual({
			hit: 'only',
			wallId: 'wall-only',
			foundationId: 'fX',
			baseY: 3,
			onCurrentLevel: true
		});
	});
});
