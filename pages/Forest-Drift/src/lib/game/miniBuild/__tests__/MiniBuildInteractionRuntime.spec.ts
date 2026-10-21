import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MiniBuildInteractionRuntime } from '../MiniBuildInteractionRuntime';
import { createInteraction, resolveMiniBuildInteraction } from '../MiniBuildInteractions';
import { testDefinition } from './miniBuildFixtures';
import type { MiniBuildSystem } from '../MiniBuildSystem';
import type { FirstPersonController } from '../../player/FirstPersonController';
import type { WorldSurfaceSampler } from '../../building/WorldSurfaceSampler';
import type { WallCollisionRect } from '../../building/wallCollision';
function fixture() {
	vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
	const definition = testDefinition([[0, 0, 0, 32, 16, 32]], { unit: 1 });
	const location = createInteraction('sit', { x: 16, y: 16, z: 16 });
	definition.interactionLocations = [location];
	const instance = {
		id: 'owner',
		designId: definition.id,
		position: { x: 0, y: 0, z: 0 },
		rotationY: 0
	};
	const queryCollisionBoxes = vi.fn<
		(
			bounds: unknown,
			ignore?: string
		) => { id: string; box: ReturnType<typeof resolveMiniBuildInteraction>['box'] }[]
	>(() => [] as { id: string; box: ReturnType<typeof resolveMiniBuildInteraction>['box'] }[]);
	const instances = {
		get: () => instance,
		getChunkOf: () => '0,0',
		isChunkActive: () => true,
		queryCollisionBoxes
	};
	const surfaces = {
		getSupportingSurfaceY: vi.fn(() => 0),
		getCeilingBlockY: vi.fn(() => null as number | null)
	};
	let walls: WallCollisionRect[] = [];
	const runtime = new MiniBuildInteractionRuntime({
		system: { instances, getDesign: () => definition } as unknown as MiniBuildSystem,
		scene: new THREE.Scene(),
		camera: new THREE.PerspectiveCamera(),
		player: {
			worldPosition: new THREE.Vector3(0, 1.7, 2),
			onInteractionExit: null
		} as unknown as FirstPersonController,
		surfaces: surfaces as unknown as WorldSurfaceSampler,
		getWalls: () => walls,
		getOccluders: () => [],
		inputAllowed: () => false,
		waterBlocked: () => false,
		eyeHeight: () => 1.7,
		onPrompt: () => {},
		registerMaterial: () => {}
	});
	return {
		runtime,
		surfaces,
		queryCollisionBoxes,
		location: resolveMiniBuildInteraction(definition, instance, location),
		setWalls: (next: WallCollisionRect[]) => {
			walls = next;
		}
	};
}
afterEach(() => vi.unstubAllGlobals());
describe('interaction clearance and exits', () => {
	it('checks walls, other instances, overhead slabs, and raised ground while excluding only its own instance', () => {
		const f = fixture();
		expect(f.runtime.blocked(f.location.box, 'owner')).toBe(false);
		expect(f.queryCollisionBoxes.mock.calls[0][1]).toBe('owner');
		f.setWalls([
			{
				centerX: 0,
				centerZ: 0,
				halfLength: 1,
				halfThickness: 0.1,
				dirX: 1,
				dirZ: 0,
				minWorldY: 0,
				maxWorldY: 3
			}
		]);
		expect(f.runtime.blocked(f.location.box, 'owner')).toBe(true);
		f.setWalls([]);
		f.queryCollisionBoxes.mockReturnValue([{ id: 'other', box: f.location.box }]);
		expect(f.runtime.blocked(f.location.box, 'owner')).toBe(true);
		f.queryCollisionBoxes.mockReturnValue([]);
		f.surfaces.getCeilingBlockY.mockReturnValue(1);
		expect(f.runtime.blocked(f.location.box, 'owner')).toBe(true);
		f.surfaces.getCeilingBlockY.mockReturnValue(null);
		f.surfaces.getSupportingSurfaceY.mockReturnValue(2);
		expect(f.runtime.blocked(f.location.box, 'owner')).toBe(true);
		f.runtime.dispose();
	});
	it('chooses a side exit when the front is blocked and never ignores the owner when standing', () => {
		const f = fixture();
		f.setWalls([
			{
				centerX: 0,
				centerZ: -1,
				halfLength: 0.6,
				halfThickness: 0.15,
				dirX: 1,
				dirZ: 0,
				minWorldY: 0,
				maxWorldY: 3
			}
		]);
		const exit = f.runtime.controller.host.exitPosition(f.location, { x: 0, y: 1.7, z: 2 });
		expect(Math.abs(exit.x)).toBeGreaterThan(0.8);
		expect(exit.y).toBe(1.7);
		expect(f.queryCollisionBoxes.mock.calls.every((call) => call[1] === undefined)).toBe(true);
		f.runtime.dispose();
	});
});
