import { describe, expect, it } from 'vitest';
import { rectangleWallPoints } from '../PolygonWallTool';
import { pathSelfIntersects } from '../wallPathMath';

const corners = (points: { gridX: number; gridZ: number }[]) =>
	points.map((p) => [p.gridX, p.gridZ]);

describe('Corner Walls: a room from two opposite corners', () => {
	it('walks the four corners in order, starting at the first click', () => {
		expect(corners(rectangleWallPoints({ gridX: 4, gridZ: 4 }, { gridX: 20, gridZ: 16 }))).toEqual([
			[4, 4],
			[20, 4],
			[20, 16],
			[4, 16]
		]);
	});

	it('works whichever diagonal is drawn, always a right-angled loop that never crosses itself', () => {
		for (const [a, c] of [
			[
				{ gridX: 20, gridZ: 16 },
				{ gridX: 4, gridZ: 4 }
			],
			[
				{ gridX: 4, gridZ: 16 },
				{ gridX: 20, gridZ: 4 }
			],
			[
				{ gridX: 20, gridZ: 4 },
				{ gridX: 4, gridZ: 16 }
			]
		]) {
			const points = rectangleWallPoints(a, c);
			expect(points[0]).toEqual(a);
			expect(points[2]).toEqual(c);
			// Every side runs along one grid axis: right angles only.
			for (let i = 0; i < 4; i++) {
				const p = points[i],
					q = points[(i + 1) % 4];
				expect(p.gridX === q.gridX || p.gridZ === q.gridZ).toBe(true);
			}
			const local = points.map((p) => ({ x: p.gridX * 0.25, z: p.gridZ * 0.25 }));
			expect(pathSelfIntersects(local, true)).toBe(false);
		}
	});
});
