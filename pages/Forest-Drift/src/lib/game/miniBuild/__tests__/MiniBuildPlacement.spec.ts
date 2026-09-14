import { describe, expect, it } from 'vitest';
import { BuildingMaterialManager } from '../../building/BuildingMaterialManager';
import type { WallCollisionRect } from '../../building/wallCollision';
import { evaluateMiniBuildPlacement, type MiniBuildPlacementContext } from '../MiniBuildPlacement';
import { MiniBuildSystem } from '../MiniBuildSystem';
import { testDefinition } from './miniBuildFixtures';

type Context = Omit<MiniBuildPlacementContext, 'camera'>;

function context(
	system: MiniBuildSystem,
	options: {
		surfaceY?: (x: number, z: number, ref: number) => number;
		walls?: WallCollisionRect[];
	} = {}
): Context {
	return {
		buildingManager: {} as Context['buildingManager'],
		foundationManager: {
			getFoundationContaining: () => undefined
		} as unknown as Context['foundationManager'],
		worldSurfaceSampler: {
			getSupportingSurfaceY: options.surfaceY ?? (() => 0)
		} as unknown as Context['worldSurfaceSampler'],
		system,
		getTerrainMeshes: () => [],
		getWallRects: () => options.walls ?? [],
		getGridSize: () => 0.25
	};
}

function createSystem(): MiniBuildSystem {
	const system = new MiniBuildSystem({ materialManager: new BuildingMaterialManager() });
	system.update(0, 0);
	return system;
}

describe('evaluateMiniBuildPlacement', () => {
	it('uses the supporting surface under the object — upper floors, not terrain', () => {
		const system = createSystem();
		const design = system.importDefinition(testDefinition([[0, 0, 0, 8, 8, 8]], { id: 'crate' }));
		if (!design.ok) throw new Error(design.error);
		// Terrain at 0, an upper-floor slab at 5.2m that supports anything referenced from above it.
		const surfaceY = (_x: number, _z: number, ref: number) => (ref >= 5.2 ? 5.2 : 0);
		const preview = evaluateMiniBuildPlacement(
			context(system, { surfaceY }),
			design.value,
			0,
			{ x: 2, y: 5.2, z: 2 },
			1,
			null
		);
		expect(preview.valid).toBe(true);
		expect(preview.position.y).toBe(5.2);
		const ground = evaluateMiniBuildPlacement(
			context(system, { surfaceY }),
			design.value,
			0,
			{ x: 2, y: 0, z: 2 },
			1,
			null
		);
		expect(ground.position.y).toBe(0);
	});

	it('snaps the rotated footprint edge to the building grid', () => {
		const system = createSystem();
		// 5 × 3 grid units (0.3125 × 0.1875m) — an odd width whose anchor is not on a grid line.
		const design = system.importDefinition(testDefinition([[0, 0, 0, 5, 2, 3]], { id: 'odd' }));
		if (!design.ok) throw new Error(design.error);
		for (const rotation of [0, 90] as const) {
			const preview = evaluateMiniBuildPlacement(
				context(system),
				design.value,
				rotation,
				{ x: 1.03, y: 0, z: 2.11 },
				1,
				null
			);
			expect(
				Math.abs(preview.bounds.minX / 0.25 - Math.round(preview.bounds.minX / 0.25))
			).toBeLessThan(1e-9);
			expect(
				Math.abs(preview.bounds.minZ / 0.25 - Math.round(preview.bounds.minZ / 0.25))
			).toBeLessThan(1e-9);
		}
	});

	it('rejects walls and steep surfaces, but allows sitting flush against a wall', () => {
		const system = createSystem();
		const design = system.importDefinition(
			testDefinition([[0, 0, 0, 8, 16, 8]], { id: 'cabinet' })
		);
		if (!design.ok) throw new Error(design.error);
		const wall: WallCollisionRect = {
			centerX: 0,
			centerZ: 0,
			halfLength: 5,
			halfThickness: 0.1,
			dirX: 1,
			dirZ: 0,
			minWorldY: 0,
			maxWorldY: 3
		};
		const blocked = evaluateMiniBuildPlacement(
			context(system, { walls: [wall] }),
			design.value,
			0,
			{ x: 1, y: 0, z: 0 },
			1,
			null
		);
		expect(blocked).toMatchObject({ valid: false, reason: 'Blocked by a wall' });
		const flush = evaluateMiniBuildPlacement(
			context(system, { walls: [wall] }),
			design.value,
			0,
			{ x: 1, y: 0, z: 0.35 },
			1,
			null
		);
		expect(flush.valid).toBe(true);
		expect(
			evaluateMiniBuildPlacement(context(system), design.value, 0, { x: 1, y: 0, z: 1 }, 0.2, null)
				.reason
		).toBe('Needs a floor');
	});

	it('uses collision boxes, so a chair can tuck under a table with decorative legs', () => {
		const system = createSystem();
		const table = system.importDefinition(
			testDefinition(
				[
					[0, 10, 0, 24, 2, 14],
					[0, 0, 0, 2, 10, 2],
					[22, 0, 0, 2, 10, 2],
					[0, 0, 12, 2, 10, 2],
					[22, 0, 12, 2, 10, 2]
				],
				{ id: 'table' }
			)
		);
		const stool = system.importDefinition(testDefinition([[0, 0, 0, 6, 6, 6]], { id: 'stool' }));
		if (!table.ok || !stool.ok) throw new Error('fixtures');
		const placed = system.placeInstance(table.value.id, { x: 4, y: 0, z: 4 }, 0);
		expect(placed.ok).toBe(true);
		const under = evaluateMiniBuildPlacement(
			context(system),
			stool.value,
			0,
			{ x: 4, y: 0, z: 4 },
			1,
			null
		);
		expect(under.valid).toBe(true);
		const tallBox = system.importDefinition(testDefinition([[0, 0, 0, 6, 24, 6]], { id: 'tall' }));
		if (!tallBox.ok) throw new Error(tallBox.error);
		const through = evaluateMiniBuildPlacement(
			context(system),
			tallBox.value,
			0,
			{ x: 4, y: 0, z: 4 },
			1,
			null
		);
		expect(through).toMatchObject({ valid: false, reason: 'Overlaps another object' });
	});

	it('refuses placement over the chunk budget with the player-facing message and warns near it', () => {
		const system = createSystem();
		const heavy = system.importDefinition(
			testDefinition(
				Array.from(
					{ length: 16 },
					(_, i) =>
						[i % 4, 0, Math.floor(i / 4), 1, 1, 1] as [
							number,
							number,
							number,
							number,
							number,
							number
						]
				),
				{ id: 'heavy' }
			)
		);
		if (!heavy.ok) throw new Error(heavy.error);
		for (let i = 0; i < 28; i++)
			system.placeInstance(
				heavy.value.id,
				{ x: 0.5 + (i % 7) * 2, y: 0, z: 0.5 + Math.floor(i / 7) * 2 },
				0
			);
		const near = evaluateMiniBuildPlacement(
			context(system),
			heavy.value,
			0,
			{ x: 14, y: 0, z: 14 },
			1,
			null
		);
		expect(near.valid).toBe(true);
		expect(near.notice).toBe('This area is becoming very detailed.');
		for (let i = 0; i < 4; i++)
			system.placeInstance(heavy.value.id, { x: 0.5 + i * 2, y: 0, z: 9 }, 0);
		const refused = evaluateMiniBuildPlacement(
			context(system),
			heavy.value,
			0,
			{ x: 14, y: 0, z: 14 },
			1,
			null
		);
		expect(refused.valid).toBe(false);
		expect(refused.reason).toContain('This area has reached its detail limit.');
	});
});
