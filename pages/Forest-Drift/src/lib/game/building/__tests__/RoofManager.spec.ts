import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultRoofProfileSettings, type RoofDefinition } from '../RoofTypes';
import { RoofManager } from '../RoofManager';
import type { FoundationDefinition } from '../FoundationTypes';

const VERTEX_SPACING = 1;
const BUILDING_GRID_SIZE = 0.5;

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
	return new RoofManager({
		getFoundation: (id) => foundations.get(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => BUILDING_GRID_SIZE
	});
}

function gableRoof(overrides: Partial<RoofDefinition> = {}): RoofDefinition {
	return {
		id: 'roof-1',
		foundationId: 'f1',
		levelIndex: 0,
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 20, gridZ: 0 },
			{ gridX: 20, gridZ: 12 },
			{ gridX: 0, gridZ: 12 }
		],
		baseY: 3,
		type: 'gable',
		direction: 'x',
		shedDirection: '+x',
		rise: 2,
		thickness: 0.2,
		overhang: 0,
		profileSettings: createDefaultRoofProfileSettings(),
		...overrides
	};
}

describe('RoofManager', () => {
	let manager: RoofManager;

	beforeEach(() => {
		manager = makeManager();
	});

	it('adds a valid pitched roof and can retrieve/serialize/remove it', () => {
		const result = manager.addRoof(gableRoof());
		expect(result.ok).toBe(true);
		expect(manager.getRoof('roof-1')).toBeDefined();
		expect(manager.serialize()).toHaveLength(1);
		expect(manager.removeRoof('roof-1')).toBe(true);
		expect(manager.getRoof('roof-1')).toBeUndefined();
	});

	it('rejects a pitched roof on a non-rectangular footprint instead of building corrupt geometry', () => {
		const result = manager.addRoof(
			gableRoof({
				points: [
					{ gridX: 0, gridZ: 0 },
					{ gridX: 20, gridZ: 0 },
					{ gridX: 12, gridZ: 12 },
					{ gridX: 0, gridZ: 8 }
				]
			})
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toMatch(/rectangular/i);
	});

	it('accepts a flat roof on an arbitrary polygon', () => {
		const result = manager.addRoof(
			gableRoof({
				type: 'flat',
				points: [
					{ gridX: 0, gridZ: 0 },
					{ gridX: 20, gridZ: 0 },
					{ gridX: 12, gridZ: 12 },
					{ gridX: 0, gridZ: 8 }
				]
			})
		);
		expect(result.ok).toBe(true);
	});

	it('getTopSurfacesAt returns the eave height directly under an eave, and the ridge height directly under the ridge', () => {
		manager.addRoof(gableRoof());
		// Footprint in world units: 0..10 (X), 0..6 (Z) [20/0.5, 12/0.5], foundation topY=10, baseY=3
		// (foundation-local) -> eave world Y = 10 + 3 = 13. Ridge (direction 'x') sits at z = 3
		// (world), height 13 + 2 = 15.
		const atEave = manager.getTopSurfacesAt(5, 0);
		expect(atEave).toHaveLength(1);
		expect(atEave[0]).toBeCloseTo(13, 6);

		const atRidge = manager.getTopSurfacesAt(5, 3);
		expect(atRidge).toHaveLength(1);
		expect(atRidge[0]).toBeCloseTo(15, 6);
	});

	it('getTopSurfacesAt is empty well outside the roof footprint', () => {
		manager.addRoof(gableRoof());
		expect(manager.getTopSurfacesAt(500, 500)).toHaveLength(0);
	});

	it('getUndersidesAt sits `thickness` below the top surface at the same point', () => {
		manager.addRoof(gableRoof({ thickness: 0.25 }));
		const [top] = manager.getTopSurfacesAt(5, 3);
		const [underside] = manager.getUndersidesAt(5, 3);
		expect(top - underside).toBeCloseTo(0.25, 6);
	});

	it('load() replaces all roofs and round-trips through serialize()', () => {
		manager.addRoof(gableRoof({ id: 'a' }));
		manager.load([gableRoof({ id: 'b' }), gableRoof({ id: 'c', type: 'hip' })]);
		const ids = manager
			.serialize()
			.map((r) => r.id)
			.sort();
		expect(ids).toEqual(['b', 'c']);
	});

	it('setMaterial updates the stored definition', () => {
		manager.addRoof(gableRoof());
		expect(manager.setMaterial('roof-1', { type: 'color', color: '#aabbcc' })).toBe(true);
		expect(manager.getRoof('roof-1')?.material).toEqual({ type: 'color', color: '#aabbcc' });
	});

	it('removeRoofsForFoundation only removes roofs on that foundation', () => {
		manager.addRoof(gableRoof({ id: 'a', foundationId: 'f1' }));
		manager.removeRoofsForFoundation('f1');
		expect(manager.getAllRoofs()).toHaveLength(0);
	});
});
