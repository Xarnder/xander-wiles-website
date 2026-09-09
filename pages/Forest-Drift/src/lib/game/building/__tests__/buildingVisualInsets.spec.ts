import { describe, expect, it } from 'vitest';
import {
	FRAME_BEAM_END_OVERHANG,
	FRAME_TOP_VISUAL_INSET,
	WALL_TOP_VISUAL_INSET,
	frameBeamTopY,
	framePostTopY,
	visualSegmentTopY
} from '../buildingVisualInsets';
import { buildWallGeometry } from '../WallGeometryBuilder';

describe('visualSegmentTopY', () => {
	it('insets only the authored wall cap, never a mid-wall lintel', () => {
		expect(visualSegmentTopY(3, 3)).toBeCloseTo(3 - WALL_TOP_VISUAL_INSET);
		expect(visualSegmentTopY(2.1, 3)).toBe(2.1);
	});
});

describe('frame / wall / slab stacking', () => {
	it('keeps slab (authored) above the beam, and the beam above the wall body', () => {
		const authored = 3;
		const slabTop = authored;
		const beamTop = frameBeamTopY(authored);
		const wallTop = visualSegmentTopY(authored, authored);
		expect(slabTop).toBeGreaterThan(beamTop);
		expect(beamTop).toBeGreaterThan(wallTop);
		expect(FRAME_TOP_VISUAL_INSET).toBeLessThan(WALL_TOP_VISUAL_INSET);
		expect(FRAME_BEAM_END_OVERHANG).toBeGreaterThan(0);
	});

	it('tucks the post top inside the beam rather than onto the beam underside', () => {
		const beamTop = frameBeamTopY(3);
		const beamHeight = 0.24;
		const beamBottom = beamTop - beamHeight;
		const postTop = framePostTopY(beamBottom, beamHeight);
		expect(postTop).toBeGreaterThan(beamBottom);
		expect(postTop).toBeLessThan(beamTop);
	});

	it('buildWallGeometry insets only the authored cap, not a lintel under a window', () => {
		const geometry = buildWallGeometry(
			[
				{ minU: 0, maxU: 2, minY: 0, maxY: 3 },
				{ minU: 2, maxU: 3, minY: 0, maxY: 1 },
				{ minU: 2, maxU: 3, minY: 2, maxY: 3 }
			],
			0.2,
			3
		);
		const position = geometry.getAttribute('position');
		let maxY = -Infinity;
		let hasLintelTop = false;
		for (let i = 0; i < position.count; i++) {
			const y = position.getY(i);
			maxY = Math.max(maxY, y);
			if (Math.abs(y - 1) < 1e-6) hasLintelTop = true;
		}
		expect(maxY).toBeCloseTo(3 - WALL_TOP_VISUAL_INSET, 5);
		expect(hasLintelTop).toBe(true);
		geometry.dispose();
	});
});
