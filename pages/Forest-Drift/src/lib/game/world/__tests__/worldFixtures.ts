import { createDefaultSkySettings } from '../../sky/SkyTypes';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { createDefaultVegetationSettings } from '../../vegetation/VegetationTypes';
import type { WorldRevisionCounters, WorldRuntime } from '../WorldSerializer';
import { createWorldDefinition } from '../WorldSerializer';
import {
	createDefaultPlayerState,
	createEmptyProceduralOverrides,
	type ProceduralWorldOverrides,
	type SavedPlayerState,
	type WorldDefinition,
	type WorldEnvironmentDefinition
} from '../WorldTypes';

export function defaultEnvironment(): WorldEnvironmentDefinition {
	return {
		terrain: createDefaultTerrainSettings(),
		vegetation: createDefaultVegetationSettings(),
		sky: createDefaultSkySettings()
	};
}

/**
 * A world containing at least one of *every* authored building type the game can currently produce.
 *
 * Deliberately exhaustive: the most likely persistence bug in a codebase with this many building
 * managers isn't a broken round trip, it's a newly-added type that nobody remembered to include in
 * the save. A fixture that covers every type turns that omission into a failing test.
 */
export function richWorld(overrides: Partial<WorldDefinition> = {}): WorldDefinition {
	const base = createWorldDefinition({
		id: 'world-fixture-1',
		name: 'Forest House',
		seed: 'quiet-valley-042',
		environment: defaultEnvironment(),
		now: '2026-01-01T00:00:00.000Z'
	});

	return {
		...base,
		foundations: [
			{
				id: 'foundation-1',
				minGridX: -4,
				maxGridX: 4,
				minGridZ: -3,
				maxGridZ: 3,
				topY: 12.5,
				bottomY: 4.25,
				material: { type: 'color', color: '#8a8578' }
			}
		],
		buildings: [
			{
				foundationId: 'foundation-1',
				walls: [
					{
						id: 'wall-1',
						foundationId: 'foundation-1',
						startGridX: 0,
						startGridZ: 0,
						endGridX: 6,
						endGridZ: 0,
						baseY: 0,
						height: 2.6,
						thickness: 0.2,
						openings: [
							{ id: 'window-1', type: 'window', minU: 1, maxU: 2, minY: 0.9, maxY: 2 },
							{ id: 'door-1', type: 'door', minU: 3, maxU: 4, minY: 0, maxY: 2.1 }
						],
						material: { type: 'color', color: '#d9d1c3' }
					}
				],
				wallPaths: [
					{
						id: 'path-1',
						foundationId: 'foundation-1',
						points: [
							{ gridX: 0, gridZ: 0 },
							{ gridX: 4, gridZ: 0 },
							{ gridX: 4, gridZ: 4 }
						],
						closed: false,
						baseY: 2.6,
						wallHeight: 2.6,
						wallThickness: 0.2,
						joinStyle: 'miter',
						miterLimit: 4,
						segments: [
							{
								id: 'segment-1',
								openings: [
									{ id: 'window-2', type: 'window', minU: 1, maxU: 2, minY: 0.9, maxY: 2 }
								],
								material: { type: 'color', color: '#123456' }
							},
							{ id: 'segment-2', openings: [] }
						]
					}
				],
				slabs: [
					{
						id: 'slab-1',
						foundationId: 'foundation-1',
						type: 'ceiling',
						levelIndex: 0,
						localY: 2.6,
						thickness: 0.2,
						points: [
							{ gridX: 0, gridZ: 0 },
							{ gridX: 4, gridZ: 0 },
							{ gridX: 4, gridZ: 4 },
							{ gridX: 0, gridZ: 4 }
						],
						openings: [
							{
								id: 'slab-opening-1',
								type: 'stairs',
								minGridX: 1,
								maxGridX: 2,
								minGridZ: 1,
								maxGridZ: 3,
								sourceStairId: 'stair-1'
							}
						],
						material: { type: 'color', color: '#d8d2c4' }
					},
					{
						id: 'slab-2',
						foundationId: 'foundation-1',
						type: 'flat-roof',
						levelIndex: 1,
						localY: 5.2,
						thickness: 0.2,
						points: [
							{ gridX: 0, gridZ: 0 },
							{ gridX: 4, gridZ: 0 },
							{ gridX: 4, gridZ: 4 }
						],
						openings: []
					}
				],
				stairs: [
					{
						id: 'stair-1',
						foundationId: 'foundation-1',
						minGridX: 1,
						maxGridX: 2,
						minGridZ: 1,
						maxGridZ: 3,
						baseY: 0,
						direction: '+z',
						levelIndex: 0,
						gridSizeAtCreation: 0.5
					}
				]
			}
		],
		buildingLevels: [
			{ id: 'level-1', foundationId: 'foundation-1', index: 0, baseY: 0, wallHeight: 2.6 },
			{ id: 'level-2', foundationId: 'foundation-1', index: 1, baseY: 2.6, wallHeight: 2.6 }
		],
		proceduralOverrides: { removedTreeIds: ['12:-7', '3:9'] },
		player: {
			position: { x: 123.456, y: 18.25, z: -987.654 },
			yaw: 1.2345,
			pitch: -0.4321,
			activeFoundationId: 'foundation-1',
			currentLevelIndexByFoundation: { 'foundation-1': 1 }
		},
		...overrides
	};
}

/** A minimal in-memory `WorldRuntime`, so serializer/autosave tests don't need Three.js or a DOM. */
export class FakeWorldRuntime implements WorldRuntime {
	environment: WorldEnvironmentDefinition = defaultEnvironment();
	foundations: WorldDefinition['foundations'] = [];
	buildings: WorldDefinition['buildings'] = [];
	buildingLevels: WorldDefinition['buildingLevels'] = [];
	player: SavedPlayerState = createDefaultPlayerState();
	overrides: ProceduralWorldOverrides = createEmptyProceduralOverrides();
	counters: WorldRevisionCounters = { structural: 0, environment: 0, procedural: 0 };

	getEnvironment() {
		return this.environment;
	}
	getFoundations() {
		return this.foundations;
	}
	getBuildings() {
		return this.buildings;
	}
	getBuildingLevels() {
		return this.buildingLevels;
	}
	getPlayerState() {
		return this.player;
	}
	getProceduralOverrides() {
		return this.overrides;
	}
	getRevisionCounters() {
		return this.counters;
	}

	/** Simulates a structural edit (a wall placed, a colour painted, …). */
	mutateStructure(): void {
		this.counters = { ...this.counters, structural: this.counters.structural + 1 };
	}

	movePlayer(x: number, z: number): void {
		this.player = { ...this.player, position: { x, y: this.player.position.y, z } };
	}
}

export function runtimeFromWorld(world: WorldDefinition): FakeWorldRuntime {
	const runtime = new FakeWorldRuntime();
	runtime.environment = world.environment;
	runtime.foundations = world.foundations;
	runtime.buildings = world.buildings;
	runtime.buildingLevels = world.buildingLevels;
	runtime.player = world.player;
	runtime.overrides = world.proceduralOverrides;
	return runtime;
}
