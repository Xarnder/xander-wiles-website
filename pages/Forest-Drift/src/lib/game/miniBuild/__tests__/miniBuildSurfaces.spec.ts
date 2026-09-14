import { describe, expect, it } from 'vitest';
import { blockBox } from '../miniBuildGrid';
import {
	raisePlaneLayer,
	sharesCoplanarSurface,
	surfaceOffsetLevels,
	surfaceRanks,
	surfaceWins
} from '../miniBuildSurfaces';
import type { MiniBuildMaterialSlot } from '../MiniBuildTypes';
import { testBlocks, testSlots } from './miniBuildFixtures';

function slots(...finishes: MiniBuildMaterialSlot['finish'][]): MiniBuildMaterialSlot[] {
	return testSlots(finishes.length).map((slot, i) => ({ ...slot, finish: finishes[i] }));
}

describe('miniBuildSurfaces', () => {
	it('detects same-facing faces in one plane with overlapping area, and nothing else', () => {
		const [top, cloth, beside, touching, crossing, edge] = testBlocks([
			[0, 0, 0, 16, 2, 16],
			[2, 2, 2, 12, 0, 12],
			[16, 0, 0, 8, 2, 8], // same top and bottom planes, but only touches along an edge
			[0, 2, 0, 16, 4, 16], // sits on the table: opposite-facing faces, culled by back-face culling
			[8, 0, 0, 0, 8, 8], // a vertical plane crossing the table top
			[16, 2, 0, 8, 0, 8] // a plane at the right height but outside the footprint
		]).map(blockBox);
		expect(sharesCoplanarSurface(top, cloth)).toBe(true);
		expect(sharesCoplanarSurface(top, beside)).toBe(false);
		expect(sharesCoplanarSurface(top, touching)).toBe(false);
		expect(sharesCoplanarSurface(top, crossing)).toBe(false);
		expect(sharesCoplanarSurface(cloth, edge)).toBe(false);
		// Two cuboids with overlapping footprints and the same top height do share a surface.
		const [a, b] = testBlocks([
			[0, 0, 0, 8, 4, 8],
			[4, 2, 4, 8, 2, 8]
		]).map(blockBox);
		expect(sharesCoplanarSurface(a, b)).toBe(true);
	});

	it('ranks opaque over glass, planes over cuboid faces, then plane layer, then block order', () => {
		const blocks = testBlocks([
			[0, 0, 0, 8, 8, 8, 0],
			[0, 8, 0, 8, 0, 8, 0],
			[0, 8, 0, 8, 0, 8, 0],
			[0, 8, 0, 8, 0, 8, 1]
		]);
		blocks[1].layer = 1;
		const ranks = surfaceRanks(blocks, slots('wood', 'glass'));
		expect(surfaceWins(ranks[1], ranks[0])).toBe(true); // plane over cuboid
		expect(surfaceWins(ranks[1], ranks[2])).toBe(true); // higher layer
		expect(surfaceWins(ranks[2], ranks[1])).toBe(false);
		expect(surfaceWins(ranks[0], ranks[3])).toBe(true); // opaque cuboid over a glass plane
		ranks[1].layer = 0;
		expect(surfaceWins(ranks[1], ranks[2])).toBe(true); // tie → earlier block
	});

	it('gives the editor small offset levels only where surfaces actually coincide', () => {
		const blocks = testBlocks([
			[0, 0, 0, 16, 2, 16],
			[2, 2, 2, 12, 0, 12],
			[4, 2, 4, 4, 0, 4],
			[40, 0, 0, 4, 4, 4]
		]);
		// Both planes beat the table top; of the two planes the earlier one is on top.
		expect(surfaceOffsetLevels(blocks, slots('wood'))).toEqual([0, 2, 1, 0]);
		blocks[2].layer = 1; // the small plane was selected last: it now goes on top
		expect(surfaceOffsetLevels(blocks, slots('wood'))).toEqual([0, 1, 2, 0]);
	});

	it('raises a selected plane above the planes it overlaps and compacts layers', () => {
		const blocks = testBlocks([
			[0, 0, 0, 16, 2, 16],
			[2, 2, 2, 12, 0, 12],
			[4, 2, 4, 4, 0, 4],
			[40, 2, 0, 4, 0, 4]
		]);
		// Block 1 already beats block 2 (earlier index); selecting it changes nothing.
		expect(raisePlaneLayer(blocks, blocks[1].id)).toBeNull();
		// Cuboids and planes with no rival are never touched.
		expect(raisePlaneLayer(blocks, blocks[0].id)).toBeNull();
		expect(raisePlaneLayer(blocks, blocks[3].id)).toBeNull();

		const raised = raisePlaneLayer(blocks, blocks[2].id)!;
		expect(raised.map((block) => block.layer)).toEqual([undefined, undefined, 1, undefined]);
		expect(raisePlaneLayer(raised, raised[2].id)).toBeNull();
		const back = raisePlaneLayer(raised, raised[1].id)!;
		// Layers are compacted across every plane, so the unrelated plane keeps 0 and the order is 1 > 2.
		expect(back.map((block) => block.layer)).toEqual([undefined, 2, 1, undefined]);
		// The source array is never mutated.
		expect(blocks.every((block) => block.layer === undefined)).toBe(true);
	});
});
