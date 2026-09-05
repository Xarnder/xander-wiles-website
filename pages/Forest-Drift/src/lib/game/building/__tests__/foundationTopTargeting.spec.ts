import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingLevelManager } from '../BuildingLevelManager';
import { FoundationManager } from '../FoundationManager';
import type { FoundationDefinition } from '../FoundationTypes';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import {
	raycastLevelConstructionPlane,
	raycastSlabConstructionPlane
} from '../foundationTopTargeting';

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
		levelManager.setCurrentLevelIndex('test-foundation', 0);
		const hitLevel0 = raycastSlabConstructionPlane(
			makeRaycaster(origin, new THREE.Vector3(0.05, 1, 0)),
			foundationManager,
			levelManager,
			SPACING,
			BUILDING_GRID_SIZE
		);
		levelManager.setCurrentLevelIndex('test-foundation', 2);
		const hitLevel2 = raycastSlabConstructionPlane(
			makeRaycaster(origin, new THREE.Vector3(0.05, 1, 0)),
			foundationManager,
			levelManager,
			SPACING,
			BUILDING_GRID_SIZE
		);

		expect(hitLevel0).not.toBeNull();
		expect(hitLevel2).not.toBeNull();
		// A steeper plane (further up the same ray) is reached at a larger X offset for the same
		// rightward tilt, so the two levels' grid points must differ.
		expect(hitLevel2?.gridPoint.gridX).not.toBe(hitLevel0?.gridPoint.gridX);
	});

	it('regression: falls back to the already-active foundation when the player has stepped OUTSIDE its footprint to get a workable angle on an elevated plane, neither other heuristic can resolve one', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation(makeDefinition());
		const settings = createDefaultBuildingSettings();
		settings.defaultStoreyHeight = WALL_HEIGHT;
		const levelManager = new BuildingLevelManager(settings);
		levelManager.setCurrentLevelIndex('test-foundation', 1); // ceiling plane at topY(10)+baseY(3)+wallHeight(3)=16
		levelManager.reportHoveredFoundation('test-foundation'); // establishes it as "active" beforehand

		// Origin x=15 is outside the footprint ([-10, 10]); looking up and back toward it never hits
		// the ground mesh either (direction.y is positive, moving away from anything at ground level).
		const origin = new THREE.Vector3(15, 1.7, 0);
		const direction = new THREE.Vector3(-0.5, 1, 0);

		const hit = raycastSlabConstructionPlane(
			makeRaycaster(origin, direction),
			foundationManager,
			levelManager,
			SPACING,
			BUILDING_GRID_SIZE
		);

		expect(hit).not.toBeNull();
		expect(hit?.foundationId).toBe('test-foundation');
	});

	it('the active-foundation fallback does not rescue a ray that lands genuinely outside the footprint', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation(makeDefinition());
		const settings = createDefaultBuildingSettings();
		settings.defaultStoreyHeight = WALL_HEIGHT;
		const levelManager = new BuildingLevelManager(settings);
		levelManager.reportHoveredFoundation('test-foundation');

		// Same "outside the footprint, no mesh hit" setup, but aimed further away so the plane
		// intersection itself lands well outside the real footprint — the fallback resolves a
		// foundation, but the final bounds check still rejects the result.
		const origin = new THREE.Vector3(15, 1.7, 0);
		const direction = new THREE.Vector3(1, 1, 0); // tilts further AWAY from the footprint, not back toward it

		const hit = raycastSlabConstructionPlane(
			makeRaycaster(origin, direction),
			foundationManager,
			levelManager,
			SPACING,
			BUILDING_GRID_SIZE
		);

		expect(hit).toBeNull();
	});
});

describe('raycastLevelConstructionPlane', () => {
	it('returns a direct mesh hit at level 0 when looking down at the foundation from within its footprint', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation(makeDefinition());
		const settings = createDefaultBuildingSettings();
		const levelManager = new BuildingLevelManager(settings);

		const hit = raycastLevelConstructionPlane(
			makeRaycaster(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -1, 0)),
			foundationManager,
			levelManager,
			SPACING,
			BUILDING_GRID_SIZE
		);

		expect(hit).not.toBeNull();
		expect(hit?.foundationId).toBe('test-foundation');
	});

	it('resolves the floor plane at an elevated level via the "standing inside the footprint" fallback when looking up', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation(makeDefinition());
		const settings = createDefaultBuildingSettings();
		settings.defaultStoreyHeight = WALL_HEIGHT;
		const levelManager = new BuildingLevelManager(settings);
		levelManager.setCurrentLevelIndex('test-foundation', 1); // floor plane at topY(10)+baseY(3)=13

		const hit = raycastLevelConstructionPlane(
			makeRaycaster(new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 1, 0)),
			foundationManager,
			levelManager,
			SPACING,
			BUILDING_GRID_SIZE
		);

		expect(hit).not.toBeNull();
		expect(hit?.foundationId).toBe('test-foundation');
	});

	it('regression: falls back to the already-active foundation when standing OUTSIDE its footprint with no mesh hit — stepping back for a workable angle on an elevated level', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation(makeDefinition());
		const settings = createDefaultBuildingSettings();
		settings.defaultStoreyHeight = WALL_HEIGHT;
		const levelManager = new BuildingLevelManager(settings);
		levelManager.setCurrentLevelIndex('test-foundation', 1); // floor plane at topY(10)+baseY(3)=13
		levelManager.reportHoveredFoundation('test-foundation');

		const origin = new THREE.Vector3(15, 1.7, 0);
		const direction = new THREE.Vector3(-0.5, 1, 0);

		const hit = raycastLevelConstructionPlane(
			makeRaycaster(origin, direction),
			foundationManager,
			levelManager,
			SPACING,
			BUILDING_GRID_SIZE
		);

		expect(hit).not.toBeNull();
		expect(hit?.foundationId).toBe('test-foundation');
	});

	it('still returns null when nothing is active and neither other heuristic resolves a foundation', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation(makeDefinition());
		const settings = createDefaultBuildingSettings();
		const levelManager = new BuildingLevelManager(settings);

		const hit = raycastLevelConstructionPlane(
			makeRaycaster(new THREE.Vector3(500, 1.7, 500), new THREE.Vector3(0, 1, 0)),
			foundationManager,
			levelManager,
			SPACING,
			BUILDING_GRID_SIZE
		);

		expect(hit).toBeNull();
	});
});
