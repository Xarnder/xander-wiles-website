import { describe, expect, it } from 'vitest';
import { PoseSender, type LocalPose } from '../PoseSender';
import { POSE_FLAGS } from '../protocol';

const FRAME = 1000 / 60;

function at(x: number, overrides: Partial<LocalPose> = {}): LocalPose {
	return { x, feetY: 0, z: 0, yaw: 0, pitch: 0, flying: false, ...overrides };
}

describe('PoseSender', () => {
	it('sends every 100 ms (every 6th frame at 60 fps) while moving', () => {
		const sender = new PoseSender();
		const sendTimes: number[] = [];
		for (let i = 0; i < 61; i++) {
			const t = i * FRAME;
			if (sender.sample(at(i * 0.1), t, 5000 + t)) sendTimes.push(Math.round(t));
		}
		expect(sendTimes).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
	});

	it('sends one final stopped pose, then nothing while standing still', () => {
		const sender = new PoseSender();
		sender.sample(at(0), 0, 0);
		sender.sample(at(1), 100, 100);
		const stop = sender.sample(at(1), 116, 116)!;
		expect(stop.flags & POSE_FLAGS.moving).toBe(0);
		expect(stop.x).toBe(1);
		for (let t = 133; t < 2000; t += FRAME) expect(sender.sample(at(1), t, t)).toBeNull();
	});

	it('flags a large jump as a teleport and sends it immediately', () => {
		const sender = new PoseSender();
		sender.sample(at(0), 0, 0);
		const jump = sender.sample(at(500), 16, 16)!;
		expect(jump.flags & POSE_FLAGS.teleport).toBeTruthy();
	});

	it('sends one away pose when frames stop, and clears it on the next frame', () => {
		const sender = new PoseSender();
		sender.sample(at(0), 0, 0);
		const away = sender.markAway(700, 700)!;
		expect(away.flags & POSE_FLAGS.away).toBeTruthy();
		expect(sender.markAway(900, 900)).toBeNull();
		const back = sender.sample(at(0), 1000, 1000)!;
		expect(back.flags & POSE_FLAGS.away).toBe(0);
	});

	it('resends the current pose on request even when still', () => {
		const sender = new PoseSender();
		sender.sample(at(3), 0, 0); // first pose
		sender.sample(at(3), 16, 16); // its "stopped" follow-up
		expect(sender.sample(at(3), 500, 500)).toBeNull();
		sender.forceNext();
		expect(sender.sample(at(3), 516, 516)!.x).toBe(3);
	});

	it('waits for the room clock before sending anything', () => {
		const sender = new PoseSender();
		expect(sender.sample(at(0), 0, Number.NaN)).toBeNull();
	});

	it('drops to one pose a second while alone, and back to full rate (at once) when joined', () => {
		const sender = new PoseSender();
		sender.setAlone(true);
		const sendTimes: number[] = [];
		for (let i = 0; i <= 150; i++) {
			const t = i * FRAME;
			if (i === 130) sender.setAlone(false);
			if (sender.sample(at(i * 0.1), t, t)) sendTimes.push(Math.round(t));
		}
		expect(sendTimes.filter((t) => t < 2150)).toEqual([0, 1000, 2000]);
		// Someone joined at frame 130 (2167 ms): an immediate pose, then every 100 ms.
		expect(sendTimes.filter((t) => t >= 2150)).toEqual([2167, 2267, 2367, 2467]);
	});

	it('while a menu is open, sends one away pose and then nothing; resumes when it closes', () => {
		const sender = new PoseSender();
		sender.sample(at(0), 0, 0);
		sender.setAway(true);
		const away = sender.sample(at(0), 16, 16)!;
		expect(away.flags & POSE_FLAGS.away).toBeTruthy();
		for (let t = 33; t < 1000; t += FRAME) expect(sender.sample(at(0), t, t)).toBeNull();
		sender.setAway(false);
		const back = sender.sample(at(0), 1000, 1000)!;
		expect(back.flags & POSE_FLAGS.away).toBe(0);
	});
});

describe('character state flags', () => {
	it('sends ground and run transitions immediately without enlarging the pose', () => {
		const sender = new PoseSender();
		const pose = {
			x: 0,
			feetY: 0,
			z: 0,
			yaw: 0,
			pitch: 0,
			flying: false,
			grounded: true,
			running: false
		};
		expect(sender.sample(pose, 0, 0)!.flags & POSE_FLAGS.grounded).toBe(POSE_FLAGS.grounded);
		const jump = sender.sample({ ...pose, grounded: false }, 10, 10)!;
		expect(jump.flags & POSE_FLAGS.grounded).toBe(0);
		const run = sender.sample({ ...pose, running: true }, 20, 20)!;
		expect(run.flags & POSE_FLAGS.running).toBe(POSE_FLAGS.running);
	});
});
