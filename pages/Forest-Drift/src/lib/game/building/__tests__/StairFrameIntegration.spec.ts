import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { FoundationDefinition } from '../FoundationTypes';
import { StairManager } from '../StairManager';
import { STAIR_RAIL_INSET, STAIR_TOP_NEWEL_OVERSHOOT } from '../stairFrameMath';
import type { StairDefinition } from '../StairTypes';

const SPACING = 2;

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

function stair(): StairDefinition {
	return {
		id: 'stair-1',
		foundationId: 'f1',
		minGridX: 0,
		maxGridX: 12,
		minGridZ: 0,
		maxGridZ: 4,
		baseY: 0,
		direction: '+x',
		levelIndex: 0,
		gridSizeAtCreation: 0.25
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
	const manager = new StairManager({
		getFoundation: (id) => foundations.get(id),
		getVertexSpacing: () => SPACING,
		buildingSettings: settings
	});
	return { manager, settings };
}

describe('stair framing: StairManager integration', () => {
	it('paints the solid with a stamped colour', () => {
		const { manager } = setup();
		manager.addStair({
			...stair(),
			material: { type: 'color', color: '#C1694F' }
		});
		const mesh = manager.getMeshesForRaycast()[0] as THREE.Mesh;
		const material = mesh.material as THREE.MeshStandardMaterial;
		expect(material.color.getHexString().toUpperCase()).toBe('C1694F');
	});

	it('adds a timber frame group as a sibling of the stair mesh', () => {
		const { manager } = setup();
		manager.addStair(stair());
		expect(findByName(manager.group, 'stair-frame')).toBeDefined();
		expect(findByName(manager.group, 'stair-frame-solid')).toBeDefined();
		const mesh = manager.getMeshesForRaycast()[0];
		expect(findByName(mesh, 'stair-frame')).toBeUndefined();
	});

	it('does not change side collision when framing is present', () => {
		const { manager } = setup();
		manager.addStair(stair());
		const withFrame = manager.getAllCollisionRects();
		manager.removeStair('stair-1');
		manager.addStair({ ...stair(), frameEnabled: false, railingsEnabled: false });
		expect(findByName(manager.group, 'stair-frame')).toBeUndefined();
		expect(manager.getAllCollisionRects()).toEqual(withFrame);
	});

	it('keeps railings when framing is stamped off', () => {
		const { manager } = setup();
		manager.addStair({ ...stair(), frameEnabled: false, railingsEnabled: true });
		expect(findByName(manager.group, 'stair-frame')).toBeDefined();
	});

	it('keeps framing when railings are stamped off', () => {
		const { manager } = setup();
		manager.addStair({ ...stair(), frameEnabled: true, railingsEnabled: false });
		expect(findByName(manager.group, 'stair-frame')).toBeDefined();
	});

	it('keeps an already-placed stair’s framing when live settings change', () => {
		const { manager, settings } = setup();
		manager.addStair({ ...stair(), frameEnabled: true, railingsEnabled: true });
		settings.stairFrameEnabled = false;
		settings.stairRailingsEnabled = false;
		manager.rebuildAllStairs();
		expect(findByName(manager.group, 'stair-frame')).toBeDefined();
	});

	it('does not let framing extend past a width or back face by more than depth-extra', () => {
		const { manager, settings } = setup();
		manager.addStair(stair());
		const stairMesh = manager.getMeshesForRaycast()[0];
		const frameMesh = findByName(manager.group, 'stair-frame-solid') as THREE.Mesh;
		expect(stairMesh).toBeDefined();
		expect(frameMesh).toBeDefined();

		stairMesh.updateMatrixWorld(true);
		frameMesh.updateMatrixWorld(true);
		const stairBox = new THREE.Box3().setFromObject(stairMesh);
		const frameBox = new THREE.Box3().setFromObject(frameMesh);
		const extra = settings.stairFrameDepthExtra;

		expect(frameBox.min.x).toBeGreaterThanOrEqual(stairBox.min.x - extra - 1e-4);
		expect(frameBox.max.x).toBeLessThanOrEqual(stairBox.max.x + extra + 1e-4);
		expect(frameBox.min.z).toBeGreaterThanOrEqual(stairBox.min.z - extra - 1e-4);
		expect(frameBox.max.z).toBeLessThanOrEqual(stairBox.max.z + extra + 1e-4);
		expect(frameBox.max.x).toBeGreaterThanOrEqual(stairBox.max.x - 1e-3);
		expect(frameBox.max.y).toBeGreaterThan(stairBox.max.y + 0.7);

		const positions = frameMesh.geometry.getAttribute('position');
		let railVerts = 0;
		for (let i = 0; i < positions.count; i++) {
			if (positions.getY(i) <= stairBox.max.y + STAIR_TOP_NEWEL_OVERSHOOT + 1e-3) continue;
			railVerts += 1;
			expect(positions.getZ(i)).toBeGreaterThanOrEqual(stairBox.min.z + STAIR_RAIL_INSET - 1e-3);
			expect(positions.getZ(i)).toBeLessThanOrEqual(stairBox.max.z - STAIR_RAIL_INSET + 1e-3);
		}
		expect(railVerts).toBeGreaterThan(0);
	});

	it('removes the frame when the stair is removed', () => {
		const { manager } = setup();
		manager.addStair(stair());
		manager.removeStair('stair-1');
		expect(findByName(manager.group, 'stair-frame')).toBeUndefined();
	});
});
