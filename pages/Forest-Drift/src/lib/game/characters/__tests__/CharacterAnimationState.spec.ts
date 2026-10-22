import { describe, expect, it } from 'vitest';
import { CharacterAnimationState } from '../CharacterAnimationState';
import { POSE_FLAGS } from '../../net/protocol';
import type { MotionFrame } from '../../net/RemoteMotion';
const pose = (changes: Partial<MotionFrame> = {}): MotionFrame => ({
	x: 0,
	y: 0,
	z: 0,
	yaw: 0,
	pitch: 0,
	speed: 0,
	stale: false,
	flags: POSE_FLAGS.grounded,
	...changes
});
const advance = (s: CharacterAnimationState, p: MotionFrame, frames = 60) => {
	for (let i = 0; i < frames; i++) s.update(p, 1 / 60, false, 0);
};
describe('layered character animation', () => {
	it('looks first, follows a continued turn, and wraps across pi without spinning', () => {
		const s = new CharacterAnimationState();
		s.update(pose(), 0, true, 0);
		advance(s, pose({ yaw: 0.4, pitch: 0.6 }));
		expect(s.bodyYaw).toBe(0);
		expect(s.headYaw).toBeCloseTo(0.4);
		expect(s.pitch).toBeCloseTo(0.6);
		advance(s, pose({ yaw: 1.2 }));
		expect(s.bodyYaw).toBeGreaterThan(1);
		expect(Math.abs(s.headYaw)).toBeLessThan(0.12);
		s.update(pose({ yaw: 3.1 }), 0, true, 0);
		advance(s, pose({ yaw: -3.1 }));
		expect(s.bodyYaw).toBeCloseTo(3.1);
		expect(Math.abs(s.headYaw)).toBeLessThan(0.1);
	});
	it('settles body alignment while moving and releases build reach when away or stale', () => {
		const s = new CharacterAnimationState();
		s.update(pose(), 0, true, 0);
		advance(s, pose({ yaw: 0.4, speed: 4, flags: POSE_FLAGS.grounded | POSE_FLAGS.building }));
		expect(s.bodyYaw).toBeCloseTo(0.4, 2);
		expect(s.reach).toBeGreaterThan(0.99);
		advance(s, pose({ flags: POSE_FLAGS.building, stale: true }));
		expect(s.reach).toBeLessThan(0.001);
	});
	it('absorbs impact smoothly, plants feet, and settles without fake spawn/teleport landings', () => {
		const s = new CharacterAnimationState();
		s.update(pose(), 1 / 60, true, 0);
		expect(s.compression).toBe(0);
		for (let i = 0; i < 20; i++) s.update(pose({ flags: 0 }), 1 / 60, false, -0.1);
		s.update(pose(), 1 / 60, false, 0);
		const initial = s.compression;
		advance(s, pose(), 4);
		expect(s.compression).toBeGreaterThan(initial);
		expect(s.compression).toBeLessThan(0.18);
		advance(s, pose(), 30);
		expect(s.compression).toBe(0);
		s.update(pose({ flags: 0 }), 1 / 60, true, -100);
		s.update(pose(), 1 / 60, true, 0);
		expect(s.compression).toBe(0);
	});
	it('does not treat leaving flight or a stale pose as a jump impact', () => {
		const s = new CharacterAnimationState();
		s.update(pose({ flags: POSE_FLAGS.flying }), 0, true, 0);
		advance(s, pose({ flags: POSE_FLAGS.flying }));
		advance(s, pose(), 5);
		expect(s.compression).toBe(0);
	});
});

it.each([-1, 1])('keeps sideways heading stable near the backward boundary (%s)', (side) => {
	const s = new CharacterAnimationState();
	s.update(pose(), 0, true, 0);
	for (let i = 0; i < 180; i++)
		s.update(pose(), 1 / 60, false, 0, 2, side * (Math.PI / 2 + (i % 2 ? 0.07 : -0.01)));
	expect(s.backpedaling).toBe(false);
	expect(Math.sign(s.bodyYaw)).toBe(side);
	expect(Math.abs(s.bodyYaw)).toBeGreaterThan(1.4);
});
it('backpedals without turning away and resumes left/forward travel', () => {
	const s = new CharacterAnimationState();
	s.update(pose(), 0, true, 0);
	for (let i = 0; i < 120; i++) s.update(pose(), 1 / 60, false, 0, 2, Math.PI);
	expect(s.backpedaling).toBe(true);
	expect(s.bodyYaw).toBeCloseTo(0);
	for (let i = 0; i < 120; i++) s.update(pose(), 1 / 60, false, 0, 2, Math.PI / 2);
	expect(s.backpedaling).toBe(false);
	expect(s.bodyYaw).toBeCloseTo(Math.PI / 2, 2);
	for (let i = 0; i < 120; i++) s.update(pose(), 1 / 60, false, 0, 2, 0);
	expect(s.bodyYaw).toBeCloseTo(0, 2);
});
