import { describe, expect, it } from 'vitest';
import { TreePrototypeCache } from '../TreePrototypeCache';
import { TREE_SPECIES_IDS } from '../TreeSpeciesTypes';

describe('shared prototype variants', () => {
	it('dense biome species share one prototype from LOD2 (bamboo from LOD1); every other species only at LOD3', () => {
		expect(TreePrototypeCache.sharedFromLod('bamboo')).toBe(1);
		for (const id of ['jungleGiant', 'darkBroadleaf'] as const) {
			expect(TreePrototypeCache.effectiveVariant(id, 2, 1)).toBe(2);
			expect(TreePrototypeCache.effectiveVariant(id, 2, 2)).toBe(0);
			expect(TreePrototypeCache.key(id, 1, 2)).toBe(TreePrototypeCache.key(id, 2, 2));
		}
		// Pre-biome species render exactly as before.
		for (const id of TREE_SPECIES_IDS.slice(0, 8)) {
			expect(TreePrototypeCache.sharedFromLod(id)).toBe(3);
			expect(TreePrototypeCache.effectiveVariant(id, 2, 2)).toBe(2);
			expect(TreePrototypeCache.effectiveVariant(id, 2, 3)).toBe(0);
		}
	});
});
