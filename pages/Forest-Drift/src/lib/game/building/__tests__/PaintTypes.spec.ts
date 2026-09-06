import { describe, expect, it } from 'vitest';
import { paintTargetKey, resolvePaintTarget } from '../PaintTypes';
import type { PaintTarget } from '../PaintTypes';

describe('resolvePaintTarget', () => {
	it('resolves a slab mesh hit (slabId present) to a slab target', () => {
		const target = resolvePaintTarget({ foundationId: 'f1', slabId: 'slab-1' });
		expect(target).toEqual({ type: 'slab', foundationId: 'f1', slabId: 'slab-1' });
	});

	it('resolves a wall-path segment picking mesh hit (wallPathId + wallId) to a wall-segment target', () => {
		const target = resolvePaintTarget({
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

	it('resolves a standalone wall mesh hit (wallId only) to a wall target', () => {
		const target = resolvePaintTarget({ foundationId: 'f1', wallId: 'wall-1' });
		expect(target).toEqual({ type: 'wall', wallId: 'wall-1', foundationId: 'f1' });
	});

	it('resolves a mesh with only foundationId to a foundation target', () => {
		const target = resolvePaintTarget({ foundationId: 'f1' });
		expect(target).toEqual({ type: 'foundation', foundationId: 'f1' });
	});

	it('returns null for userData with no foundationId (never a paintable object)', () => {
		expect(resolvePaintTarget({ wallId: 'wall-1' })).toBeNull();
	});

	it('prioritizes slab over a stray wallId on the same userData', () => {
		const target = resolvePaintTarget({ foundationId: 'f1', slabId: 'slab-1', wallId: 'wall-1' });
		expect(target?.type).toBe('slab');
	});
});

describe('paintTargetKey', () => {
	it('produces distinct keys for different targets of the same type', () => {
		const a: PaintTarget = { type: 'wall', wallId: 'wall-1', foundationId: 'f1' };
		const b: PaintTarget = { type: 'wall', wallId: 'wall-2', foundationId: 'f1' };
		expect(paintTargetKey(a)).not.toBe(paintTargetKey(b));
	});

	it('distinguishes a wall from a wall-segment that happens to reuse the same id', () => {
		const wall: PaintTarget = { type: 'wall', wallId: 'shared-id', foundationId: 'f1' };
		const segment: PaintTarget = {
			type: 'wall-segment',
			wallPathId: 'path-1',
			segmentId: 'shared-id',
			foundationId: 'f1'
		};
		expect(paintTargetKey(wall)).not.toBe(paintTargetKey(segment));
	});

	it('produces the same key for the same target computed twice', () => {
		const a: PaintTarget = { type: 'foundation', foundationId: 'f1' };
		const b: PaintTarget = { type: 'foundation', foundationId: 'f1' };
		expect(paintTargetKey(a)).toBe(paintTargetKey(b));
	});
});
