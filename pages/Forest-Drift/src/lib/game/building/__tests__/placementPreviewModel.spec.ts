import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingMaterialManager } from '../BuildingMaterialManager';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import { getGlassMaterial } from '../OpeningVisualBuilder';
import { buildPlacementPreviewModel, disposePreviewObject } from '../placementPreviewModel';

function names(root: THREE.Object3D): string[] {
	const found: string[] = [];
	root.traverse((child) => {
		if (child.name) found.push(child.name);
	});
	return found;
}

function materials() {
	return {
		building: new BuildingMaterialManager(),
		floorDetail: new THREE.MeshStandardMaterial({ vertexColors: true })
	};
}

describe('buildPlacementPreviewModel', () => {
	it('builds a window in a cut wall', () => {
		const group = buildPlacementPreviewModel(
			'window',
			createDefaultBuildingSettings(),
			materials()
		);
		const found = names(group);
		expect(found).toContain('preview-wall');
		expect(found).toContain('window-visual');
		disposePreviewObject(group);
	});

	it('builds a door whose bottom follows the sill setting', () => {
		const settings = createDefaultBuildingSettings();
		settings.doorSillHeight = 0.4;
		const group = buildPlacementPreviewModel('door', settings, materials());
		expect(names(group)).toContain('door-visual');
		const wall = group.getObjectByName('preview-wall') as THREE.Mesh | undefined;
		expect(wall).toBeDefined();
		disposePreviewObject(group);
	});

	it('builds a beam on an uncut wall', () => {
		const group = buildPlacementPreviewModel('beam', createDefaultBuildingSettings(), materials());
		expect(names(group)).toContain('wall-beam');
		expect(names(group)).toContain('preview-wall');
		disposePreviewObject(group);
	});

	it('builds floor detailing as vertex-coloured boards', () => {
		const group = buildPlacementPreviewModel(
			'floor-planks',
			createDefaultBuildingSettings(),
			materials()
		);
		expect(names(group)).toContain('preview-floor-detail-mesh');
		disposePreviewObject(group);
	});

	it('builds a framed wall and an L-shaped polygon wall', () => {
		const wall = buildPlacementPreviewModel('wall', createDefaultBuildingSettings(), materials());
		expect(names(wall)).toContain('preview-wall');
		disposePreviewObject(wall);

		const polygon = buildPlacementPreviewModel(
			'polygon-wall',
			createDefaultBuildingSettings(),
			materials()
		);
		expect(names(polygon).filter((name) => name === 'preview-wall').length).toBeGreaterThanOrEqual(
			2
		);
		disposePreviewObject(polygon);
	});

	it('leaves the shared glass material alive after teardown', () => {
		const glass = getGlassMaterial();
		const group = buildPlacementPreviewModel(
			'window',
			createDefaultBuildingSettings(),
			materials()
		);
		disposePreviewObject(group);
		expect(getGlassMaterial()).toBe(glass);
		expect(glass.type).toBe('MeshPhysicalMaterial');
	});

	it('builds a stair with framing, railings, and hole trim', () => {
		const group = buildPlacementPreviewModel(
			'stairs',
			createDefaultBuildingSettings(),
			materials()
		);
		const found = names(group);
		expect(found).toContain('preview-stair');
		expect(found).toContain('stair-frame');
		expect(found).toContain('preview-landing');
		expect(found).toContain('slab-opening-frame');
		disposePreviewObject(group);
	});

	it('hides the landing hole and its trim when the hole is off', () => {
		const settings = createDefaultBuildingSettings();
		settings.stairOpeningEnabled = false;
		const group = buildPlacementPreviewModel('stairs', settings, materials());
		const found = names(group);
		expect(found).toContain('preview-stair');
		expect(found).toContain('preview-landing');
		expect(found).not.toContain('slab-opening-frame');
		disposePreviewObject(group);
	});

	it('hides hole trim while keeping stair timber', () => {
		const settings = createDefaultBuildingSettings();
		settings.slabOpeningFrameEnabled = false;
		const group = buildPlacementPreviewModel('stairs', settings, materials());
		const found = names(group);
		expect(found).toContain('preview-stair');
		expect(found).toContain('stair-frame');
		expect(found).not.toContain('slab-opening-frame');
		disposePreviewObject(group);
	});

	it('hides stair timber while keeping hole trim', () => {
		const settings = createDefaultBuildingSettings();
		settings.stairFrameEnabled = false;
		settings.stairRailingsEnabled = false;
		const group = buildPlacementPreviewModel('stairs', settings, materials());
		const found = names(group);
		expect(found).toContain('preview-stair');
		expect(found).not.toContain('stair-frame');
		expect(found).toContain('slab-opening-frame');
		disposePreviewObject(group);
	});

	it('hides stair railings, framing, and hole trim independently', () => {
		const settings = createDefaultBuildingSettings();
		settings.stairFrameEnabled = false;
		settings.stairRailingsEnabled = false;
		settings.slabOpeningFrameEnabled = false;
		const group = buildPlacementPreviewModel('stairs', settings, materials());
		const found = names(group);
		expect(found).toContain('preview-stair');
		expect(found).not.toContain('stair-frame');
		expect(found).not.toContain('slab-opening-frame');
		disposePreviewObject(group);
	});
});
