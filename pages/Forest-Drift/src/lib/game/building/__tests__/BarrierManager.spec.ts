import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { migrateWorld } from '../../world/WorldMigrationManager';
import { barrierPrototypeBuildCount } from '../BarrierGeometryCompiler';
import { layoutBarrier } from '../barrierLayout';
import { BarrierManager, releaseAfterUpload } from '../BarrierManager';
import {
	cloneBarrierStyle,
	getBarrierPreset,
	sanitizeBarrierStyle,
	validateBarriers,
	type BarrierDefinition,
	type BarrierPresetId
} from '../BarrierTypes';
import { BuildingMaterialManager } from '../BuildingMaterialManager';
import type { FoundationDefinition } from '../FoundationTypes';

const FOUNDATION: FoundationDefinition = {
	id: 'f1',
	minGridX: 10,
	maxGridX: 20,
	minGridZ: 0,
	maxGridZ: 10,
	topY: 4,
	bottomY: 1
};

function createManager() {
	const materials = new BuildingMaterialManager();
	let next = 0;
	const manager = new BarrierManager({
		materialManager: materials,
		getFoundation: (id) => (id === FOUNDATION.id ? FOUNDATION : undefined),
		getVertexSpacing: () => 1,
		sampleSurface: (x) => 2 + x * 0.1,
		sampleTerrain: (x) => 2 + x * 0.1,
		getStoreyHeight: () => 3,
		createId: () => `split-${next++}`
	});
	return { manager, materials };
}

function barrier(
	id: string,
	preset: BarrierPresetId,
	points: [number, number, number][],
	overrides: Partial<BarrierDefinition> = {}
): BarrierDefinition {
	return {
		id,
		type: getBarrierPreset(preset).type,
		foundationId: null,
		points: points.map(([x, y, z]) => ({ x, y, z })),
		closed: false,
		baseMode: 'flat',
		style: cloneBarrierStyle(getBarrierPreset(preset).style),
		...overrides
	};
}

describe('BarrierManager', () => {
	it('renders a 20 m balustrade with 100+ members as a handful of meshes', () => {
		const { manager } = createManager();
		manager.add(
			barrier('a', 'fancy-newel', [
				[0, 0, 0],
				[20, 0, 0]
			])
		);
		const stats = manager.getStats();
		expect(stats.members).toBeGreaterThan(110);
		expect(stats.balusters).toBeGreaterThan(100);
		// One LOD root, three level groups, and one or two meshes per level.
		expect(stats.meshes).toBeLessThanOrEqual(6);
		expect(stats.objects).toBeLessThanOrEqual(10);
		expect(stats.nearDrawCalls).toBeLessThanOrEqual(2);
		expect(stats.trianglesByLod[2]).toBeLessThan(stats.trianglesByLod[0] / 5);
	});

	it('compiles each decorative prototype once and reuses it', () => {
		const { manager } = createManager();
		manager.add(
			barrier('a', 'turned-baluster', [
				[0, 0, 0],
				[6, 0, 0]
			])
		);
		const after = barrierPrototypeBuildCount();
		manager.add(
			barrier('b', 'turned-baluster', [
				[0, 0, 5],
				[12, 0, 5],
				[12, 0, 9]
			])
		);
		expect(barrierPrototypeBuildCount()).toBe(after);
	});

	it('places a foundation railing in that foundation frame on its storey', () => {
		const { manager } = createManager();
		manager.add(
			barrier(
				'rail',
				'classic-interior',
				[
					[1, 3, 1],
					[5, 3, 1]
				],
				{ foundationId: 'f1', levelIndex: 1 }
			)
		);
		const box = new THREE.Box3();
		expect(manager.getWorldBox('rail', box)).toBe(true);
		expect(box.min.x).toBeCloseTo(10 + 1 - 0.1, 1);
		expect(box.min.y).toBeCloseTo(4 + 3, 6);
		const rect = manager.getCollisionRects()[0];
		expect(rect.minWorldY).toBeCloseTo(7, 6);
		expect(rect.maxWorldY).toBeGreaterThan(7 + 0.9);
	});

	it('follows the ground on terrain', () => {
		const { manager } = createManager();
		manager.add(
			barrier(
				'fence',
				'simple-wood-fence',
				[
					[0, 2, 0],
					[10, 3, 0]
				],
				{ baseMode: 'follow-surface' }
			)
		);
		const rects = manager.getCollisionRects();
		expect(rects).toHaveLength(1);
		expect(rects[0].minWorldY).toBeLessThan(2);
		expect(rects[0].maxWorldY).toBeGreaterThan(3 + 1);
	});

	it('repaints without changing geometry and reuses cached materials', () => {
		const { manager } = createManager();
		manager.add(
			barrier('a', 'simple-interior', [
				[0, 0, 0],
				[4, 0, 0]
			])
		);
		manager.add(
			barrier('b', 'simple-interior', [
				[0, 0, 3],
				[4, 0, 3]
			])
		);
		const before = manager.getStats();
		const meshOf = (id: string) => {
			let mesh: THREE.Mesh | undefined;
			manager.group.traverse((c) => {
				if (c instanceof THREE.Mesh && c.userData.barrierId === id && !mesh) mesh = c;
			});
			return mesh!;
		};
		expect(meshOf('a').material).toBe(meshOf('b').material);
		const dark = { type: 'color' as const, color: '#3A2A1E' };
		manager.setMaterial('a', dark);
		manager.setMaterial('b', dark);
		const after = manager.getStats();
		expect(after.vertices).toBe(before.vertices);
		expect(after.triangles).toBe(before.triangles);
		expect(meshOf('a').material).toBe(meshOf('b').material);
		expect(meshOf('a').geometry.attributes.position.count).toBeGreaterThan(0);
	});

	it('round-trips through save / load exactly', () => {
		const { manager } = createManager();
		manager.add(
			barrier(
				'outdoor',
				'simple-wood-fence',
				[
					[0, 2, 0],
					[8, 2.8, 0],
					[8, 2.8, 6]
				],
				{
					baseMode: 'follow-surface'
				}
			)
		);
		manager.add(
			barrier(
				'fancy',
				'fancy-newel',
				[
					[1, 3, 1],
					[4, 3, 1],
					[4, 3, 4],
					[1, 3, 4]
				],
				{
					foundationId: 'f1',
					levelIndex: 1,
					closed: true,
					material: { type: 'color', color: '#6B2E1F' }
				}
			)
		);
		manager.add(
			barrier(
				'stair',
				'turned-baluster',
				[
					[2, 0, 6],
					[5, 2.4, 6]
				],
				{ baseMode: 'linear-slope', foundationId: 'f1' }
			)
		);
		const saved = JSON.parse(JSON.stringify(manager.serialize()));
		expect(validateBarriers(saved, new Set(['f1']))).toBeNull();

		const { manager: reloaded } = createManager();
		reloaded.load(saved);
		expect(reloaded.serialize()).toEqual(saved);
		expect(reloaded.getStats().triangles).toBe(manager.getStats().triangles);
		expect(reloaded.getCollisionRects()).toEqual(manager.getCollisionRects());
	});

	it('removes a barrier with its geometry, collision and scene objects', () => {
		const { manager } = createManager();
		manager.add(
			barrier('a', 'classic-interior', [
				[0, 0, 0],
				[4, 0, 0]
			])
		);
		const geometries: THREE.BufferGeometry[] = [];
		manager.group.traverse((c) => {
			if (c instanceof THREE.Mesh) geometries.push(c.geometry);
		});
		const spies = geometries.map((g) => vi.spyOn(g, 'dispose'));
		const revision = manager.getRevision();
		expect(manager.remove('a')).toBe(true);
		expect(manager.get('a')).toBeUndefined();
		expect(manager.group.children).toHaveLength(0);
		expect(manager.getCollisionRects()).toHaveLength(0);
		expect(manager.getRevision()).toBeGreaterThan(revision);
		for (const spy of spies) expect(spy).toHaveBeenCalled();
	});

	it('removing a middle segment splits the path and gives the cut ends real end posts', () => {
		const { manager } = createManager();
		manager.add(
			barrier('p', 'classic-interior', [
				[0, 0, 0],
				[3, 0, 0],
				[6, 0, 0],
				[9, 0, 0]
			])
		);
		const ids = manager.removeSegment('p', 1);
		expect(ids).toEqual(['p', 'split-0']);
		const [left, right] = ids.map((id) => manager.get(id)!);
		expect(left.points.map((p) => p.x)).toEqual([0, 3]);
		expect(right.points.map((p) => p.x)).toEqual([6, 9]);
		for (const def of [left, right]) {
			const layout = layoutBarrier({ ...def, style: sanitizeBarrierStyle(def.style) });
			expect(
				layout.posts.filter((p) => p.vertexIndex >= 0).every((p) => p.role === 'end-post')
			).toBe(true);
		}
		expect(manager.getCollisionRects()).toHaveLength(2);
	});

	it('removing a segment of a closed loop opens it there', () => {
		const { manager } = createManager();
		manager.add(
			barrier(
				'loop',
				'garden-fence',
				[
					[0, 0, 0],
					[4, 0, 0],
					[4, 0, 4],
					[0, 0, 4]
				],
				{ closed: true }
			)
		);
		expect(manager.removeSegment('loop', 1)).toEqual(['loop']);
		const open = manager.get('loop')!;
		expect(open.closed).toBe(false);
		expect(open.points.map((p) => [p.x, p.z])).toEqual([
			[4, 4],
			[0, 4],
			[0, 0],
			[4, 0]
		]);
	});

	it('removes a building’s railings with its foundation but keeps terrain fences', () => {
		const { manager } = createManager();
		manager.add(
			barrier(
				'rail',
				'classic-interior',
				[
					[1, 0, 1],
					[4, 0, 1]
				],
				{ foundationId: 'f1' }
			)
		);
		manager.add(
			barrier('fence', 'garden-fence', [
				[0, 0, 0],
				[5, 0, 0]
			])
		);
		manager.removeForFoundation('f1');
		expect(manager.getAll().map((d) => d.id)).toEqual(['fence']);
	});

	it('restyles in place, keeping the path', () => {
		const { manager } = createManager();
		manager.add(
			barrier('a', 'simple-interior', [
				[0, 0, 0],
				[4, 0, 0]
			])
		);
		const style = cloneBarrierStyle(getBarrierPreset('deck-railing').style);
		expect(manager.restyle('a', style, 'railing')).toBe(true);
		expect(manager.get('a')!.style.presetId).toBe('deck-railing');
		expect(manager.get('a')!.points).toHaveLength(2);
	});

	it('picks the segment under the ray', () => {
		const { manager } = createManager();
		manager.add(
			barrier('a', 'simple-interior', [
				[0, 0, 0],
				[4, 0, 0],
				[4, 0, 4]
			])
		);
		manager.group.updateMatrixWorld(true);
		// Aim at the top rail (0.9–0.95 m) from outside the fence.
		const ray = new THREE.Raycaster(new THREE.Vector3(8, 0.92, 2), new THREE.Vector3(-1, 0, 0));
		const hit = manager.pick(ray);
		expect(hit?.barrierId).toBe('a');
		expect(hit?.segmentIndex).toBe(1);
		expect(hit?.distance).toBeCloseTo(8 - 4 - 0.03, 1);
		const along = new THREE.Raycaster(new THREE.Vector3(2, 0.92, -3), new THREE.Vector3(0, 0, 1));
		expect(manager.pick(along)?.segmentIndex).toBe(0);
		const miss = new THREE.Raycaster(new THREE.Vector3(2, 3, -3), new THREE.Vector3(0, 0, 1));
		expect(manager.pick(miss)).toBeNull();
	});

	it('still picks after the GPU upload has released CPU copies', () => {
		const { manager } = createManager();
		manager.add(
			barrier('a', 'classic-interior', [
				[0, 0, 0],
				[4, 0, 0]
			])
		);
		manager.group.updateMatrixWorld(true);
		// Simulate three.js uploading every attribute once.
		manager.group.traverse((c) => {
			if (!(c instanceof THREE.Mesh)) return;
			const g = c.geometry as THREE.BufferGeometry;
			for (const attribute of Object.values(g.attributes))
				(attribute as THREE.BufferAttribute).onUploadCallback();
			g.index?.onUploadCallback();
		});
		const ray = new THREE.Raycaster(new THREE.Vector3(2, 0.97, -3), new THREE.Vector3(0, 0, 1));
		expect(() => manager.pick(ray)).not.toThrow();
		expect(manager.pick(ray)?.barrierId).toBe('a');
		// Only the picking mesh keeps arrays; colours and wood coords are gone everywhere.
		let kept = 0;
		manager.group.traverse((c) => {
			if (!(c instanceof THREE.Mesh)) return;
			const g = c.geometry as THREE.BufferGeometry;
			expect(g.attributes.color.array).toBeNull();
			expect(g.attributes.woodCoord.array).toBeNull();
			if (g.attributes.position.array) kept++;
		});
		expect(kept).toBe(1);
	});

	it('releases nothing a later raycast needs (direct check)', () => {
		const g = new THREE.BoxGeometry(1, 1, 1);
		releaseAfterUpload(g, true);
		for (const attribute of Object.values(g.attributes))
			(attribute as THREE.BufferAttribute).onUploadCallback();
		g.index?.onUploadCallback();
		const mesh = new THREE.Mesh(g);
		mesh.updateMatrixWorld(true);
		const hits: THREE.Intersection[] = [];
		mesh.raycast(
			new THREE.Raycaster(new THREE.Vector3(0, 0, -5), new THREE.Vector3(0, 0, 1)),
			hits
		);
		expect(hits.length).toBeGreaterThan(0);
	});

	it('keeps geometry finite and wood coordinates on every vertex', () => {
		const { manager } = createManager();
		for (const preset of [
			'classic-interior',
			'deck-railing',
			'country-fence',
			'garden-fence'
		] as const) {
			manager.add(
				barrier(preset, preset, [
					[0, 0, 0],
					[5, 0, 0],
					[7, 0, 3]
				])
			);
		}
		manager.group.traverse((c) => {
			if (!(c instanceof THREE.Mesh)) return;
			const g = c.geometry as THREE.BufferGeometry;
			expect(g.attributes.woodCoord.count).toBe(g.attributes.position.count);
			expect(Array.from(g.attributes.position.array).every(Number.isFinite)).toBe(true);
			expect(Array.from(g.attributes.normal.array).every(Number.isFinite)).toBe(true);
		});
	});
});

describe('barrier persistence', () => {
	it('migrates a schema 8 world to an empty barrier list', () => {
		const result = migrateWorld({ schemaVersion: 8, foundations: [] });
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.barriers).toEqual([]);
	});

	it('rejects malformed barriers', () => {
		const good = barrier('a', 'garden-fence', [
			[0, 0, 0],
			[3, 0, 0]
		]);
		expect(validateBarriers([good], new Set())).toBeNull();
		expect(validateBarriers([{ ...good, foundationId: 'missing' }], new Set())).toMatch(
			/unknown foundation/
		);
		expect(validateBarriers([{ ...good, points: [{ x: 0, y: 0, z: 0 }] }], new Set())).toMatch(
			/points/
		);
		expect(validateBarriers([good, good], new Set())).toMatch(/Duplicate/);
		expect(
			validateBarriers([{ ...good, style: { ...good.style, wood: 'gold' } }], new Set())
		).toMatch(/wood/);
	});
});
