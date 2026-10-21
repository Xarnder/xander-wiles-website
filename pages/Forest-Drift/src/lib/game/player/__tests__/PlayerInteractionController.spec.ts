import { describe, expect, it, vi } from 'vitest';
import {
	PlayerInteractionController,
	chooseInteraction,
	InteractionOccupancyManager
} from '../PlayerInteractionController';
import { resolvePlayerInteractionPose } from '../PlayerInteractionPoseResolver';
import { PLAYER_BODY } from '../PlayerBodyDimensions';
import {
	createInteraction,
	resolveMiniBuildInteraction
} from '../../miniBuild/MiniBuildInteractions';
import { testDefinition } from '../../miniBuild/__tests__/miniBuildFixtures';
import type { FirstPersonController } from '../FirstPersonController';
const anchor = () => {
	const d = testDefinition([[0, 0, 0, 32, 16, 32]], { unit: 1 });
	return resolveMiniBuildInteraction(
		d,
		{ id: 'placed', designId: d.id, position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
		createInteraction('sit', { x: 16, y: 16, z: 16 })
	);
};
function fixture() {
	const target = anchor();
	const player = {
		worldPosition: { x: 0, y: 1.7, z: 2 },
		interactionPose: null as ReturnType<typeof resolvePlayerInteractionPose> | null,
		onInteractionExit: null,
		beginInteraction: vi.fn((p: ReturnType<typeof resolvePlayerInteractionPose>) => {
			player.interactionPose = p;
		}),
		endInteraction: vi.fn(() => {
			player.interactionPose = null;
		})
	};
	const host = {
		player: player as unknown as FirstPersonController,
		pick: vi.fn(() => target),
		resolve: vi.fn(() => target),
		blocked: vi.fn(() => false),
		exitPosition: vi.fn(() => ({ x: 2, y: 1.7, z: 0 })),
		inputAllowed: () => true,
		onPrompt: vi.fn()
	};
	return { controller: new PlayerInteractionController(host), host, player, target };
}
describe('player interactions', () => {
	it('enters via the shared pose resolver, exits and releases its occupancy', () => {
		const { controller, player, target, host } = fixture();
		expect(controller.toggle()).toBe(true);
		expect(player.beginInteraction).toHaveBeenCalledWith(
			resolvePlayerInteractionPose('sit', target.position, target.yaw)
		);
		expect(controller.state.type).toBe('mini-build');
		controller.toggle();
		expect(host.exitPosition).toHaveBeenCalled();
		expect(controller.state.type).toBe('none');
		expect(controller.occupancy.available(target.instanceId, target.locationId, 'another')).toBe(
			true
		);
	});
	it('rejects blocked or occupied targets', () => {
		const { controller, host, target } = fixture();
		host.blocked.mockReturnValue(true);
		expect(controller.toggle()).toBe(false);
		host.blocked.mockReturnValue(false);
		controller.occupancy.claim(target.instanceId, target.locationId, 'another');
		expect(controller.toggle()).toBe(false);
	});
	it.each(['deletion', 'revision', 'move'] as const)('safely exits after %s', (reason) => {
		const { controller, host, target, player } = fixture();
		controller.toggle();
		host.resolve.mockReturnValue(
			reason === 'deletion'
				? null!
				: {
						...target,
						revision: target.revision + (reason === 'revision' ? 1 : 0),
						position: { ...target.position, x: reason === 'move' ? 10 : 0 }
					}
		);
		controller.update(0.1);
		expect(controller.state.type).toBe('none');
		expect(player.endInteraction).toHaveBeenCalled();
	});
	it('does not overwrite an explicit teleport with the old standing position', () => {
		const { controller, player } = fixture();
		controller.toggle();
		player.interactionPose = null;
		player.worldPosition = { x: 100, y: 20, z: 100 };
		controller.update(0.1);
		expect(controller.state.type).toBe('none');
		expect(player.endInteraction).not.toHaveBeenCalled();
		expect(player.worldPosition.x).toBe(100);
	});
	it('ranks bench anchors by the aimed surface and falls back around unavailable anchors', () => {
		const a = anchor(),
			b = { ...a, locationId: 'b', position: { x: 1, y: 0.5, z: 0 } };
		expect(
			chooseInteraction([a, b], { x: 0, y: 1.7, z: 1 }, { x: 1, y: 0.5, z: 0 }, () => true)
		).toBe(b);
		expect(
			chooseInteraction([a, b], { x: 0, y: 1.7, z: 1 }, { x: 1, y: 0.5, z: 0 }, (l) => l !== b)
		).toBe(a);
		expect(chooseInteraction([a], { x: 0, y: 1.7, z: 10 }, a.position, () => true)).toBeNull();
	});
	it('keeps another player’s occupancy when an optimistic local claim is rejected', () => {
		const occupancy = new InteractionOccupancyManager();
		occupancy.claim('a', 'b');
		occupancy.sync([{ playerId: 'other', instanceId: 'a', locationId: 'b' }], 'self');
		occupancy.release('a', 'b');
		expect(occupancy.available('a', 'b')).toBe(false);
	});
	it('rotates the lie eye offset with the head direction, without camera roll', () => {
		const pose = resolvePlayerInteractionPose('lie', { x: 1, y: 2, z: 3 }, Math.PI / 2);
		expect(pose.eye.x).toBeCloseTo(1 - (PLAYER_BODY.eyeHeight - PLAYER_BODY.pelvisHeight));
		expect(pose.eye.z).toBeCloseTo(3);
		expect(pose.bodyTilt).toBe(-Math.PI / 2);
		expect(pose.eye.y).toBeGreaterThan(2);
	});
});
