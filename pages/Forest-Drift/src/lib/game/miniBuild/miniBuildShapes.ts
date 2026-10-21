import { MINI_BUILD_LIMITS, type MiniBuildBlock, type MiniBuildShape } from './MiniBuildTypes';

export function shapeCount(blocks: readonly MiniBuildBlock[], shape: MiniBuildShape): number {
	return blocks.filter((block) => (block.shape ?? 'cuboid') === shape).length;
}
export function shapeLimit(shape: MiniBuildShape): number {
	return shape === 'cylinder'
		? MINI_BUILD_LIMITS.maxCylinders
		: shape === 'sphere'
			? MINI_BUILD_LIMITS.maxSpheres
			: MINI_BUILD_LIMITS.maxBlocks;
}
export function shapeLimitError(blocks: readonly MiniBuildBlock[]): string | null {
	for (const shape of ['cuboid', 'cylinder', 'sphere'] as const) {
		if (shapeCount(blocks, shape) > shapeLimit(shape))
			return `Maximum ${shapeLimit(shape)} ${shape === 'cuboid' ? 'blocks' : shape + 's'}.`;
	}
	return null;
}

type Point = [number, number, number];
/** Fixed topology: 32 triangles/cylinder, 48/sphere. No tessellation at runtime. */
function triangles(shape: 'cylinder' | 'sphere'): readonly Point[][] {
	const result: Point[][] = [];
	const add = (a: Point, b: Point, c: Point) => {
		const ab = b.map((v, i) => v - a[i]);
		const ac = c.map((v, i) => v - a[i]);
		const n = [
			ab[1] * ac[2] - ab[2] * ac[1],
			ab[2] * ac[0] - ab[0] * ac[2],
			ab[0] * ac[1] - ab[1] * ac[0]
		];
		if (Math.hypot(...n) < 1e-9) return;
		result.push(
			n.reduce((sum, v, i) => sum + v * (a[i] + b[i] + c[i]), 0) < 0 ? [a, c, b] : [a, b, c]
		);
	};
	const ring = (i: number, y: number, radius = 0.5): Point => [
		Math.cos((i * Math.PI) / 4) * radius,
		y,
		Math.sin((i * Math.PI) / 4) * radius
	];
	for (let i = 0; i < 8; i++) {
		if (shape === 'cylinder') {
			const a = ring(i, -0.5),
				b = ring(i + 1, -0.5),
				c = ring(i + 1, 0.5),
				d = ring(i, 0.5);
			add(a, b, c);
			add(a, c, d);
			add([0, -0.5, 0], a, b);
			add([0, 0.5, 0], c, d);
		} else {
			for (let j = 0; j < 4; j++) {
				const lat = (j * Math.PI) / 4 - Math.PI / 2,
					next = lat + Math.PI / 4;
				const a = ring(i, Math.sin(lat) * 0.5, Math.cos(lat) * 0.5),
					b = ring(i + 1, Math.sin(lat) * 0.5, Math.cos(lat) * 0.5);
				const c = ring(i + 1, Math.sin(next) * 0.5, Math.cos(next) * 0.5),
					d = ring(i, Math.sin(next) * 0.5, Math.cos(next) * 0.5);
				add(a, b, c);
				add(a, c, d);
			}
		}
	}
	return result;
}
export const MINI_BUILD_SHAPE_TRIANGLES = {
	cylinder: triangles('cylinder'),
	sphere: triangles('sphere')
};
