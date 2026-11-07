import { describe, expect, it } from 'vitest';
import { projectileWorldHit, type ProjectileWorld } from '../projectileWorld';
import type { WallCollisionRect } from '../../building/wallCollision';

/**
 * Flat ground at 0, an upper floor slab 3.0–3.25 m over x ∈ [-5, 5] with a 1 m hole at the middle,
 * and a 0.2 m wall across x = 10, 0–3 m high.
 */
const SLAB = { bottom: 3, top: 3.25 };
const onSlab = (x: number) => Math.abs(x) <= 5 && Math.abs(x) > 0.5;
const wall: WallCollisionRect = {
	centerX: 10,
	centerZ: 0,
	halfLength: 5,
	halfThickness: 0.1,
	dirX: 0,
	dirZ: 1,
	minWorldY: 0,
	maxWorldY: 3
};
const world: ProjectileWorld = {
	supportingSurfaceY: (x, _z, referenceY) =>
		onSlab(x) && SLAB.top <= referenceY + 0.05 ? SLAB.top : 0,
	ceilingBlockY: (x, _z, fromY, toY) =>
		onSlab(x) && toY > fromY && SLAB.bottom > fromY && SLAB.bottom <= toY ? SLAB.bottom : null,
	insideSlab: (x, _z, y) => onSlab(x) && y > SLAB.bottom && y < SLAB.top,
	rects: () => [wall]
};

/** A path from `from` in direction (dx, dy) (x/y plane), `length` metres long. */
const shot = (from: { x: number; y: number }, angle: number, length: number) => ({
	from: { x: from.x, y: from.y, z: 0 },
	to: { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length, z: 0 }
});

describe('pellets against the world', () => {
	it('stop at a floor shot steeply down from above, not slipping between samples', () => {
		// 80° down from 2 m above the floor: each 20 cm step drops about 20 cm.
		const { from, to } = shot({ x: 2, y: 5.25 }, (-80 * Math.PI) / 180, 6);
		const hit = projectileWorldHit(from, to, world);
		expect(hit?.y).toBe(SLAB.top);
	});

	it('stop at a ceiling shot steeply up from below', () => {
		const { from, to } = shot({ x: 2, y: 1.6 }, (80 * Math.PI) / 180, 6);
		expect(projectileWorldHit(from, to, world)?.y).toBe(SLAB.bottom);
	});

	it('stop at the edge of a floor flown into sideways', () => {
		const { from, to } = shot({ x: -9, y: 3.1 }, 0, 6);
		const hit = projectileWorldHit(from, to, world);
		expect(hit).not.toBeNull();
		expect(hit!.x).toBeGreaterThanOrEqual(-5.01);
		expect(hit!.x).toBeLessThanOrEqual(-4.79);
	});

	it('stop at a wall, within one step of its near face, never past it', () => {
		const { from, to } = shot({ x: 6, y: 1.5 }, 0, 10);
		const hit = projectileWorldHit(from, to, world);
		expect(hit!.x).toBeGreaterThanOrEqual(9.84);
		expect(hit!.x).toBeLessThanOrEqual(10.1);
	});

	it('fly over a wall, through a hole in a floor, and on when nothing is in the way', () => {
		expect(
			projectileWorldHit(
				shot({ x: 6, y: 3.5 }, 0, 10).from,
				shot({ x: 6, y: 3.5 }, 0, 10).to,
				world
			)
		).toBeNull();
		const hole = shot({ x: 0, y: 6 }, -Math.PI / 2, 4);
		expect(projectileWorldHit(hole.from, hole.to, world)).toBeNull();
		const open = shot({ x: 20, y: 1.5 }, 0.05, 15);
		expect(projectileWorldHit(open.from, open.to, world)).toBeNull();
	});

	it('stop at the ground', () => {
		const { from, to } = shot({ x: 20, y: 1.5 }, -0.3, 10);
		expect(projectileWorldHit(from, to, world)?.y).toBe(0);
	});
});
