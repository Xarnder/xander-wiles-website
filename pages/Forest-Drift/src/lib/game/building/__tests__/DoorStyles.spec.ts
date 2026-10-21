import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingMaterialManager } from '../BuildingMaterialManager';
import { DoorInteractionController } from '../DoorInteractionController';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import {
	buildOpeningVisual,
	disposeOpeningVisual,
	getGlassMaterial
} from '../OpeningVisualBuilder';
import { WallManager } from '../WallManager';
import { resolvePlayerPositionAgainstWalls } from '../wallCollision';
import type { DoorStyle, WallOpeningDefinition } from '../WallTypes';

beforeEach(() => vi.stubGlobal('window', new EventTarget()));
afterEach(() => vi.unstubAllGlobals());

const settings = () => createDefaultBuildingSettings();
const opening = (style?: DoorStyle): WallOpeningDefinition => ({
	id: 'door',
	type: 'door',
	minU: 1,
	maxU: 3,
	minY: 0,
	maxY: 2.5,
	doorStyle: style
});
const meshes = (root: THREE.Object3D, name: string): THREE.Mesh[] => {
	const found: THREE.Mesh[] = [];
	root.traverse((child) => {
		if (child.name === name) found.push(child as THREE.Mesh);
	});
	return found;
};
function hit(object: THREE.Object3D, u: number, y: number): boolean {
	object.updateWorldMatrix(true, true);
	return (
		new THREE.Raycaster(new THREE.Vector3(u, y, 2), new THREE.Vector3(0, 0, -1)).intersectObject(
			object,
			true
		).length > 0
	);
}

describe('door styles', () => {
	it.each([
		{ double: false, arched: false },
		{ double: true, arched: false },
		{ double: false, arched: true },
		{ double: true, arched: true }
	])('builds independently configured door style %j', (style) => {
		const materials = new BuildingMaterialManager();
		const result = buildOpeningVisual(
			opening(style),
			0.2,
			settings(),
			materials,
			getGlassMaterial()
		)!;
		expect(meshes(result.object, 'door-leaf')).toHaveLength(style.double ? 2 : 1);
		expect(meshes(result.object, 'door-handles')).toHaveLength(style.double ? 2 : 1);
		expect(!!result.object.getObjectByName('door-arch-infill')).toBe(style.arched);
		expect(result.hingePivot?.userData.interactionKind === 'double-door').toBe(style.double);
		for (const leaf of meshes(result.object, 'door-leaf')) {
			leaf.updateWorldMatrix(true, true);
			const box = new THREE.Box3().setFromObject(leaf);
			expect(box.min.y).toBeCloseTo(0);
			expect(box.max.y).toBeLessThan(2.5);
			expect(box.min.x).toBeGreaterThan(1);
			expect(box.max.x).toBeLessThan(3);
		}
		disposeOpeningVisual(result.object);
		materials.dispose();
	});

	it('keeps older doors as single rectangular leaves', () => {
		const materials = new BuildingMaterialManager();
		const result = buildOpeningVisual(opening(), 0.2, settings(), materials, getGlassMaterial())!;
		expect(meshes(result.object, 'door-leaf')).toHaveLength(1);
		expect(result.hingePivot?.children.some((child) => child.name === 'door-leaf')).toBe(true);
		expect(result.object.getObjectByName('door-arch-infill')).toBeUndefined();
		disposeOpeningVisual(result.object);
		materials.dispose();
	});

	it('curves the frame and leaf while filling the upper wall corners and leaving no threshold', () => {
		const materials = new BuildingMaterialManager();
		const surface = new THREE.MeshStandardMaterial({ color: '#7799aa' });
		const result = buildOpeningVisual(
			opening({ double: false, arched: true }),
			0.2,
			settings(),
			materials,
			getGlassMaterial(),
			1,
			surface
		)!;
		const infill = meshes(result.object, 'door-arch-infill')[0];
		const frame = meshes(result.object, 'door-frame')[0];
		const leaf = meshes(result.object, 'door-leaf')[0];
		expect(infill.material).toBe(surface);
		expect(hit(infill, 1.5, 2.45)).toBe(true);
		expect(hit(infill, 2, 2.45)).toBe(false);
		// The wall infill must meet every outer frame segment without a strip of sky.
		for (let i = 0; i < 32; i++) {
			const a = (i * Math.PI) / 32;
			const b = ((i + 1) * Math.PI) / 32;
			const u = 2 + (Math.cos(a) + Math.cos(b)) / 2;
			const y = 1.5 + (Math.sin(a) + Math.sin(b)) / 2 + 0.0001;
			expect(hit(infill, u, y)).toBe(true);
		}

		expect(hit(frame, 1.5, 2.32)).toBe(true);
		expect(hit(frame, 2, 0.02)).toBe(false);
		expect(hit(leaf, 1.5, 2.35)).toBe(false);
		expect(hit(leaf, 2, 2.35)).toBe(true);
		const geometryDispose = vi.spyOn(infill.geometry, 'dispose');
		const materialDispose = vi.spyOn(surface, 'dispose');
		disposeOpeningVisual(result.object);
		expect(geometryDispose).toHaveBeenCalledOnce();
		expect(materialDispose).not.toHaveBeenCalled();
		surface.dispose();
		materials.dispose();
	});

	it.each([false, true])(
		'animates and collides with both double-door leaves (arched %s)',
		(arched) => {
			const manager = new WallManager({
				getFoundation: () => ({
					id: 'f',
					minGridX: 0,
					maxGridX: 40,
					minGridZ: 0,
					maxGridZ: 40,
					topY: 0,
					bottomY: -1
				}),
				getVertexSpacing: () => 1,
				getBuildingGridSize: () => 0.5,
				buildingSettings: settings()
			});
			manager.addWall({
				id: 'wall',
				foundationId: 'f',
				startGridX: 0,
				startGridZ: 0,
				endGridX: 8,
				endGridZ: 0,
				baseY: 0,
				height: 3,
				thickness: 0.2,
				openings: [opening({ double: true, arched })]
			});
			const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
			camera.position.set(2, 1.3, 2);
			camera.lookAt(2, 1.3, 0);
			camera.updateMatrixWorld();
			const onToggle = vi.fn();
			const controller = new DoorInteractionController({
				camera,
				getHingePivots: () => manager.getOpeningInteractionPivots(),
				onToggle
			});
			if (arched) expect(controller.getCollisionRects().length).toBeGreaterThan(2);
			else expect(controller.getCollisionRects()).toHaveLength(2);
			const blocked = resolvePlayerPositionAgainstWalls(
				2,
				0,
				0,
				1.7,
				0.35,
				controller.getCollisionRects()
			);
			expect(Math.abs(blocked.z)).toBeGreaterThan(0.05);
			window.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyK' }));
			expect(onToggle).toHaveBeenCalledExactlyOnceWith('door', true);
			controller.update(0.05);
			let [left, right] = manager.getDoorHingePivot('door')!.children;
			expect(left.rotation.y).toBeGreaterThan(0);
			expect(left.rotation.y).toBeLessThan(Math.PI / 2);
			expect(right.rotation.y).toBeCloseTo(-left.rotation.y);
			controller.update(1);
			expect(left.rotation.y).toBeCloseTo(Math.PI / 2);
			expect(right.rotation.y).toBeCloseTo(-Math.PI / 2);
			const through = resolvePlayerPositionAgainstWalls(
				2,
				0,
				0,
				1.7,
				0.35,
				controller.getCollisionRects()
			);
			expect(through.x).toBeCloseTo(2);
			expect(through.z).toBeCloseTo(0);
			if (arched) {
				const corner = resolvePlayerPositionAgainstWalls(
					1.5,
					0,
					0,
					2.45,
					0.1,
					controller.getCollisionRects()
				);
				expect(Math.hypot(corner.x - 1.5, corner.z)).toBeGreaterThan(0.05);
				const crown = resolvePlayerPositionAgainstWalls(
					2,
					0,
					0,
					2.45,
					0.1,
					controller.getCollisionRects()
				);
				expect(crown.z).toBeCloseTo(0);
			}
			manager.rebuildWall('wall');
			controller.update(1);
			[left, right] = manager.getDoorHingePivot('door')!.children;
			expect(left.rotation.y).toBeCloseTo(Math.PI / 2);
			expect(right.rotation.y).toBeCloseTo(-Math.PI / 2);
			controller.setActiveState('door', false);
			controller.update(1);
			expect(left.rotation.y).toBeCloseTo(0);
			expect(right.rotation.y).toBeCloseTo(0);
			controller.dispose();
			manager.dispose();
		}
	);
});
