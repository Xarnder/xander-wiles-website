import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingMaterialManager } from '../../building/BuildingMaterialManager';
import { chunkIdForPosition } from '../miniBuildGrid';
import { MiniBuildSystem } from '../MiniBuildSystem';
import { validateMiniBuildWorldState } from '../MiniBuildValidation';
import type { MiniBuildDraft } from '../MiniBuildTypes';
import { sixteenBlockDefinition, testDefinition, type TestBox } from './miniBuildFixtures';

function draftFrom(boxes: TestBox[], name = 'Chair', slots?: number): MiniBuildDraft {
	const definition = testDefinition(boxes, { slots });
	return { name, blocks: definition.blocks, materials: definition.materials };
}

const CHAIR: TestBox[] = [
	[0, 0, 0, 1, 3, 1],
	[3, 0, 0, 1, 3, 1],
	[0, 0, 3, 1, 3, 1],
	[3, 0, 3, 1, 3, 1],
	[0, 3, 0, 4, 1, 4, 1],
	[0, 4, 0, 4, 4, 1, 1]
];

function createSystem(): MiniBuildSystem {
	const system = new MiniBuildSystem({ materialManager: new BuildingMaterialManager() });
	system.update(0, 0);
	return system;
}

function mustCreate(system: MiniBuildSystem, draft: MiniBuildDraft) {
	const result = system.createDesign(draft);
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

function mustPlace(
	system: MiniBuildSystem,
	designId: string,
	x: number,
	z: number,
	rotationY: 0 | 90 | 180 | 270 = 0
) {
	const result = system.placeInstance(designId, { x, y: 0, z }, rotationY);
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

function countMeshes(system: MiniBuildSystem): { meshes: number; instanced: number } {
	let meshes = 0;
	let instanced = 0;
	system.group.traverse((object) => {
		if (object instanceof THREE.InstancedMesh) instanced++;
		else if (object instanceof THREE.Mesh) meshes++;
	});
	return { meshes, instanced };
}

describe('MiniBuildSystem — design vs instance', () => {
	it('ten copies reference one design, compile once and render as one instanced batch per material', () => {
		const system = createSystem();
		const chair = mustCreate(system, draftFrom(CHAIR, 'Chair', 2));
		const compilesBefore = system.cache.compileCount;
		for (let i = 0; i < 10; i++) mustPlace(system, chair.id, 1 + i, 1);
		expect(system.library.size).toBe(1);
		expect(system.instances.count).toBe(10);
		expect(system.instances.getAll().every((instance) => instance.designId === chair.id)).toBe(
			true
		);
		expect(system.cache.compileCount).toBe(compilesBefore);
		const batches = system.instances.getBatches();
		expect(batches).toHaveLength(1);
		expect(batches[0].count).toBe(10);
		// Two material slots → two instanced meshes. Never 10 × 6 cuboid meshes.
		expect(countMeshes(system)).toEqual({ meshes: 0, instanced: 2 });
	});

	it('100 repeated 16-block chairs in one chunk stay a single batch', () => {
		const system = createSystem();
		const chair = system.importDefinition(sixteenBlockDefinition('bulk'));
		if (!chair.ok) throw new Error(chair.error);
		// 100 × 16 = 1600 units → spread over four chunks so budgets allow it.
		let placed = 0;
		for (const [ox, oz] of [
			[0, 0],
			[16, 0],
			[0, 16],
			[16, 16]
		]) {
			for (let i = 0; i < 25; i++) {
				mustPlace(system, chair.value.id, ox + 1 + (i % 5) * 3, oz + 1 + Math.floor(i / 5) * 3);
				placed++;
			}
		}
		expect(placed).toBe(100);
		expect(system.cache.compileCount).toBe(1);
		expect(system.instances.getBatches()).toHaveLength(4);
		expect(countMeshes(system).instanced).toBe(8);
	});

	it('removing one placed copy does not delete its design', () => {
		const system = createSystem();
		const chair = mustCreate(system, draftFrom(CHAIR));
		const a = mustPlace(system, chair.id, 2, 2);
		mustPlace(system, chair.id, 4, 2);
		expect(system.budget.getPrimitiveUsage('0:0')).toBe(12);
		expect(system.removeInstance(a.id)).toBe(true);
		expect(system.library.has(chair.id)).toBe(true);
		expect(system.instances.count).toBe(1);
		expect(system.budget.getPrimitiveUsage('0:0')).toBe(6);
		expect(system.instances.getBatches()[0].asset.disposed).toBe(false);
	});

	it('deleting a design with placed copies requires explicit handling and leaves no broken references', () => {
		const system = createSystem();
		const chair = mustCreate(system, draftFrom(CHAIR));
		mustPlace(system, chair.id, 2, 2);
		mustPlace(system, chair.id, 5, 2);
		const refused = system.deleteDesign(chair.id);
		expect(refused.ok).toBe(false);
		expect(!refused.ok && refused.code).toBe('in-use');
		expect(system.library.has(chair.id)).toBe(true);
		const deleted = system.deleteDesign(chair.id, { deleteInstances: true });
		expect(deleted.ok && deleted.value.removedInstances).toBe(2);
		expect(system.instances.count).toBe(0);
		expect(system.budget.getPrimitiveUsage('0:0')).toBe(0);
		expect(validateMiniBuildWorldState(system.serialize()).ok).toBe(true);
	});
});

describe('MiniBuildSystem — shared edits and Make Unique', () => {
	it('editing a shared design updates every copy with one compile and preserves transforms and ids', () => {
		const system = createSystem();
		const chair = mustCreate(system, draftFrom(CHAIR));
		const placed = [
			mustPlace(system, chair.id, 1, 1, 0),
			mustPlace(system, chair.id, 5, 3, 90),
			mustPlace(system, chair.id, 9, 7, 270)
		];
		const before = structuredClone(system.instances.getAll());
		const compiles = system.cache.compileCount;
		const saved = system.saveDesign(chair.id, draftFrom([...CHAIR, [0, 8, 0, 4, 1, 1]]));
		expect(saved.ok && saved.value.revision).toBe(2);
		expect(system.cache.compileCount).toBe(compiles + 1);
		const after = system.instances.getAll();
		expect(after.map((i) => [i.id, i.position, i.rotationY, i.designId])).toEqual(
			before.map((i) => [i.id, i.position, i.rotationY, i.designId])
		);
		const batches = system.instances.getBatches();
		expect(batches).toHaveLength(1);
		expect(batches[0].asset.designRevision).toBe(2);
		expect(batches[0].count).toBe(placed.length);
		expect(system.budget.getPrimitiveUsage('0:0')).toBe(21);
	});

	it('rejects a shared edit that would exceed a chunk budget, changing nothing', () => {
		const system = createSystem();
		const small = mustCreate(system, draftFrom(CHAIR));
		for (let i = 0; i < 64; i++)
			mustPlace(system, small.id, 0.5 + (i % 8) * 2, 0.5 + Math.floor(i / 8) * 2);
		expect(system.budget.getPrimitiveUsage('0:0')).toBe(384);
		const bigger = draftFrom(Array.from({ length: 16 }, (_, i) => [i, 0, 0, 1, 1, 1] as TestBox));
		const result = system.saveDesign(small.id, bigger);
		expect(result.ok).toBe(false);
		expect(system.library.get(small.id)?.revision).toBe(1);
		expect(system.budget.getPrimitiveUsage('0:0')).toBe(384);
	});

	it('Make Unique changes only the chosen copy', () => {
		const system = createSystem();
		const chair = mustCreate(system, draftFrom(CHAIR));
		const a = mustPlace(system, chair.id, 2, 2);
		const b = mustPlace(system, chair.id, 6, 2);
		const unique = system.makeUnique(b.id);
		if (!unique.ok) throw new Error(unique.error);
		expect(system.instances.get(b.id)?.designId).toBe(unique.value.id);
		expect(system.instances.get(a.id)?.designId).toBe(chair.id);
		system.saveDesign(unique.value.id, draftFrom([[0, 0, 0, 6, 2, 6]], 'Low Chair'));
		expect(system.library.get(chair.id)?.revision).toBe(1);
		expect(system.library.get(chair.id)?.blocks).toHaveLength(6);
		expect(system.library.get(unique.value.id)?.blocks).toHaveLength(1);
		const batches = system.instances.getBatches();
		expect(batches).toHaveLength(2);
		expect(system.budget.getPrimitiveUsage('0:0')).toBe(7);
	});

	it('Save As creates a new design and existing copies keep the original', () => {
		const system = createSystem();
		const chair = mustCreate(system, draftFrom(CHAIR));
		const a = mustPlace(system, chair.id, 2, 2);
		const saveAs = system.createDesign(draftFrom([[0, 0, 0, 2, 2, 2]], 'Chair'));
		expect(saveAs.ok && saveAs.value.id).not.toBe(chair.id);
		expect(saveAs.ok && saveAs.value.name).toBe('Chair 2');
		expect(system.instances.get(a.id)?.designId).toBe(chair.id);
	});

	it('imports a default design once and reuses it while it still matches', () => {
		const system = createSystem();
		const first = system.ensureInWorld({ type: 'default-design', defaultId: 'default-chair' });
		const second = system.ensureInWorld({ type: 'default-design', defaultId: 'default-chair' });
		expect(first.ok && second.ok && first.value.id === second.value.id).toBe(true);
		expect(system.library.size).toBe(1);
	});
});

describe('MiniBuildInstanceManager — picking, budgets, streaming', () => {
	it('resolves instanced raycast hits (index 17) to the right logical instance, through swap-removal', () => {
		const system = createSystem();
		const block = mustCreate(system, draftFrom([[0, 0, 0, 4, 4, 4]], 'Crate'));
		const placed = Array.from({ length: 24 }, (_, i) =>
			mustPlace(system, block.id, 1 + (i % 6) * 2, 1 + Math.floor(i / 6) * 2)
		);
		system.group.updateMatrixWorld(true);
		const raycaster = new THREE.Raycaster();
		const probe = (target: { x: number; z: number }) => {
			raycaster.set(new THREE.Vector3(target.x, 10, target.z), new THREE.Vector3(0, -1, 0));
			raycaster.far = 50;
			return system.instances.raycast(raycaster);
		};
		const batch = system.instances.getBatches()[0];
		expect(batch.idAt(17)).toBe(placed[17].id);
		expect(probe(placed[17].position)?.id).toBe(placed[17].id);
		system.removeInstance(placed[3].id);
		system.removeInstance(placed[0].id);
		for (const instance of placed.slice(4)) {
			expect(probe(instance.position)?.id).toBe(instance.id);
		}
		expect(probe(placed[3].position)).toBeNull();
	});

	it('moves ownership between chunks and validates the destination', () => {
		const system = createSystem();
		const chair = mustCreate(system, draftFrom(CHAIR));
		const mover = mustPlace(system, chair.id, 15, 5);
		expect(system.budget.getPrimitiveUsage('0:0')).toBe(6);
		const moved = system.moveInstance(mover.id, { x: 17, y: 0, z: 5 }, 90);
		expect(moved.ok).toBe(true);
		expect(system.budget.getPrimitiveUsage('0:0')).toBe(0);
		expect(system.budget.getPrimitiveUsage('1:0')).toBe(6);
		expect(system.instances.getChunkOf(mover.id)).toBe(chunkIdForPosition(17, 5));
	});

	it('refuses placement past 512 units with the player-facing message', () => {
		const system = createSystem();
		const sixteen = system.importDefinition(sixteenBlockDefinition('dense'));
		if (!sixteen.ok) throw new Error(sixteen.error);
		for (let i = 0; i < 32; i++)
			mustPlace(system, sixteen.value.id, 0.5 + (i % 8), 0.5 + Math.floor(i / 8));
		expect(system.budget.getPrimitiveUsage('0:0')).toBe(512);
		const refused = system.placeInstance(sixteen.value.id, { x: 8, y: 0, z: 8 }, 0);
		expect(refused.ok).toBe(false);
		expect(!refused.ok && refused.error).toContain('detail limit');
	});

	it('streams distant chunks out and releases their batches', () => {
		const system = createSystem();
		const chair = mustCreate(system, draftFrom(CHAIR));
		mustPlace(system, chair.id, 2, 2);
		const far = mustPlace(system, chair.id, 2000, 2000);
		expect(system.instances.getBatches()).toHaveLength(1);
		expect(system.instances.isChunkActive(chunkIdForPosition(2000, 2000))).toBe(false);
		system.update(2000, 2000);
		system.instances.flushStreaming();
		expect(system.instances.getBatches()).toHaveLength(1);
		expect(system.instances.getBatches()[0].has(far.id)).toBe(true);
		expect(system.instances.isChunkActive('0:0')).toBe(false);
		expect(system.cache.refCount(system.library.get(chair.id)!)).toBe(1);
	});

	it('provides player collision only near the player, from simplified boxes', () => {
		const system = createSystem();
		const chair = mustCreate(system, draftFrom(CHAIR));
		mustPlace(system, chair.id, 2, 2);
		mustPlace(system, chair.id, 500, 500);
		const rects = system.instances.getNearbyCollisionRects();
		// Legs are decorative; seat + back remain (merged or not, ≤ 2 boxes), and nothing from 500m away.
		expect(rects.length).toBeGreaterThan(0);
		expect(rects.length).toBeLessThanOrEqual(2);
		expect(rects.every((rect) => Math.abs(rect.centerX - 2) < 1)).toBe(true);
	});
});

describe('MiniBuildSystem — persistence and lifecycle', () => {
	it('round-trips designs and copies without duplicating definitions', () => {
		const system = createSystem();
		const chair = mustCreate(system, draftFrom(CHAIR));
		const table = mustCreate(
			system,
			draftFrom(
				[
					[0, 5, 0, 12, 1, 7],
					[1, 0, 1, 1, 5, 1]
				],
				'Table'
			)
		);
		for (let i = 0; i < 4; i++) mustPlace(system, chair.id, 1 + i * 2, 1, (i * 90) as 0);
		mustPlace(system, table.id, 20, 20);
		system.saveDesign(
			table.id,
			draftFrom(
				[
					[0, 5, 0, 12, 1, 7],
					[1, 0, 1, 1, 5, 1],
					[10, 0, 1, 1, 5, 1]
				],
				'Table'
			)
		);
		const saved = JSON.parse(JSON.stringify(system.serialize()));
		const validated = validateMiniBuildWorldState(saved);
		if (!validated.ok) throw new Error(validated.error);

		const reloaded = createSystem();
		reloaded.load(validated.value);
		expect(reloaded.library.size).toBe(2);
		expect(reloaded.instances.count).toBe(5);
		expect(reloaded.library.get(table.id)?.revision).toBe(2);
		expect(reloaded.serialize().instances).toEqual(system.serialize().instances);
		for (const chunkId of ['0:0', '1:1']) {
			expect(reloaded.budget.getPrimitiveUsage(chunkId)).toBe(
				system.budget.getPrimitiveUsage(chunkId)
			);
		}
	});

	it('loads an over-budget world without instantiating the excess, and keeps it in the save', () => {
		const definition = sixteenBlockDefinition('heavy');
		const instances = Array.from({ length: 40 }, (_, i) => ({
			id: `i${i}`,
			designId: 'heavy',
			position: { x: 1 + (i % 10), y: 0, z: 1 + Math.floor(i / 10) },
			rotationY: 0 as const
		}));
		const system = createSystem();
		const warnings = system.load({ definitions: [definition], instances });
		expect(system.instances.count).toBe(32);
		expect(warnings).toHaveLength(1);
		expect(system.serialize().instances).toHaveLength(40);
		expect(system.budget.getPrimitiveUsage('0:0')).toBe(512);
	});

	it('does not leak geometry, batches or cache entries across create/place/edit/remove/delete cycles', () => {
		const system = createSystem();
		for (let cycle = 0; cycle < 60; cycle++) {
			const design = mustCreate(
				system,
				draftFrom([[0, 0, 0, 1 + (cycle % 4), 2, 2]], `Cycle ${cycle}`)
			);
			const a = mustPlace(system, design.id, 3, 3);
			mustPlace(system, design.id, 5, 3);
			system.saveDesign(design.id, draftFrom([[0, 0, 0, 2, 2 + (cycle % 3), 2]], `Cycle ${cycle}`));
			system.removeInstance(a.id);
			const deleted = system.deleteDesign(design.id, { deleteInstances: true });
			expect(deleted.ok).toBe(true);
		}
		expect(system.instances.getBatches()).toHaveLength(0);
		expect(countMeshes(system)).toEqual({ meshes: 0, instanced: 0 });
		expect(system.cache.getStats().entries).toBeLessThanOrEqual(48);
		expect(system.cache.getStats().referenced).toBe(0);
		expect(system.library.size).toBe(0);
	});
});

describe('MiniBuildBenchmark', () => {
	it('places 100 repeated 16-block chairs with one compile, spread across budget-respecting chunks', async () => {
		const { placeMiniBuildBenchmark, clearMiniBuildBenchmark } =
			await import('../MiniBuildBenchmark');
		const system = createSystem();
		const result = placeMiniBuildBenchmark(system, 'repeated', 100, {
			originX: 0,
			originZ: 0,
			surfaceY: () => 0
		});
		expect(result.placed).toBe(100);
		expect(result.compiles).toBe(1);
		expect(result.designsCreated).toBe(1);
		for (const chunkId of system.budget.getChunkIds()) {
			expect(system.budget.getPrimitiveUsage(chunkId)).toBeLessThanOrEqual(512);
		}
		// One batch per occupied chunk (single design, no overrides).
		expect(system.instances.getBatches().length).toBe(result.chunksUsed);
		expect(clearMiniBuildBenchmark(system)).toBe(100);
		expect(system.instances.count).toBe(0);
	});

	it('places 100 unique designs as 100 compiles but never one mesh per cuboid', async () => {
		const { placeMiniBuildBenchmark } = await import('../MiniBuildBenchmark');
		const system = createSystem();
		const result = placeMiniBuildBenchmark(system, 'unique', 100, {
			originX: 0,
			originZ: 0,
			surfaceY: () => 0
		});
		expect(result.placed).toBe(100);
		expect(result.designsCreated).toBe(100);
		expect(result.compiles).toBe(100);
		const meshes = countMeshes(system);
		expect(meshes.meshes).toBe(0);
		expect(meshes.instanced).toBeLessThanOrEqual(100 * 3);
	});

	it('stresses instance counts with 1–4 block props and respects the per-chunk instance ceiling', async () => {
		const { placeMiniBuildBenchmark } = await import('../MiniBuildBenchmark');
		const system = createSystem();
		const result = placeMiniBuildBenchmark(system, 'simple', 1000, {
			originX: 0,
			originZ: 0,
			surfaceY: () => 0
		});
		expect(result.placed).toBe(1000);
		for (const chunkId of system.budget.getChunkIds()) {
			expect(system.budget.getInstanceCount(chunkId)).toBeLessThanOrEqual(256);
		}
		expect(result.compiles).toBe(4);
	});
});

describe('MiniBuildSystem.getChunkReadout', () => {
	it('reports usage, pending cost and level for the chunk under a point', () => {
		const system = createSystem();
		const heavy = system.importDefinition(sixteenBlockDefinition('readout'));
		if (!heavy.ok) throw new Error(heavy.error);
		expect(system.getChunkReadout(3, 3)).toMatchObject({
			chunkId: '0:0',
			primitives: 0,
			budget: 512,
			added: 0,
			level: 'ok'
		});
		for (let i = 0; i < 27; i++)
			mustPlace(system, heavy.value.id, 0.5 + (i % 9), 0.5 + Math.floor(i / 9));
		expect(system.getChunkReadout(3, 3, 16)).toMatchObject({
			primitives: 432,
			added: 16,
			level: 'near'
		});
		for (let i = 0; i < 5; i++) mustPlace(system, heavy.value.id, 0.5 + i, 8);
		expect(system.getChunkReadout(3, 3)).toMatchObject({ primitives: 512, level: 'near' });
		expect(system.getChunkReadout(3, 3, 16).level).toBe('full');
		expect(system.getChunkReadout(-3, 3, 16)).toMatchObject({
			chunkId: '-1:0',
			primitives: 0,
			level: 'ok'
		});
	});

	it('adds nothing when a held object moves within its own chunk', () => {
		const system = createSystem();
		const chair = mustCreate(system, draftFrom(CHAIR));
		const placed = mustPlace(system, chair.id, 2, 2);
		expect(system.getChunkReadout(10, 10, 6, placed.id)).toMatchObject({ primitives: 6, added: 0 });
		expect(system.getChunkReadout(20, 2, 6, placed.id)).toMatchObject({ primitives: 0, added: 6 });
	});
});
