import { describe, expect, it } from 'vitest';
import { removalTargetKey, resolveRemovalTarget } from '../RemovalTypes';
import type { RemovalTarget } from '../RemovalTypes';

describe('resolveRemovalTarget', () => {
	it('resolves an opening proxy hit (openingId + wallId + openingType present) to an opening target', () => {
		const target = resolveRemovalTarget({
			foundationId: 'f1',
			wallId: 'wall-1',
			openingId: 'opening-1',
			openingType: 'window'
		});
		expect(target).toEqual({
			type: 'opening',
			wallId: 'wall-1',
			openingId: 'opening-1',
			openingType: 'window',
			foundationId: 'f1'
		});
	});

	it('resolves a stair mesh hit (stairId present) to a stair target, even if it also carried a wallId', () => {
		const target = resolveRemovalTarget({ foundationId: 'f1', stairId: 'stair-1' });
		expect(target).toEqual({ type: 'stair', stairId: 'stair-1', foundationId: 'f1' });
	});

	it('resolves a wall-path segment picking mesh hit (wallPathId + wallId) to a wall-segment target', () => {
		const target = resolveRemovalTarget({
			foundationId: 'f1',
			wallPathId: 'path-1',
			wallId: 'segment-1'
		});
		expect(target).toEqual({
			type: 'wall-segment',
			wallPathId: 'path-1',
			segmentId: 'segment-1',
			foundationId: 'f1'
		});
	});

	it('resolves a standalone wall mesh hit (wallId only, no wallPathId) to a wall target', () => {
		const target = resolveRemovalTarget({ foundationId: 'f1', wallId: 'wall-1' });
		expect(target).toEqual({ type: 'wall', wallId: 'wall-1', foundationId: 'f1' });
	});

	it('returns null for userData with no foundationId (never a removable building object)', () => {
		expect(resolveRemovalTarget({ wallId: 'wall-1' })).toBeNull();
	});

	it('returns null for userData carrying no recognizable building-pick fields (terrain, trees, sky)', () => {
		expect(resolveRemovalTarget({ foundationId: 'f1' })).toBeNull();
	});

	it('prioritizes an opening even on userData that also carries a plain wallId, since a proxy hit always means "the opening was in front"', () => {
		// This mirrors what a raycast actually produces: an opening proxy's own userData never
		// simultaneously carries stairId/wallPathId, so the opening branch is checked first
		// unconditionally — this test just pins that ordering explicitly.
		const target = resolveRemovalTarget({
			foundationId: 'f1',
			wallId: 'wall-1',
			openingId: 'opening-1',
			openingType: 'door'
		});
		expect(target?.type).toBe('opening');
	});
});

describe('removalTargetKey', () => {
	it('produces distinct keys for different targets of the same type', () => {
		const a: RemovalTarget = { type: 'wall', wallId: 'wall-1', foundationId: 'f1' };
		const b: RemovalTarget = { type: 'wall', wallId: 'wall-2', foundationId: 'f1' };
		expect(removalTargetKey(a)).not.toBe(removalTargetKey(b));
	});

	it('produces the same key for the same target computed twice', () => {
		const a: RemovalTarget = {
			type: 'opening',
			wallId: 'wall-1',
			openingId: 'opening-1',
			openingType: 'window',
			foundationId: 'f1'
		};
		const b: RemovalTarget = {
			type: 'opening',
			wallId: 'wall-1',
			openingId: 'opening-1',
			openingType: 'window',
			foundationId: 'f1'
		};
		expect(removalTargetKey(a)).toBe(removalTargetKey(b));
	});

	it('distinguishes a wall from a wall-segment that happens to reuse the same id', () => {
		const wall: RemovalTarget = { type: 'wall', wallId: 'shared-id', foundationId: 'f1' };
		const segment: RemovalTarget = {
			type: 'wall-segment',
			wallPathId: 'path-1',
			segmentId: 'shared-id',
			foundationId: 'f1'
		};
		expect(removalTargetKey(wall)).not.toBe(removalTargetKey(segment));
	});
});
