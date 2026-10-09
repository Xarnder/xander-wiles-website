import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingManager } from '../BuildingManager';
import { BuildingRemovalManager } from '../BuildingRemovalManager';
import { DoorInteractionController } from '../DoorInteractionController';
import { FloorDetailManager } from '../FloorDetailManager';
import { FoundationManager } from '../FoundationManager';
import { createDefaultBuildingSettings, type FoundationDefinition } from '../FoundationTypes';
import { resolveRemovalTarget } from '../RemovalTypes';
import { RoofManager } from '../RoofManager';
import { colorMaterialFromHex } from '../MaterialTypes';
import { createDefaultRoofProfileSettings, type RoofType } from '../RoofTypes';
import { SlabManager } from '../SlabManager';
import { StairManager } from '../StairManager';
import { resolvePlayerPositionAgainstWalls } from '../wallCollision';
import { WallManager } from '../WallManager';
import { WallPathManager } from '../WallPathManager';

/**
 * Gable windows/doors end to end through the real managers: the hole in the roof mesh, the
 * frame/glass/door visuals, door swing and collision, removal, undo-style removal, painting and
 * save/load — the parts roofOpeningMath.spec.ts can't see.
 */

class FakeWindow {
	private readonly listeners = new Map<string, Set<(event: unknown) => void>>();
	addEventListener(type: string, handler: (event: unknown) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(handler);
	}
	removeEventListener(type: string, handler: (event: unknown) => void): void {
		this.listeners.get(type)?.delete(handler);
	}
}

beforeEach(() => {
	vi.stubGlobal('window', new FakeWindow());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const VERTEX_SPACING = 1;
const GRID = 0.5;
const TOP_Y = 10;
const WALL_THICKNESS = 0.15;
/** The gable plane: footprint edge at x = 6, pushed out to the walls' outer face. */
const PLANE_X = 6 + WALL_THICKNESS / 2;
const MARGIN = 0.1;
const SPACING = 0.15;

function foundation(): FoundationDefinition {
	return {
		id: 'f1',
		minGridX: 0,
		maxGridX: 40,
		minGridZ: 0,
		maxGridZ: 40,
		topY: TOP_Y,
		bottomY: 0
	};
}

function setup() {
	const foundationManager = new FoundationManager(() => VERTEX_SPACING);
	foundationManager.load([foundation()]);
	const shared = {
		getFoundation: (id: string) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => GRID
	};
	const roofManager = new RoofManager({
		...shared,
		buildingSettings: createDefaultBuildingSettings(),
		getEndWallStyle: () => ({ wallThickness: WALL_THICKNESS })
	});
	const buildingManager = new BuildingManager({
		foundationManager,
		wallManager: new WallManager(shared),
		wallPathManager: new WallPathManager(shared),
		slabManager: new SlabManager(shared),
		stairManager: new StairManager(shared),
		roofManager,
		floorDetailManager: new FloorDetailManager(shared),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => GRID,
		getCornerOpeningMargin: () => 0.15
	});
	return { foundationManager, roofManager, buildingManager };
}

/** 6m × 6m gable, eaves at 3m (the first floor's level), 4m rise, 0.3m overhang — ends face ±x. */
function addGable(buildingManager: BuildingManager, type: RoofType = 'gable') {
	const result = buildingManager.addRoof({
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 12, gridZ: 0 },
			{ gridX: 12, gridZ: 12 },
			{ gridX: 0, gridZ: 12 }
		].map((p) => ({ ...p, foundationId: 'f1' })),
		levelIndex: 1,
		baseY: 3,
		type,
		direction: 'x',
		shedDirection: '+x',
		rise: 4,
		thickness: 0.25,
		overhang: 0.3,
		profileSettings: createDefaultRoofProfileSettings()
	});
	if (!result.valid || !result.value) throw new Error(result.reason);
	return result.value;
}

/** A door on the first floor (Y 3 → 5.1), centred under the ridge (U 3 = z 3). */
function addGableDoor(buildingManager: BuildingManager, roofId: string) {
	return buildingManager.addRoofOpening({
		roofId,
		face: '+x',
		type: 'door',
		minU: 2.4,
		maxU: 3.6,
		minY: 3,
		maxY: 5.1,
		edgeMargin: MARGIN,
		spacing: SPACING
	});
}

/** First hit distance against the roof mesh along a ray, or `null`. */
function firstHit(mesh: THREE.Object3D, origin: THREE.Vector3, direction: THREE.Vector3) {
	mesh.updateWorldMatrix(true, true);
	const raycaster = new THREE.Raycaster(origin, direction.clone().normalize());
	return raycaster.intersectObject(mesh, false)[0]?.distance ?? null;
}

describe('gable openings through BuildingManager / RoofManager', () => {
	it('cuts a real hole through the gable, seen from outside and from the attic', () => {
		const { buildingManager, roofManager } = setup();
		const roof = addGable(buildingManager);
		const mesh = roofManager.getMeshForRoof(roof.id)!;
		const doorMiddle = new THREE.Vector3(0, TOP_Y + 4, 3);
		const outside = doorMiddle.clone().setX(PLANE_X + 2);
		const attic = doorMiddle.clone().setX(3);

		expect(firstHit(mesh, outside, new THREE.Vector3(-1, 0, 0))).toBeCloseTo(2, 3);
		expect(firstHit(mesh, attic, new THREE.Vector3(1, 0, 0))).toBeCloseTo(PLANE_X - 3, 3);

		const result = addGableDoor(buildingManager, roof.id);
		expect(result.valid).toBe(true);
		expect(buildingManager.getRoof(roof.id)!.openings).toHaveLength(1);

		// From outside the ray now runs on through the doorway to the far gable's inside face, at
		// x = −PLANE offset.
		expect(firstHit(mesh, outside, new THREE.Vector3(-1, 0, 0))).toBeCloseTo(
			PLANE_X + 2 + WALL_THICKNESS / 2,
			3
		);
		// From the attic it leaves the roof entirely.
		expect(firstHit(mesh, attic, new THREE.Vector3(1, 0, 0))).toBeNull();
		// Just beside the door, the gable is still solid on both sides.
		const beside = new THREE.Vector3(0, TOP_Y + 4, 1.6);
		expect(
			firstHit(mesh, beside.clone().setX(PLANE_X + 2), new THREE.Vector3(-1, 0, 0))
		).toBeCloseTo(2, 3);
		expect(firstHit(mesh, beside.clone().setX(3), new THREE.Vector3(1, 0, 0))).toBeCloseTo(
			PLANE_X - 3,
			3
		);
	});

	it('builds the usual door visual in the gable’s plane, swinging into the attic', () => {
		const { buildingManager, roofManager } = setup();
		const roof = addGable(buildingManager);
		const door = addGableDoor(buildingManager, roof.id).value!;

		const pivots = new Map(buildingManager.getDoorHingePivots());
		const pivot = pivots.get(door.id)!;
		expect(pivot).toBeDefined();
		expect(pivot.children.some((c) => c.name === 'door-leaf')).toBe(true);

		roofManager.group.updateWorldMatrix(true, true);
		const aim = pivot.parent!.localToWorld(
			new THREE.Vector3(pivot.userData.aimU, pivot.userData.aimY, 0)
		);
		expect(aim.x).toBeCloseTo(PLANE_X, 5);
		expect(aim.y).toBeCloseTo(TOP_Y + (3 + 5.1) / 2, 5);
		expect(aim.z).toBeCloseTo(3, 5);

		const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
		camera.position.set(PLANE_X + 2, TOP_Y + 4, 3);
		camera.lookAt(PLANE_X, TOP_Y + 4, 3);
		camera.updateMatrixWorld();
		const controller = new DoorInteractionController({
			camera,
			getHingePivots: () => buildingManager.getDoorHingePivots()
		});
		const feetY = TOP_Y + 3;
		const headY = feetY + 1.7;
		const closed = controller.getCollisionRects();
		expect(closed).toHaveLength(1);
		const blocked = resolvePlayerPositionAgainstWalls(PLANE_X, 3, feetY, headY, 0.35, closed);
		expect(Math.abs(blocked.x - PLANE_X)).toBeGreaterThan(0.05);

		expect(controller.toggleLookedAtDoor()).toBe(door.id);
		controller.update(1);
		roofManager.group.updateWorldMatrix(true, true);
		const through = resolvePlayerPositionAgainstWalls(
			PLANE_X,
			3,
			feetY,
			headY,
			0.35,
			controller.getCollisionRects()
		);
		expect(through.x).toBeCloseTo(PLANE_X);
		expect(through.z).toBeCloseTo(3);

		const leaf = pivot.children.find((c) => c.name === 'door-leaf')!;
		const leafCenter = new THREE.Box3().setFromObject(leaf).getCenter(new THREE.Vector3());
		expect(leafCenter.x).toBeLessThan(PLANE_X - 0.3);
		controller.dispose();
	});

	it('gives a window its frame and glass', () => {
		const { buildingManager, roofManager } = setup();
		const roof = addGable(buildingManager);
		const result = buildingManager.addRoofOpening({
			roofId: roof.id,
			face: '-x',
			type: 'window',
			minU: 2.4,
			maxU: 3.6,
			minY: 3.9,
			maxY: 5.1,
			edgeMargin: MARGIN,
			spacing: SPACING
		});
		expect(result.valid).toBe(true);
		const names: string[] = [];
		roofManager.getMeshForRoof(roof.id)!.traverse((child) => names.push(child.name));
		expect(names).toEqual(
			expect.arrayContaining(['roof-face--x', 'window-visual', 'window-frame', 'window-glass'])
		);
	});

	it('refuses openings that do not fit, and leaves the roof untouched', () => {
		const { buildingManager } = setup();
		const roof = addGable(buildingManager);
		const groundFloorWindow = buildingManager.addRoofOpening({
			roofId: roof.id,
			face: '+x',
			type: 'window',
			minU: 2.4,
			maxU: 3.6,
			minY: 0.9,
			maxY: 2.1,
			edgeMargin: MARGIN,
			spacing: SPACING
		});
		expect(groundFloorWindow).toEqual({ valid: false, reason: 'Opening is below this gable' });

		const nearEave = buildingManager.addRoofOpening({
			roofId: roof.id,
			face: '+x',
			type: 'window',
			minU: 0.4,
			maxU: 1.6,
			minY: 3.9,
			maxY: 5.1,
			edgeMargin: MARGIN,
			spacing: SPACING
		});
		expect(nearEave).toEqual({
			valid: false,
			reason: 'Opening crosses the sloping edge of the gable'
		});

		expect(addGableDoor(buildingManager, roof.id).valid).toBe(true);
		expect(addGableDoor(buildingManager, roof.id)).toEqual({
			valid: false,
			reason: 'Opening overlaps existing door'
		});
		expect(buildingManager.getRoof(roof.id)!.openings).toHaveLength(1);

		const hipRoof = addGable(buildingManager, 'hip');
		expect(addGableDoor(buildingManager, hipRoof.id)).toEqual({
			valid: false,
			reason: 'That side of the roof has no gable'
		});
	});

	it('removing the opening restores the solid gable and drops its door', () => {
		const { buildingManager, roofManager } = setup();
		const roof = addGable(buildingManager);
		const solidVertices = roofManager.getMeshForRoof(roof.id)!.geometry.attributes.position.count;
		const door = addGableDoor(buildingManager, roof.id).value!;
		expect(roofManager.getMeshForRoof(roof.id)!.geometry.attributes.position.count).toBeGreaterThan(
			solidVertices
		);

		const removal = new BuildingRemovalManager(buildingManager);
		const target = resolveRemovalTarget({
			foundationId: 'f1',
			roofId: roof.id,
			openingId: door.id,
			openingType: 'door'
		});
		expect(target?.type).toBe('roof-opening');
		expect(removal.remove(target!)).toBe(true);

		expect(buildingManager.getRoof(roof.id)!.openings).toEqual([]);
		expect(roofManager.getMeshForRoof(roof.id)!.geometry.attributes.position.count).toBe(
			solidVertices
		);
		expect(new Map(buildingManager.getDoorHingePivots()).has(door.id)).toBe(false);
		expect(buildingManager.removeRoofOpening(roof.id, door.id)).toBe(false);
	});

	it('removing the roof cleans up its openings and doors', () => {
		const { buildingManager } = setup();
		const roof = addGable(buildingManager);
		const door = addGableDoor(buildingManager, roof.id).value!;
		expect(buildingManager.removeRoof(roof.id)).toBe(true);
		expect(new Map(buildingManager.getDoorHingePivots()).has(door.id)).toBe(false);
		expect(buildingManager.getRoof(roof.id)).toBeUndefined();
	});

	it('keeps openings through a repaint', () => {
		const { buildingManager, roofManager } = setup();
		const roof = addGable(buildingManager);
		const door = addGableDoor(buildingManager, roof.id).value!;
		const cutVertices = roofManager.getMeshForRoof(roof.id)!.geometry.attributes.position.count;
		expect(buildingManager.paintRoof(roof.id, colorMaterialFromHex('#884422'))).toBe(true);
		expect(roofManager.getMeshForRoof(roof.id)!.geometry.attributes.position.count).toBe(
			cutVertices
		);
		expect(new Map(buildingManager.getDoorHingePivots()).has(door.id)).toBe(true);
	});

	it('saves and restores openings with their roof and face; older saves load without any', () => {
		const first = setup();
		const roof = addGable(first.buildingManager);
		const door = addGableDoor(first.buildingManager, roof.id).value!;
		const cutVertices = first.roofManager.getMeshForRoof(roof.id)!.geometry.attributes.position
			.count;
		const saved = JSON.parse(JSON.stringify(first.buildingManager.serialize()));
		expect(saved[0].roofs[0].openings).toEqual([door]);

		const second = setup();
		second.buildingManager.load(saved);
		expect(second.buildingManager.getRoof(roof.id)!.openings).toEqual([door]);
		expect(second.roofManager.getMeshForRoof(roof.id)!.geometry.attributes.position.count).toBe(
			cutVertices
		);
		expect(new Map(second.buildingManager.getDoorHingePivots()).has(door.id)).toBe(true);

		const legacy = JSON.parse(JSON.stringify(saved));
		delete legacy[0].roofs[0].openings;
		const third = setup();
		third.buildingManager.load(legacy);
		expect(third.buildingManager.getRoof(roof.id)!.openings).toBeUndefined();
		expect(third.buildingManager.getDoorHingePivots()).toHaveLength(0);
		expect(third.buildingManager.serialize()[0].roofs[0]).not.toHaveProperty('openings');
	});

	it('finds the face under a hit on the gable, and none on the slope', () => {
		const { buildingManager } = setup();
		const roof = addGable(buildingManager);
		const onGable = buildingManager.locateRoofFace(roof.id, PLANE_X, TOP_Y + 4, 3);
		expect(onGable?.face.side).toBe('+x');
		expect(onGable?.point.u).toBeCloseTo(3);
		expect(onGable?.point.y).toBeCloseTo(4);
		expect(onGable?.transform.originWorldY).toBe(TOP_Y);
		expect(buildingManager.locateRoofFace(roof.id, 3, TOP_Y + 5, 1.5)).toBeNull();
	});
});
