import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingLevelManager } from '../BuildingLevelManager';
import { FoundationManager } from '../FoundationManager';
import type { FoundationDefinition } from '../FoundationTypes';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import { raycastSlabConstructionPlane } from '../foundationTopTargeting';

const SPACING = 2;
const BUILDING_GRID_SIZE = 0.25;
const WALL_HEIGHT = 3;

// Footprint spans world X/Z [-10, 10]; top surface at y=10, bottom at y=2.
function makeDefinition(overrides: Partial<FoundationDefinition> = {}): FoundationDefinition {
	return {
		id: 'test-foundation',
		minGridX: -5,
		maxGridX: 5,
		minGridZ: -5,
		maxGridZ: 5,
		topY: 10,
		bottomY: 2,
		...overrides
	};
}

function makeRaycaster(origin: THREE.Vector3, direction: THREE.Vector3): THREE.Raycaster {
	return new THREE.Raycaster(origin, direction.clone().normalize());
}

beforeEach(() => {
	// BuildingLevelManager registers a Page Up/Down listener in its constructor — no real `window`
	// exists in vitest's node environment, matching BuildingLevelManager.spec.ts's own stub.
	vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('raycastSlabConstructionPlane', () => {
	it('intersects the slab plane at ceiling height (topY + baseY + wallHeight), not ground height, while standing inside the footprint and looking straight up', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation(makeDefinition());
		const settings = createDefaultBuildingSettings();
		settings.defaultStoreyHeight = WALL_HEIGHT;
		const levelManager = new BuildingLevelManager(settings);

		// Straight up from inside the footprint — X/Z are unaffected by which height the plane sits
		// at, so this only proves foundation resolution + the footprint-containment check.
		const raycaster = makeRaycaster(new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 1, 0));

		const hit = raycastSlabConstructionPlane(
			raycaster,
			foundationManager,
			levelManager,
			0,
			SPACING,
			BUILDING_GRID_SIZE
		);

		expect(hit).not.toBeNull();
		expect(hit?.foundationId).toBe('test-foundation');
		// world (0,0) -> local (10, 10) -> grid (40, 40) at buildingGridSize 0.25.
		expect(hit?.gridPoint).toEqual({ gridX: 40, gridZ: 40 });
	});

	it('regression: a diagonal look-up ray resolves against the ceiling plane, not the ground — the old ground-height plane would put the hit point measurably further along the ray', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation(makeDefinition());
		const settings = createDefaultBuildingSettings();
		settings.defaultStoreyHeight = WALL_HEIGHT;
		const levelManager = new BuildingLevelManager(settings);

		const origin = new THREE.Vector3(0, 1.7, 0);
		const direction = new THREE.Vector3(0.3, 1, 0); // tilted up and to the side

		const hit = raycastSlabConstructionPlane(
			makeRaycaster(origin, direction),
			foundationManager,
			levelManager,
			0,
			SPACING,
			BUILDING_GRID_SIZE
		);
		expect(hit).not.toBeNull();

		// Same ray, intersected by hand against the ceiling plane (topY + baseY + wallHeight = 13)
		// and against the old ground plane (topY + baseY = 10), to confirm which one the function
		// actually used.
		const ceilingT = (13 - origin.y) / direction.y;
		const ceilingWorldX = origin.x + direction.x * ceilingT;
		const groundT = (10 - origin.y) / direction.y;
		const groundWorldX = origin.x + direction.x * groundT;
		expect(ceilingWorldX).not.toBeCloseTo(groundWorldX, 3);

		const expectedGridX = Math.round((ceilingWorldX - -10) / BUILDING_GRID_SIZE);
		expect(hit?.gridPoint.gridX).toBe(expectedGridX);
	});

	it('falls back to a physical mesh hit on the foundation top to resolve which foundation, when standing outside its footprint but looking at it', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation(makeDefinition());
		const settings = createDefaultBuildingSettings();
		settings.defaultStoreyHeight = WALL_HEIGHT;
		const levelManager = new BuildingLevelManager(settings);

		// Origin is outside the footprint (x=15 > maxGridX*SPACING=10); a steep, mostly-downward ray
		// keeps X within the footprint at both the mesh's top-surface height (10) and the slab's
		// ceiling height (13), so the mesh-hit fallback succeeds and the result stays valid.
		const origin = new THREE.Vector3(15, 100, 0);
		const direction = new THREE.Vector3(-6, -95, 0);

		const hit = raycastSlabConstructionPlane(
			makeRaycaster(origin, direction),
			foundationManager,
			levelManager,
			0,
			SPACING,
			BUILDING_GRID_SIZE
		);

		expect(hit).not.toBeNull();
		expect(hit?.foundationId).toBe('test-foundation');
	});

	it('returns null when the ray hits neither the footprint (standing inside) nor the foundation mesh', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation(makeDefinition());
		const settings = createDefaultBuildingSettings();
		const levelManager = new BuildingLevelManager(settings);

		// Far outside the footprint, looking straight up — never touches the foundation at all.
		const hit = raycastSlabConstructionPlane(
			makeRaycaster(new THREE.Vector3(500, 1.7, 500), new THREE.Vector3(0, 1, 0)),
			foundationManager,
			levelManager,
			0,
			SPACING,
			BUILDING_GRID_SIZE
		);

		expect(hit).toBeNull();
	});

	it('returns null when standing inside the footprint but looking up at such a shallow angle the ceiling-plane hit falls outside it', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation(makeDefinition());
		const settings = createDefaultBuildingSettings();
		settings.defaultStoreyHeight = WALL_HEIGHT;
		const levelManager = new BuildingLevelManager(settings);

		// Standing just inside the edge, aiming mostly sideways — by the time the ray reaches the
		// ceiling's height, X has run far past the footprint's edge.
		const origin = new THREE.Vector3(9, 1.7, 0);
		const direction = new THREE.Vector3(20, 1, 0);

		const hit = raycastSlabConstructionPlane(
			makeRaycaster(origin, direction),
			foundationManager,
			levelManager,
			0,
			SPACING,
			BUILDING_GRID_SIZE
		);

		expect(hit).toBeNull();
	});

	it('uses the requested level, not always level 0 — a level-2 slab plane sits three storeys up', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation(makeDefinition());
		const settings = createDefaultBuildingSettings();
		settings.defaultStoreyHeight = WALL_HEIGHT;
		const levelManager = new BuildingLevelManager(settings);

		const origin = new THREE.Vector3(0, 1.7, 0);
		const hitLevel0 = raycastSlabConstructionPlane(
			makeRaycaster(origin, new THREE.Vector3(0.05, 1, 0)),
			foundationManager,
			levelManager,
			0,
			SPACING,
			BUILDING_GRID_SIZE
		);
		const hitLevel2 = raycastSlabConstructionPlane(
			makeRaycaster(origin, new THREE.Vector3(0.05, 1, 0)),
			foundationManager,
			levelManager,
			2,
			SPACING,
			BUILDING_GRID_SIZE
		);

		expect(hitLevel0).not.toBeNull();
		expect(hitLevel2).not.toBeNull();
		// A steeper plane (further up the same ray) is reached at a larger X offset for the same
		// rightward tilt, so the two levels' grid points must differ.
		expect(hitLevel2?.gridPoint.gridX).not.toBe(hitLevel0?.gridPoint.gridX);
	});
});
