import { describe, it, expect } from 'vitest';
import { TerrainEdits, validTerrainEditData } from '../TerrainEdits';
import { EarthFoundationField } from '../../building/EarthFoundationField';
const base = () => 0;
const allow = () => null;
describe('shovel terrain transactions', () => {
	it('raises, interpolates, undoes and redoes without changing distant ground', () => {
		const edits = new TerrainEdits(2);
		const { stroke } = edits.propose(0, 0, 2, 0.125, true, base, allow);
		expect(stroke.patches).toHaveLength(1);
		edits.apply(stroke);
		expect(edits.sample(0, 0, 0, base)).toBe(0.125);
		expect(edits.sample(1, 0, 0, base)).toBe(0.0625);
		expect(edits.sample(30, 0, 0, base)).toBe(0);
		edits.apply(stroke, true);
		expect(edits.serialize().points).toEqual([]);
		edits.apply(stroke);
		expect(edits.get(0, 0)).toBe(0.125);
	});
	it('keeps unfinished strokes out of saves and merges repeated points for undo', () => {
		const edits = new TerrainEdits(2);
		edits.begin();
		const sample = (x: number, z: number) => edits.sample(x, z, 0, base);
		for (let i = 0; i < 3; i++)
			edits.apply(edits.propose(0, 0, 2, 0.125, true, sample, allow).stroke, false, true);
		expect(edits.serialize().points).toEqual([]);
		const stroke = edits.finish()!;
		expect(stroke.patches).toHaveLength(1);
		expect(edits.serialize().points).toEqual([[0, 0, 0.375]]);
		edits.apply(stroke, true);
		expect(sample(0, 0)).toBe(0);
	});
	it('protects the full interpolation footprint and never stores hidden edits', () => {
		const edits = new TerrainEdits(2);
		const result = edits.propose(0, 0, 2, 0.125, true, base, (x) =>
			x >= 2 ? 'Protected foundation' : null
		);
		expect(result.stroke.patches).toEqual([]);
		expect(result.reason).toContain('Protected');
		expect(edits.serialize().points).toEqual([]);
	});
	it('stops worsening a steep slope, without flattening existing terrain', () => {
		const edits = new TerrainEdits(2);
		const mountain = (x: number) => (x === 0 ? 10 : 0);
		expect(edits.propose(0, 0, 2, 0.125, true, mountain, allow).stroke.patches).toEqual([]);
		expect(edits.propose(0, 0, 2, -0.125, true, mountain, allow).stroke.patches).toHaveLength(1);
	});
	it('round trips negative coordinates and lattice spacing', () => {
		const edits = new TerrainEdits(2);
		edits.apply(edits.propose(-4, -6, 2, -0.125, true, base, allow).stroke);
		const restored = new TerrainEdits(1);
		restored.load(edits.serialize());
		expect(restored.spacing).toBe(2);
		expect(restored.sample(-4, -6, 0, base)).toBe(-0.125);
	});
	it('rejects malformed, duplicate and unbounded save data before loading', () => {
		for (const data of [
			{ version: 1, spacing: 0, points: [] },
			{ version: 1, spacing: 2, points: [[0, 0, NaN]] },
			{
				version: 1,
				spacing: 2,
				points: [
					[0, 0, 1],
					[0, 0, 2]
				]
			},
			{ version: 1, spacing: 2, points: [[1e12, 0, 1]] }
		])
			expect(validTerrainEditData(data)).toBe(false);
	});
});
describe('shared foundation protection', () => {
	const stone = {
		id: 'stone',
		minGridX: 0,
		maxGridX: 2,
		minGridZ: 0,
		maxGridZ: 2,
		topY: 2,
		bottomY: -1
	};
	it('keeps grass cores flat when old manual edits are masked', () => {
		const field = new EarthFoundationField();
		field.rebuild([{ ...stone, style: 'earth' }], 2);
		expect(field.constrainManual(2, 2, 2, -4)).toBe(2);
		expect(field.constrainManual(2, 2, 2, 10)).toBe(2);
	});
	it('caps a grass bank approaching stone regardless of definition order', () => {
		const earth = {
			...stone,
			id: 'earth',
			minGridX: 4,
			maxGridX: 6,
			topY: 6,
			style: 'earth' as const,
			blendWidth: 12
		};
		const a = new EarthFoundationField(),
			b = new EarthFoundationField();
		a.rebuild([earth, stone], 2);
		b.rebuild([stone, earth], 2);
		for (let x = 4; x < 8; x += 0.25) {
			expect(a.sample(x, 2, 0)).toBeCloseTo(b.sample(x, 2, 0));
			expect(a.sample(x, 2, 0)).toBeLessThanOrEqual(1.95 + (x - 4) * 0.65 + 0.0001);
		}
	});
});

import { TerrainChunk } from '../TerrainChunk';
import { TerrainHeightSampler } from '../TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../TerrainSettings';
import { FoundationManager } from '../../building/FoundationManager';
import { flattenWorld, unflattenWorld } from '../../net/worldEntities';
import type { AuthoredContent } from '../../net/worldEntities';
describe('rendering, retaining walls and shared persistence', () => {
	it('updates only dirty lattice vertices and keeps geometry buffers', () => {
		const sampler = new TerrainHeightSampler(createDefaultTerrainSettings());
		const chunk = new TerrainChunk(48);
		chunk.populate(0, 0, 96, sampler, 0);
		const buffer = chunk.mesh.geometry.getAttribute('position');
		const far = buffer.getY(48 * 49 + 48);
		let count = 0;
		sampler.setHeightModifier((_x, _z, h) => {
			count++;
			return h + 1;
		});
		chunk.populate(0, 0, 96, sampler, 1, 'normal', null, null, null, {
			minX: 8,
			maxX: 12,
			minZ: 8,
			maxZ: 12
		});
		expect(chunk.mesh.geometry.getAttribute('position')).toBe(buffer);
		expect(count).toBeLessThan(100);
		expect(buffer.getY(48 * 49 + 48)).toBe(far);
		chunk.dispose();
	});
	it('extends retaining masonry and restores it without ratcheting the saved base', () => {
		const manager = new FoundationManager(() => 2);
		const d = {
			id: 'stone',
			minGridX: 0,
			maxGridX: 2,
			minGridZ: 0,
			maxGridZ: 2,
			topY: 2,
			bottomY: -1
		};
		manager.addFoundation(d);
		const bounds = { minX: -2, maxX: 6, minZ: -2, maxZ: 6 };
		manager.refreshTerrainSupport(bounds, () => -3);
		const mesh = manager.getMeshForFoundation('stone')!;
		expect(mesh.position.y).toBe(-0.75);
		expect(manager.serialize()[0].bottomY).toBe(-1);
		expect(manager.getTopYAt(2, 2)).toBe(2);
		manager.refreshTerrainSupport(bounds, () => 0);
		expect(mesh.scale.y).toBe(1);
		expect(mesh.position.y).toBe(0.5);
		manager.dispose();
	});
	it('rejects overlapping pads and impossible grass banks before placement', () => {
		const manager = new FoundationManager(() => 2);
		manager.addFoundation({
			id: 's',
			minGridX: 0,
			maxGridX: 2,
			minGridZ: 0,
			maxGridZ: 2,
			topY: 2,
			bottomY: -1
		});
		expect(
			manager.placementConflict({
				id: 'e',
				style: 'earth',
				minGridX: 1,
				maxGridX: 3,
				minGridZ: 0,
				maxGridZ: 2,
				topY: 2,
				bottomY: 0
			})
		).toContain('overlap');
		expect(
			manager.placementConflict({
				id: 'e',
				style: 'earth',
				minGridX: 3,
				maxGridX: 5,
				minGridZ: 0,
				maxGridZ: 2,
				topY: 6,
				bottomY: 0
			})
		).toContain('bank');
		manager.dispose();
	});
	it('sends bounded spatial terrain tiles and reconstructs their saved points', () => {
		const terrain = {
			version: 1 as const,
			spacing: 2,
			points: [
				[0, 0, 1],
				[-1, -1, 2],
				[32, 8, 3]
			] as [number, number, number][]
		};
		const content = {
			foundations: [],
			buildings: [],
			buildingLevels: [],
			barriers: [],
			furniture: [],
			miniBuilds: { definitions: [], instances: [] },
			musicTrees: [],
			musicPlants: [],
			proceduralOverrides: { removedTreeIds: [], terrainEdits: terrain }
		} satisfies AuthoredContent;
		const rows = flattenWorld(content);
		expect(rows.filter((r) => r.kind === 'terrainTile')).toHaveLength(3);
		const restored = unflattenWorld(rows).proceduralOverrides.terrainEdits!;
		expect(restored.spacing).toBe(2);
		expect(restored.points).toEqual(expect.arrayContaining(terrain.points));
	});
});

it('updates a shared chunk edge with matching heights/normals and survives chunk regeneration', () => {
	const sampler = new TerrainHeightSampler(createDefaultTerrainSettings());
	const edits = new TerrainEdits(2);
	const base = (x: number, z: number) => sampler.sampleUnmodified(x, z);
	sampler.setHeightModifier((x, z, h) => edits.sample(x, z, h, base));
	const a = new TerrainChunk(48),
		b = new TerrainChunk(48);
	a.populate(0, 0, 96, sampler, 0);
	b.populate(1, 0, 96, sampler, 0);
	const h = base(96, 48),
		stroke = {
			patches: [{ x: 48, z: 24, before: undefined, after: h + 0.25 }],
			bounds: { minX: 94, maxX: 98, minZ: 46, maxZ: 50 }
		};
	edits.apply(stroke);
	a.populate(0, 0, 96, sampler, 1, 'normal', null, null, null, stroke.bounds);
	b.populate(1, 0, 96, sampler, 1, 'normal', null, null, null, stroke.bounds);
	const ai = 24 * 49 + 48,
		bi = 24 * 49;
	for (const attr of ['position', 'normal']) {
		const ap = a.mesh.geometry.getAttribute(attr),
			bp = b.mesh.geometry.getAttribute(attr);
		expect([ap.getX(ai), ap.getY(ai), ap.getZ(ai)]).toEqual([
			bp.getX(bi),
			bp.getY(bi),
			bp.getZ(bi)
		]);
	}
	const fresh = new TerrainChunk(48);
	fresh.populate(1, 0, 96, sampler, 1);
	expect(fresh.mesh.geometry.getAttribute('position').getY(bi)).toBe(
		b.mesh.geometry.getAttribute('position').getY(bi)
	);
	a.dispose();
	b.dispose();
	fresh.dispose();
});
