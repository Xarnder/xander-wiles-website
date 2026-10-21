import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
	automaticShutterSide,
	shutterSideFacingPlayer,
	windowRayDistance
} from '../windowShutterMath';
import type { WallPathDefinition } from '../WallPathTypes';
import {
	buildOpeningVisual,
	disposeOpeningVisual,
	getGlassMaterial
} from '../OpeningVisualBuilder';
import { BuildingMaterialManager } from '../BuildingMaterialManager';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { WallOpeningDefinition } from '../WallTypes';

const square = [
	{ gridX: 0, gridZ: 0 },
	{ gridX: 8, gridZ: 0 },
	{ gridX: 8, gridZ: 8 },
	{ gridX: 0, gridZ: 8 }
];
const loop = (overrides: Partial<WallPathDefinition> = {}): WallPathDefinition => ({
	id: 'room',
	foundationId: 'f',
	points: square,
	closed: true,
	baseY: 0,
	wallHeight: 3,
	wallThickness: 0.2,
	joinStyle: 'miter',
	miterLimit: 4,
	segments: [],
	...overrides
});
const window = (overrides: Partial<WallOpeningDefinition> = {}): WallOpeningDefinition => ({
	id: 'old-window',
	type: 'window',
	minU: 1,
	maxU: 2.2,
	minY: 0.8,
	maxY: 2.2,
	...overrides
});

describe('shutter exterior inference', () => {
	it('uses closed room loops regardless of polygon winding', () => {
		for (const points of [square, [...square].reverse()]) {
			expect(
				automaticShutterSide(
					{ x: 0, z: 0 },
					{ x: 4, z: 0 },
					2,
					0.2,
					0,
					3,
					[],
					[loop({ points })],
					0.5
				)
			).toBe(-1);
		}
	});
	it('reverses the local side when the wall direction reverses', () => {
		expect(
			automaticShutterSide({ x: 4, z: 0 }, { x: 0, z: 0 }, 2, 0.2, 0, 3, [], [loop()], 0.5)
		).toBe(1);
	});
	it('uses a ceiling edge when there is no closed loop', () => {
		const lids = [
			{
				localY: 3.2,
				thickness: 0.2,
				polygon: square.map((p) => ({ x: p.gridX / 2, z: p.gridZ / 2 }))
			}
		];
		expect(automaticShutterSide({ x: 0, z: 0 }, { x: 4, z: 0 }, 2, 0.2, 0, 3, lids, [], 0.5)).toBe(
			-1
		);
	});
	it('ignores other storeys and open paths, using a stable fallback for isolated walls', () => {
		expect(
			automaticShutterSide(
				{ x: 0, z: 0 },
				{ x: 4, z: 0 },
				2,
				0.2,
				0,
				3,
				[],
				[loop({ closed: false }), loop({ baseY: 3 })],
				0.5
			)
		).toBe(1);
	});
	it('probes a concave room locally instead of aiming at its centroid', () => {
		const points = [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 8, gridZ: 0 },
			{ gridX: 8, gridZ: 2 },
			{ gridX: 2, gridZ: 2 },
			{ gridX: 2, gridZ: 8 },
			{ gridX: 0, gridZ: 8 }
		];
		expect(
			automaticShutterSide(
				{ x: 4, z: 1 },
				{ x: 1, z: 1 },
				1.5,
				0.2,
				0,
				3,
				[],
				[loop({ points })],
				0.5
			)
		).toBe(-1);
	});
	it('captures the face towards the player, including translated diagonal walls', () => {
		const d = Math.SQRT1_2;
		expect(shutterSideFacingPlayer(d, d, 100, 200, 99, 201)).toBe(1);
		expect(shutterSideFacingPlayer(d, d, 100, 200, 101, 199)).toBe(-1);
	});
});

describe('window shutter geometry', () => {
	it.each([0.2, 1.2, 4])('gives old windows two half-width wooden panels at width %s', (width) => {
		const settings = createDefaultBuildingSettings();
		const materials = new BuildingMaterialManager();
		const opening = window({ maxU: 1 + width });
		const visual = buildOpeningVisual(opening, 0.2, settings, materials, getGlassMaterial(), -1)!;
		const shutters = visual.shutterAssembly!;
		expect(shutters).toBeDefined();
		expect(shutters.userData.panelWidth).toBeCloseTo(width / 2);
		shutters.updateWorldMatrix(true, true);
		const box = new THREE.Box3().setFromObject(shutters);
		expect(box.max.z).toBeLessThan(-0.1);
		expect(box.min.x).toBeCloseTo(opening.minU - width / 2);
		expect(box.max.x).toBeCloseTo(opening.maxU + width / 2);
		expect(box.max.y - box.min.y).toBeCloseTo(1.4);
		const leaves = shutters.children.map((hinge) => hinge.children[0] as THREE.Mesh);
		expect(leaves).toHaveLength(2);
		expect(leaves.every((leaf) => leaf.castShadow && leaf.receiveShadow)).toBe(true);
		const disposed = leaves.map((leaf) => vi.spyOn(leaf.geometry, 'dispose'));
		disposeOpeningVisual(visual.object);
		for (const dispose of disposed) expect(dispose).toHaveBeenCalledOnce();
		materials.dispose();
	});
	it('persists a manual face against a contrary automatic guess', () => {
		const materials = new BuildingMaterialManager();
		const visual = buildOpeningVisual(
			window({ shutters: { mode: 'manual', side: -1 } }),
			0.2,
			createDefaultBuildingSettings(),
			materials,
			getGlassMaterial(),
			1
		)!;
		expect(visual.object.getObjectByName('window-shutters')!.userData.side).toBe(-1);
		disposeOpeningVisual(visual.object);
		materials.dispose();
	});
	it('keeps glass/frame when shutters are off and never adds shutters to doors', () => {
		const materials = new BuildingMaterialManager();
		for (const opening of [window({ shutters: { mode: 'off' } }), window({ type: 'door' })]) {
			const visual = buildOpeningVisual(
				opening,
				0.2,
				createDefaultBuildingSettings(),
				materials,
				getGlassMaterial()
			)!;
			expect(visual.object.getObjectByName('window-shutters')).toBeUndefined();
			if (opening.type === 'window')
				expect(visual.object.getObjectByName('window-glass')).toBeDefined();
			disposeOpeningVisual(visual.object);
		}
		materials.dispose();
	});
});

describe('editing an existing opening through its hole', () => {
	const transform = { dirX: 1, dirZ: 0, originWorldX: 100, originWorldY: 10, originWorldZ: 200 };
	it('hits the opening from either face and rejects solid wall, parallel, or behind-camera rays', () => {
		expect(
			windowRayDistance(window(), transform, { x: 101.6, y: 11.5, z: 205 }, { x: 0, y: 0, z: -1 })
		).toBe(5);
		expect(
			windowRayDistance(window(), transform, { x: 101.6, y: 11.5, z: 195 }, { x: 0, y: 0, z: 1 })
		).toBe(5);
		expect(
			windowRayDistance(window(), transform, { x: 105, y: 11.5, z: 205 }, { x: 0, y: 0, z: -1 })
		).toBeNull();
		expect(
			windowRayDistance(window(), transform, { x: 101.6, y: 11.5, z: 205 }, { x: 1, y: 0, z: 0 })
		).toBeNull();
		expect(
			windowRayDistance(window(), transform, { x: 101.6, y: 11.5, z: 205 }, { x: 0, y: 0, z: 1 })
		).toBeNull();
	});
});
