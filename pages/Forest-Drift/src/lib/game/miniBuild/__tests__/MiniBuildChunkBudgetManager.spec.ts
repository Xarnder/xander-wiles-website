import { describe, expect, it } from 'vitest';
import { MiniBuildAssetCache } from '../MiniBuildAssetCache';
import { MiniBuildChunkBudgetManager } from '../MiniBuildChunkBudgetManager';
import { chunkIdForPosition } from '../miniBuildGrid';
import { MiniBuildLibrary } from '../MiniBuildLibrary';
import { sixteenBlockDefinition, testDefinition } from './miniBuildFixtures';

describe('MiniBuildChunkBudgetManager', () => {
	it('allows 511 + 1 and rejects 512 + 1', () => {
		const budget = new MiniBuildChunkBudgetManager({ maxInstancesPerChunk: 10_000 });
		for (let i = 0; i < 511; i++) expect(budget.addInstance(`a${i}`, '0:0', 1)).toBe(true);
		expect(budget.getPrimitiveUsage('0:0')).toBe(511);
		expect(budget.canAdd('0:0', 1)).toBe(true);
		expect(budget.addInstance('last', '0:0', 1)).toBe(true);
		expect(budget.getPrimitiveUsage('0:0')).toBe(512);
		expect(budget.canAdd('0:0', 1)).toBe(false);
		expect(budget.addInstance('over', '0:0', 1)).toBe(false);
		expect(budget.check('0:0', 1).reason).toBe('primitives');
	});

	it('charges source block counts (1, 4, 8, 16) regardless of rendering', () => {
		const budget = new MiniBuildChunkBudgetManager();
		budget.addInstance('one', 'c', 1);
		budget.addInstance('four', 'c', 4);
		budget.addInstance('eight', 'c', 8);
		budget.addInstance('sixteen', 'c', 16);
		expect(budget.getPrimitiveUsage('c')).toBe(29);
		for (let i = 0; i < 20; i++) budget.addInstance(`chair${i}`, 'd', 16);
		expect(budget.getPrimitiveUsage('d')).toBe(320);
		expect(budget.getRemainingPrimitiveBudget('d')).toBe(192);
	});

	it('reclaims budget on removal', () => {
		const budget = new MiniBuildChunkBudgetManager();
		budget.addInstance('x', 'c', 16);
		budget.addInstance('y', 'c', 16);
		expect(budget.removeInstance('x')).toBe(true);
		expect(budget.getPrimitiveUsage('c')).toBe(16);
		expect(budget.removeInstance('x')).toBe(false);
	});

	it('transfers budget on moves and validates the destination first', () => {
		const budget = new MiniBuildChunkBudgetManager();
		budget.addInstance('mover', 'a', 16);
		for (let i = 0; i < 31; i++) budget.addInstance(`full${i}`, 'b', 16);
		budget.addInstance('filler', 'b', 15);
		expect(budget.getPrimitiveUsage('b')).toBe(511);
		expect(budget.moveInstance('mover', 'b')).toBe(false);
		expect(budget.getPrimitiveUsage('a')).toBe(16);
		expect(budget.moveInstance('mover', 'c')).toBe(true);
		expect(budget.getPrimitiveUsage('a')).toBe(0);
		expect(budget.getPrimitiveUsage('c')).toBe(16);
		expect(budget.getChunkOf('mover')).toBe('c');
	});

	it('uses origin-based ownership — an object straddling a boundary costs only its anchor chunk', () => {
		const budget = new MiniBuildChunkBudgetManager();
		const anchorChunk = chunkIdForPosition(15.9, 3);
		budget.addInstance('wide-bed', anchorChunk, 10);
		expect(budget.getPrimitiveUsage('0:0')).toBe(10);
		expect(budget.getPrimitiveUsage('1:0')).toBe(0);
	});

	it('enforces the instance safety ceiling separately', () => {
		const budget = new MiniBuildChunkBudgetManager({ maxInstancesPerChunk: 3 });
		budget.addInstance('a', 'c', 1);
		budget.addInstance('b', 'c', 1);
		budget.addInstance('c', 'c', 1);
		expect(budget.check('c', 1)).toMatchObject({ ok: false, reason: 'instances' });
	});

	it('detects chunks a shared design edit would push over budget', () => {
		const budget = new MiniBuildChunkBudgetManager();
		for (let i = 0; i < 40; i++) budget.addInstance(`chair${i}`, 'c', 8);
		budget.addInstance('elsewhere', 'd', 8);
		const ids = [...Array.from({ length: 40 }, (_, i) => `chair${i}`), 'elsewhere'];
		expect(budget.chunksExceededByCostChange(ids, 16)).toEqual(['c']);
		expect(budget.chunksExceededByCostChange(ids, 12)).toEqual([]);
	});
});

describe('MiniBuildAssetCache', () => {
	it('returns the same asset for the same design and revision and compiles once', () => {
		const cache = new MiniBuildAssetCache();
		const definition = sixteenBlockDefinition();
		const a = cache.acquire(definition);
		const b = cache.acquire(definition);
		expect(a).toBe(b);
		expect(cache.compileCount).toBe(1);
		expect(cache.refCount(definition)).toBe(2);
		expect(a.geometries.length).toBe(2);
	});

	it('compiles exactly once more on a revision change and keeps the old asset alive while referenced', () => {
		const cache = new MiniBuildAssetCache({ maxUnreferenced: 0 });
		const v1 = testDefinition([[0, 0, 0, 2, 2, 2]], { revision: 1 });
		const old = cache.acquire(v1);
		const v2 = { ...testDefinition([[0, 0, 0, 4, 2, 2]], { revision: 2 }) };
		const next = cache.acquire(v2);
		expect(cache.compileCount).toBe(2);
		expect(next).not.toBe(old);
		expect(old.disposed).toBe(false);
		cache.release(old);
		expect(old.disposed).toBe(true);
		expect(next.disposed).toBe(false);
	});

	it('does not grow without bound across create/remove cycles', () => {
		const cache = new MiniBuildAssetCache({ maxUnreferenced: 4 });
		for (let i = 0; i < 100; i++) {
			const definition = testDefinition([[0, 0, 0, 1 + (i % 5), 1, 1]], {
				id: `d${i}`,
				revision: 1
			});
			const asset = cache.acquire(definition);
			cache.release(asset);
		}
		expect(cache.getStats().entries).toBeLessThanOrEqual(4);
	});

	it('getData shares the compile with acquire', () => {
		const cache = new MiniBuildAssetCache();
		const definition = sixteenBlockDefinition();
		cache.getData(definition);
		cache.acquire(definition);
		expect(cache.compileCount).toBe(1);
	});
});

describe('MiniBuildLibrary', () => {
	const draft = {
		name: 'Chair',
		blocks: testDefinition([[0, 0, 0, 2, 2, 2]]).blocks,
		materials: testDefinition([[0, 0, 0, 1, 1, 1]]).materials
	};

	it('Save bumps the revision in place; Save As creates a new id', () => {
		const library = new MiniBuildLibrary();
		const created = library.create(draft);
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const saved = library.update(created.value.id, {
			...draft,
			blocks: testDefinition([[0, 0, 0, 3, 2, 2]]).blocks
		});
		expect(saved.ok && saved.value.id).toBe(created.value.id);
		expect(saved.ok && saved.value.revision).toBe(2);
		const saveAs = library.create(draft);
		expect(saveAs.ok && saveAs.value.id).not.toBe(created.value.id);
		expect(saveAs.ok && saveAs.value.name).toBe('Chair 2');
		expect(library.size).toBe(2);
	});

	it('duplicates as "<Name> Copy" and renames without changing the revision', () => {
		const library = new MiniBuildLibrary();
		const created = library.create(draft);
		if (!created.ok) throw new Error(created.error);
		const copy = library.duplicate(created.value.id);
		expect(copy.ok && copy.value.name).toBe('Chair Copy');
		const renamed = library.rename(created.value.id, 'Dining Chair');
		expect(renamed.ok && renamed.value.revision).toBe(1);
		expect(library.get(created.value.id)?.name).toBe('Dining Chair');
	});

	it('grounds floating drafts on save', () => {
		const library = new MiniBuildLibrary();
		const created = library.create({
			...draft,
			blocks: testDefinition([[0, 6, 0, 2, 2, 2]]).blocks
		});
		expect(created.ok && created.value.blocks[0].positionGrid.y).toBe(0);
	});
});
