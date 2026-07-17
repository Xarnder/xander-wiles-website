import { describe, expect, it } from 'vitest';
import { MissionManager, type MissionContext } from './MissionManager';

const context: MissionContext = {
	hasTarget: false,
	hasLock: false,
	regularTargetsDestroyed: 0,
	finalTargetDestroyed: false,
	playerHealth: 100
};

describe('MissionManager', () => {
	it('advances through the complete deterministic mission sequence', () => {
		const mission = new MissionManager(true);
		mission.start();
		mission.update(0.21, context);
		expect(mission.phase).toBe('combat-zone');

		mission.update(0.01, { ...context, hasTarget: true });
		expect(mission.phase).toBe('first-lock');

		mission.update(0.01, { ...context, hasTarget: true, hasLock: true });
		expect(mission.phase).toBe('strikes');

		mission.update(0.01, { ...context, regularTargetsDestroyed: 5 });
		expect(mission.phase).toBe('final-target');

		mission.update(0.01, {
			...context,
			regularTargetsDestroyed: 5,
			finalTargetDestroyed: true
		});
		expect(mission.phase).toBe('egress');

		const events = mission.update(0.21, context);
		expect(mission.phase).toBe('complete');
		expect(events.some((event) => event.type === 'success')).toBe(true);
	});

	it('emits a failure without advancing when player health is depleted', () => {
		const mission = new MissionManager(true);
		mission.start();
		const events = mission.update(0.01, { ...context, playerHealth: 0 });

		expect(events.some((event) => event.type === 'failure')).toBe(true);
		expect(mission.phase).toBe('approach');
	});
});
