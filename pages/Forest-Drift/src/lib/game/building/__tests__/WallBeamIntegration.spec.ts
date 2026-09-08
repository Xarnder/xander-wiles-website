import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { FoundationDefinition } from '../FoundationTypes';
import { WallManager } from '../WallManager';
import type { WallDefinition } from '../WallTypes';

const SPACING = 1;

function foundation(): FoundationDefinition {
	return {
		id: 'f1',
		minGridX: 0,
		maxGridX: 40,
		minGridZ: 0,
		maxGridZ: 40,
		topY: 10,
		bottomY: 0
	};
}

function makeManager() {
	const foundations = new Map<string, FoundationDefinition>([['f1', foundation()]]);
	const settings = createDefaultBuildingSettings();
	const manager = new WallManager({
		getFoundation: (id) => foundations.get(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => 0.5,
		buildingSettings: settings
	});
	return { manager, settings };
}

function wallWithBeam(overrides: Partial<WallDefinition> = {}): WallDefinition {
	return {
		id: 'wall-1',
		foundationId: 'f1',
		startGridX: 0,
		startGridZ: 0,
		endGridX: 8,
		endGridZ: 0,
		baseY: 0,
		height: 3,
		thickness: 0.2,
		openings: [],
		beams: [{ id: 'beam-1', minU: 1, maxU: 2.2, minY: 1.4, maxY: 1.56 }],
		...overrides
	};
}

function beamVisualsOf(mesh: THREE.Object3D): THREE.Group {
	const group = mesh.children.find((child) => child.name === 'beam-visuals');
	expect(group).toBeDefined();
	return group as THREE.Group;
}

describe('wall beam visuals', () => {
	it('parents a timber box under beam-visuals without adding an opening', () => {
		const { manager } = makeManager();
		manager.addWall(wallWithBeam());
		const mesh = manager.getMeshForWall('wall-1')!;
		const group = beamVisualsOf(mesh);
		const timber = group.children.find((child) => child.name === 'wall-beam') as THREE.Mesh;
		expect(timber).toBeDefined();
		expect(manager.getWall('wall-1')?.openings).toEqual([]);
	});

	it('colours the timber from the beam material', () => {
		const { manager } = makeManager();
		manager.addWall(
			wallWithBeam({
				beams: [
					{
						id: 'beam-1',
						minU: 1,
						maxU: 2.2,
						minY: 1.4,
						maxY: 1.56,
						material: { type: 'color', color: '#AABBCC' }
					}
				]
			})
		);
		const timber = beamVisualsOf(manager.getMeshForWall('wall-1')!).children.find(
			(child) => child.name === 'wall-beam'
		) as THREE.Mesh;
		expect(timber).toBeDefined();
		expect((timber.material as THREE.MeshStandardMaterial).color.getHexString().toUpperCase()).toBe(
			'AABBCC'
		);
	});

	it('rebuilds without the timber when the beam list is emptied', () => {
		const { manager } = makeManager();
		manager.addWall(wallWithBeam());
		const wall = manager.getWall('wall-1')!;
		wall.beams = [];
		manager.rebuildWall('wall-1');
		const mesh = manager.getMeshForWall('wall-1')!;
		expect(beamVisualsOf(mesh).children).toHaveLength(0);
	});
});
