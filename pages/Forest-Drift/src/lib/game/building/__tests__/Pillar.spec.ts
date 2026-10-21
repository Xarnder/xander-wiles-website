import {
	buildPlacementPreviewModel,
	centerPlacementPreviewModel,
	disposePreviewObject
} from '../placementPreviewModel';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import { BuildingMaterialManager } from '../BuildingMaterialManager';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	createDefaultPillarSettings,
	normalizePillarSettings,
	pillarDefinition
} from '../PillarTypes';
import { buildFurnitureConstruction } from '../furnitureConstruction';
import { resolveFurnitureBuildInput } from '../furnitureCatalogue';
import { createFurnitureGroup, disposeFurnitureGroup } from '../FurnitureGeometry';
import { FurnitureManager } from '../FurnitureManager';
import { validateWorldDefinition } from '../../world/WorldValidation';
import { richWorld } from '../../world/__tests__/worldFixtures';
import { createWorldPackage, readWorldPackage } from '../../world/WorldImportExport';

const defaults = createDefaultPillarSettings();
const item = () => pillarDefinition(defaults, { x: 2, y: 10, z: 3 }, null, 'pillar');

describe('wooden pillars', () => {
	it('defaults to square timber with wider independent top and bottom bases', () => {
		const definition = item();
		const construction = buildFurnitureConstruction(resolveFurnitureBuildInput(definition));
		expect(construction.primitives).toHaveLength(3);
		expect(construction.primitives.every((part) => part.shape === 'box')).toBe(true);
		const body = construction.primitives.find((part) => part.role === 'body')!;
		const caps = construction.primitives.filter((part) => part.role !== 'body');
		if (body.shape !== 'box') throw Error('Expected square pillar');
		expect(body.sx).toBe(0.25);
		for (const cap of caps) {
			if (cap.shape !== 'box') throw Error('Expected square base');
			expect(cap.sx).toBeGreaterThan(body.sx);
		}
		expect(construction.metrics.minY).toBeCloseTo(0);
		expect(construction.metrics.maxY).toBeCloseTo(3);
	});
	it('supports circular pillars and independently disabled or resized bases', () => {
		const definition = pillarDefinition(
			{
				...defaults,
				shape: 'circular',
				width: 0.3,
				topEnabled: false,
				bottomWidth: 0.6,
				bottomHeight: 0.2
			},
			{ x: 0, y: 0, z: 0 },
			null,
			'round'
		);
		const construction = buildFurnitureConstruction(resolveFurnitureBuildInput(definition));
		expect(construction.primitives).toHaveLength(2);
		expect(construction.primitives.every((part) => part.shape === 'cylinder')).toBe(true);
		const base = construction.primitives.find((part) => part.role === 'trim')!;
		if (base.shape !== 'cylinder') throw Error('Expected circular base');
		expect(base.radiusTop).toBe(0.3);
		expect(base.height).toBe(0.2);
		expect(construction.metrics.maxY).toBeCloseTo(3);
		expect(definition.dimensions!.width).toBe(0.6);
	});
	it('clamps unsafe dimensions and keeps a positive shaft at minimum height', () => {
		const settings = normalizePillarSettings({
			height: 0.1,
			width: NaN,
			topHeight: 10,
			bottomHeight: 10
		});
		expect(settings.height).toBe(0.3);
		expect(settings.width).toBe(defaults.width);
		expect(settings.topHeight + settings.bottomHeight).toBeLessThan(settings.height);
	});
	it('keeps nested pillar previews centred through repeated resizing with cached child matrices', () => {
		const settings = createDefaultBuildingSettings();
		const building = new BuildingMaterialManager();
		const floorDetail = new THREE.MeshStandardMaterial();
		for (const shape of ['square', 'circular'] as const) {
			settings.pillar.shape = shape;
			const model = buildPlacementPreviewModel('pillar', settings, { building, floorDetail });
			for (let resize = 0; resize < 3; resize++) {
				centerPlacementPreviewModel(model);
				const box = new THREE.Box3().setFromObject(model);
				expect(box.getCenter(new THREE.Vector3()).length()).toBeCloseTo(0);
				expect(box.max.y - box.min.y).toBeCloseTo(settings.pillar.height);
			}
			disposePreviewObject(model);
		}
		building.dispose();
		floorDetail.dispose();
	});

	it('merges the shaft and bases into one wood mesh', () => {
		const material = new THREE.MeshStandardMaterial();
		const group = createFurnitureGroup(item(), {
			primary: material,
			secondary: material,
			accent: material,
			emissive: material
		});
		expect(group.children).toHaveLength(1);
		expect(group.children[0]).toBeInstanceOf(THREE.Mesh);
		disposeFurnitureGroup(group, false);
		material.dispose();
	});
	it('keeps wider caps out of the shaft collision and supports normal removal', () => {
		const manager = new FurnitureManager();
		manager.add(item());
		const rects = manager.getCollisionRects();
		expect(rects).toHaveLength(3);
		const shaft = rects.find((rect) => rect.maxWorldY - rect.minWorldY > 1)!;
		expect(shaft.halfLength).toBeCloseTo(0.125);
		expect(shaft.minWorldY).toBeCloseTo(10.12);
		expect(manager.remove('pillar')).toBe(true);
		expect(manager.getCollisionRects()).toHaveLength(0);
		manager.dispose();
	});
	it('survives validated world package export/import with authored settings', async () => {
		const world = richWorld();
		world.furniture.push(item());
		expect(validateWorldDefinition(world).ok).toBe(true);
		const exported = await createWorldPackage(world);
		const imported = readWorldPackage(exported);
		expect(imported.ok).toBe(true);
		if (!imported.ok) throw Error(imported.error);
		expect(imported.world.furniture.find((entry) => entry.id === 'pillar')).toEqual(item());
	});
});
