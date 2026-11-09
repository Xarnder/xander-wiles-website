import { describe, expect, it } from 'vitest';
import {
	HITBOX_MIN_HALF,
	HITBOX_PADDING_MAX,
	creatureHitbox,
	creatureRayHit,
	hitboxDistance,
	rayEntersHitbox
} from './creatureHitbox';

/** A small quadruped: 0.3 m wide, 0.5 m tall, 0.8 m long (nose towards +z). */
const small = { min: { x: -0.15, y: 0, z: -0.4 }, max: { x: 0.15, y: 0.5, z: 0.4 } };
const smallCore = { radius: 0.15, height: 0.5 };
/** A giant biped: 6 m wide (arms out), 20 m tall, 4 m deep; its body 2 m across. */
const giant = { min: { x: -3, y: 0, z: -2 }, max: { x: 3, y: 20, z: 2 } };
const giantCore = { radius: 1, height: 20 };
const origin = { x: 0, y: 0, z: 0 };
const unit = (x: number, y: number, z: number) => {
	const l = Math.hypot(x, y, z);
	return { x: x / l, y: y / l, z: z / l };
};

describe('creature hitboxes', () => {
	it('are much larger than a small creature, never smaller than the minimum', () => {
		const box = creatureHitbox(small, origin, 0);
		expect(box.half.x).toBeGreaterThanOrEqual(HITBOX_MIN_HALF);
		expect(box.half.z).toBeGreaterThan(0.4 + 0.3);
		expect(box.centre.y + box.half.y).toBeGreaterThan(0.5 + 0.3);
		expect(box.centre.y - box.half.y).toBeLessThanOrEqual(0);
	});

	it('cap the padding on a giant', () => {
		const box = creatureHitbox(giant, origin, 0);
		expect(box.half.x).toBeCloseTo(3 + HITBOX_PADDING_MAX, 5);
		expect(box.half.z).toBeCloseTo(2 + HITBOX_PADDING_MAX, 5);
	});

	it('turn with the creature', () => {
		const offCentre = { min: { x: -0.2, y: 0, z: 0 }, max: { x: 0.2, y: 0.5, z: 2 } };
		const box = creatureHitbox(offCentre, origin, Math.PI / 2);
		// Facing +x (Three.js yaw π/2), the body's +z half is now along +x.
		expect(box.centre.x).toBeCloseTo(1, 5);
		expect(box.centre.z).toBeCloseTo(0, 5);
		// Aimed along the body's length, a ray 1.5 m to the side misses; along +x it hits.
		const eye = { x: -3, y: 0.3, z: 0 };
		expect(rayEntersHitbox(eye, unit(1, 0, 0), box, 10)).not.toBeNull();
		expect(rayEntersHitbox({ x: 1, y: 0.3, z: -5 }, unit(0, 0, 1), box, 10)).not.toBeNull();
		expect(rayEntersHitbox({ x: 1.6 + 2, y: 0.3, z: -5 }, unit(0, 0, 1), box, 10)).toBeNull();
	});

	it('are hit by a look ray that just misses the body', () => {
		const eye = { x: 0, y: 1.6, z: -2.5 };
		// Aimed 0.35 m to the side of a 0.3 m wide creature, at its middle height.
		const dir = unit(0.35, 0.25 - 1.6, 2.5);
		const t = creatureRayHit(small, smallCore, origin, 0, eye, dir, 3);
		expect(t).not.toBeNull();
		expect(t!).toBeLessThan(3);
	});

	it('respect reach', () => {
		const eye = { x: 0, y: 0.3, z: -10 };
		expect(creatureRayHit(small, smallCore, origin, 0, eye, unit(0, 0, 1), 3)).toBeNull();
		expect(creatureRayHit(small, smallCore, origin, 0, eye, unit(0, 0, 1), 10)).not.toBeNull();
	});

	it('beside the creature, only its body counts, not whichever way you look', () => {
		// Inside the padded box, looking away.
		const eye = { x: 0.45, y: 0.4, z: 0 };
		expect(creatureRayHit(small, smallCore, origin, 0, eye, unit(1, 0, 0), 3)).toBeNull();
		// Looking at it.
		const t = creatureRayHit(small, smallCore, origin, 0, eye, unit(-1, 0, 0), 3);
		expect(t).not.toBeNull();
		expect(t!).toBeCloseTo(0.45 - 0.15 - 0.1, 5);
	});

	it('beside a giant (or just off it), only its body counts', () => {
		// 2 m out from its middle, inside its padded box, beside its body.
		const eye = { x: 2, y: 12, z: 0 };
		for (const dir of [unit(1, 0, 0), unit(0, 1, 0), unit(0.2, 1, 0)])
			expect(creatureRayHit(giant, giantCore, origin, 0, eye, dir, 3)).toBeNull();
		expect(creatureRayHit(giant, giantCore, origin, 0, eye, unit(-1, 0, 0), 3)).toBeCloseTo(
			2 - 1.1,
			5
		);
	});

	it('measure how far a point is from them, in any direction', () => {
		const box = { centre: { x: 0, y: 1, z: 0 }, half: { x: 1, y: 1, z: 2 }, yaw: Math.PI / 2 };
		expect(hitboxDistance({ x: 0, y: 1, z: 0 }, box)).toBe(0);
		// Turned a quarter: its 2 m half-length now lies along x.
		expect(hitboxDistance({ x: 3, y: 1, z: 0 }, box)).toBeCloseTo(1, 5);
		expect(hitboxDistance({ x: 0, y: 1, z: 3 }, box)).toBeCloseTo(2, 5);
		expect(hitboxDistance({ x: 3, y: 4, z: 0 }, box)).toBeCloseTo(Math.hypot(1, 2), 5);
	});
});
