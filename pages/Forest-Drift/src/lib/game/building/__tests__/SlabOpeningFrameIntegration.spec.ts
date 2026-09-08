import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { FoundationDefinition } from '../FoundationTypes';
import { SlabManager } from '../SlabManager';
import { SLAB_OPENING_FRAME_OUTER_MAX } from '../slabOpeningFrameMath';
import type { SlabDefinition, SlabOpeningDefinition } from '../SlabTypes';

const SPACING = 2;
const GRID = 0.25;

function foundation(): FoundationDefinition {
	return {
		id: 'f1',
		minGridX: 0,
		maxGridX: 40,
		minGridZ: 0,
		maxGridZ: 40,
		topY: 0,
		bottomY: -2
	};
}

function slab(): SlabDefinition {
	return {
		id: 'slab-1',
		foundationId: 'f1',
		type: 'ceiling',
		levelIndex: 1,
		localY: 3,
		thickness: 0.2,
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 20, gridZ: 0 },
			{ gridX: 20, gridZ: 16 },
			{ gridX: 0, gridZ: 16 }
		],
		openings: []
	};
}

function opening(): SlabOpeningDefinition {
	return {
		id: 'open-1',
		type: 'stairs',
		minGridX: 4,
		maxGridX: 16,
		minGridZ: 4,
		maxGridZ: 8,
		sourceStairId: 'stair-1'
	};
}

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
	let found: THREE.Object3D | undefined;
	root.traverse((child) => {
		if (!found && child.name === name) found = child;
	});
	return found;
}

function setup() {
	const foundations = new Map<string, FoundationDefinition>([['f1', foundation()]]);
	const settings = createDefaultBuildingSettings();
	const manager = new SlabManager({
		getFoundation: (id) => foundations.get(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => GRID,
		buildingSettings: settings
	});
	return { manager, settings };
}

describe('slab opening framing: SlabManager integration', () => {
	it('adds timber trim when a stair opening is cut, as a sibling of the slab mesh', () => {
		const { manager } = setup();
		manager.addSlab(slab());
		expect(findByName(manager.group, 'slab-opening-frame')).toBeUndefined();
		manager.addOpening('slab-1', opening());
		expect(findByName(manager.group, 'slab-opening-frame')).toBeDefined();
		const mesh = manager.getMeshForSlab('slab-1')!;
		expect(findByName(mesh, 'slab-opening-frame')).toBeUndefined();
	});

	it('keeps the trim inside the hole so a wall on the same grid line is not punched through', () => {
		const { manager } = setup();
		manager.addSlab(slab());
		manager.addOpening('slab-1', opening());
		const frameMesh = findByName(manager.group, 'slab-opening-frame-solid') as THREE.Mesh;
		expect(frameMesh).toBeDefined();
		frameMesh.updateMatrixWorld(true);
		const frameBox = new THREE.Box3().setFromObject(frameMesh);
		// Opening cells 4..16 x 4..8 at 0.25m → local X 1..4, Z 1..2.
		expect(frameBox.min.x).toBeGreaterThanOrEqual(1 - SLAB_OPENING_FRAME_OUTER_MAX - 1e-4);
		expect(frameBox.max.x).toBeLessThanOrEqual(4 + SLAB_OPENING_FRAME_OUTER_MAX + 1e-4);
		expect(frameBox.min.z).toBeGreaterThanOrEqual(1 - SLAB_OPENING_FRAME_OUTER_MAX - 1e-4);
		expect(frameBox.max.z).toBeLessThanOrEqual(2 + SLAB_OPENING_FRAME_OUTER_MAX + 1e-4);
	});

	it('still leaves the hole walkable — the opening centre is not covered by the slab', () => {
		const { manager } = setup();
		manager.addSlab(slab());
		manager.addOpening('slab-1', opening());
		// Hole is cells 4..16 x 4..8 at 0.25m → local X 1..4, Z 1..2; centre (2.5, 1.5).
		expect(manager.getTopSurfacesAt(2.5, 1.5)).toEqual([]);
		expect(manager.getTopSurfacesAt(0.2, 0.2)).toEqual([3]);
	});

	it('removes the trim when the opening is removed or framing is disabled', () => {
		const { manager, settings } = setup();
		manager.addSlab(slab());
		manager.addOpening('slab-1', opening());
		settings.slabOpeningFrameEnabled = false;
		manager.rebuildAllSlabs();
		expect(findByName(manager.group, 'slab-opening-frame')).toBeUndefined();

		settings.slabOpeningFrameEnabled = true;
		manager.rebuildAllSlabs();
		expect(findByName(manager.group, 'slab-opening-frame')).toBeDefined();

		manager.removeOpening('slab-1', 'open-1');
		expect(findByName(manager.group, 'slab-opening-frame')).toBeUndefined();
	});
});
