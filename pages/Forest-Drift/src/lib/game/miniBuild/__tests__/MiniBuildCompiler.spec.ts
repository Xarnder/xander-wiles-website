import { describe, expect, it } from 'vitest';
import { compileMiniBuildData, type CompiledMiniBuildData } from '../MiniBuildCompiler';
import { compileCollisionGridBoxes } from '../MiniBuildCollisionCompiler';
import { MINI_BUILD_COLLISION } from '../MiniBuildTypes';
import {
	sixteenBlockDefinition,
	testBlocks,
	testDefinition,
	type TestBox
} from './miniBuildFixtures';

function totalQuads(data: CompiledMiniBuildData): number {
	return data.groups.reduce((sum, group) => sum + group.indices.length / 6, 0);
}

/** Summed area (m²) of a slot's quads whose normal is `normal` on `axis`, and how many quads that is. */
function facing(
	data: CompiledMiniBuildData,
	slot: number,
	axis: 0 | 1 | 2,
	normal: 1 | -1
): { area: number; quads: number } {
	const group = data.groups.find((g) => g.materialSlot === slot);
	if (!group) return { area: 0, quads: 0 };
	const [ta, tb] = ([0, 1, 2] as const).filter((t) => t !== axis);
	let area = 0;
	let quads = 0;
	for (let t = 0; t < group.indices.length; t += 6) {
		const i0 = group.indices[t];
		if (group.normals[i0 * 3 + axis] !== normal) continue;
		const at = [0, 1, 2, 5].map((o) => group.positions[group.indices[t + o] * 3 + ta]);
		const bt = [0, 1, 2, 5].map((o) => group.positions[group.indices[t + o] * 3 + tb]);
		area += (Math.max(...at) - Math.min(...at)) * (Math.max(...bt) - Math.min(...bt));
		quads++;
	}
	return { area, quads };
}

function assertWellFormed(data: CompiledMiniBuildData): void {
	for (const group of data.groups) {
		const vertexCount = group.positions.length / 3;
		expect(group.normals.length).toBe(group.positions.length);
		expect(group.uvs.length / 2).toBe(vertexCount);
		for (const value of group.positions) expect(Number.isFinite(value)).toBe(true);
		for (const value of group.uvs) expect(Number.isFinite(value)).toBe(true);
		for (let i = 0; i < group.normals.length; i += 3) {
			const length = Math.hypot(group.normals[i], group.normals[i + 1], group.normals[i + 2]);
			expect(length).toBeCloseTo(1, 6);
		}
		for (const index of group.indices) {
			expect(index).toBeGreaterThanOrEqual(0);
			expect(index).toBeLessThan(vertexCount);
		}
		// Every triangle's geometric normal agrees with its vertex normal (outward winding).
		for (let t = 0; t < group.indices.length; t += 3) {
			const [a, b, c] = [group.indices[t], group.indices[t + 1], group.indices[t + 2]];
			const p = (i: number) => [
				group.positions[i * 3],
				group.positions[i * 3 + 1],
				group.positions[i * 3 + 2]
			];
			const [pa, pb, pc] = [p(a), p(b), p(c)];
			const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
			const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
			const cross = [
				u[1] * v[2] - u[2] * v[1],
				u[2] * v[0] - u[0] * v[2],
				u[0] * v[1] - u[1] * v[0]
			];
			const n = [group.normals[a * 3], group.normals[a * 3 + 1], group.normals[a * 3 + 2]];
			expect(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2]).toBeGreaterThan(0);
		}
	}
}

describe('MiniBuildCompiler', () => {
	it('compiles a single block into six quads with correct bounds around the bottom-centre anchor', () => {
		const data = compileMiniBuildData(testDefinition([[0, 0, 0, 4, 2, 6]]));
		expect(data.groups).toHaveLength(1);
		expect(totalQuads(data)).toBe(6);
		expect(data.stats.vertices).toBe(24);
		expect(data.stats.triangles).toBe(12);
		// 4 × 2 × 6 grid units = 0.25m × 0.125m × 0.375m.
		expect(data.bounds.min).toEqual({ x: -0.125, y: 0, z: -0.1875 });
		expect(data.bounds.max).toEqual({ x: 0.125, y: 0.125, z: 0.1875 });
		assertWellFormed(data);
	});

	it('removes the touching internal faces of two adjacent blocks and merges coplanar surfaces', () => {
		const data = compileMiniBuildData(
			testDefinition([
				[0, 0, 0, 2, 2, 2],
				[2, 0, 0, 2, 2, 2]
			])
		);
		// A 4×2×2 box made from two blocks: the shared faces vanish, and each remaining face of the
		// same block is one rectangle — 10 quads (5 per block), not 12.
		expect(totalQuads(data)).toBe(10);
		assertWellFormed(data);
	});

	it('does not emit faces buried inside another block', () => {
		const data = compileMiniBuildData(
			testDefinition([
				[0, 0, 0, 8, 8, 8],
				[2, 2, 2, 2, 2, 2]
			])
		);
		expect(totalQuads(data)).toBe(6);
		expect(data.stats.hiddenCells).toBeGreaterThan(0);
	});

	it('assigns coplanar overlapping faces to one block only (no z-fighting)', () => {
		// Same top plane, overlapping footprints, different materials.
		const data = compileMiniBuildData(
			testDefinition([
				[0, 0, 0, 4, 2, 4, 0],
				[2, 0, 0, 4, 2, 4, 1]
			])
		);
		let topArea = 0;
		for (const group of data.groups) {
			for (let t = 0; t < group.indices.length; t += 6) {
				const i0 = group.indices[t];
				if (group.normals[i0 * 3 + 1] !== 1) continue;
				const xs: number[] = [];
				const zs: number[] = [];
				for (const offset of [0, 1, 2, 5]) {
					const vi = group.indices[t + offset];
					xs.push(group.positions[vi * 3]);
					zs.push(group.positions[vi * 3 + 2]);
				}
				topArea += (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
			}
		}
		// Union footprint is 6 × 4 grid units = 0.375m × 0.25m.
		expect(topArea).toBeCloseTo(0.09375, 6);
		assertWellFormed(data);
	});

	it('groups geometry by material slot — one group per used slot, never per block', () => {
		const data = compileMiniBuildData(sixteenBlockDefinition());
		expect(data.groups.map((group) => group.materialSlot)).toEqual([0, 1]);
		expect(data.primitiveCost).toBe(16);
		assertWellFormed(data);
	});

	it('is deterministic', () => {
		const a = compileMiniBuildData(sixteenBlockDefinition());
		const b = compileMiniBuildData(sixteenBlockDefinition());
		expect(a.contentHash).toBe(b.contentHash);
		expect(a.groups.length).toBe(b.groups.length);
		for (let i = 0; i < a.groups.length; i++) {
			expect(Array.from(a.groups[i].positions)).toEqual(Array.from(b.groups[i].positions));
			expect(Array.from(a.groups[i].indices)).toEqual(Array.from(b.groups[i].indices));
		}
	});

	it('uses world-scaled UVs so a long block does not stretch its texture', () => {
		const data = compileMiniBuildData(testDefinition([[0, 0, 0, 32, 1, 1]]));
		const uvs = Array.from(data.groups[0].uvs);
		expect(Math.max(...uvs) - Math.min(...uvs)).toBeCloseTo(2, 6);
	});

	it('handles rotated blocks by their effective box', () => {
		const definition = testDefinition([[0, 0, 0, 8, 1, 2]]);
		definition.blocks[0].rotation = { x: 0, y: 90, z: 0 };
		const data = compileMiniBuildData(definition);
		expect(data.bounds.max.x - data.bounds.min.x).toBeCloseTo(0.125, 6);
		expect(data.bounds.max.z - data.bounds.min.z).toBeCloseTo(0.5, 6);
		assertWellFormed(data);
	});

	it('compiles a zero-thickness block as a two-sided plane: 2 quads, 4 triangles, not a cuboid', () => {
		for (const [axis, box] of [
			['x', [0, 0, 0, 0, 8, 6]],
			['y', [0, 4, 0, 8, 0, 6]],
			['z', [0, 0, 0, 8, 6, 0]]
		] as const) {
			const data = compileMiniBuildData(testDefinition([[...box]]));
			expect(totalQuads(data), axis).toBe(2);
			expect(data.stats.triangles).toBe(4);
			expect(data.stats.vertices).toBe(8);
			const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
			const normals = data.groups[0].normals;
			// Both quads lie in one plane and face opposite ways.
			expect(normals[index]).toBe(-normals[4 * 3 + index]);
			expect(Math.abs(normals[index])).toBe(1);
			const positions = data.groups[0].positions;
			const planeCoords = new Set<number>();
			for (let i = index; i < positions.length; i += 3) planeCoords.add(positions[i]);
			expect(planeCoords.size).toBe(1);
			assertWellFormed(data);
		}
	});

	it('flattens the bounds of a plane-only design on its flat axis', () => {
		const data = compileMiniBuildData(testDefinition([[0, 0, 0, 16, 0, 8]]));
		expect(data.bounds.max.y - data.bounds.min.y).toBe(0);
		expect(data.bounds.max.x - data.bounds.min.x).toBeCloseTo(1, 6);
	});

	it('keeps a plane lying on a cuboid face visible instead of z-fighting it', () => {
		// A 1m table top with a tablecloth plane on its top surface, different materials.
		const data = compileMiniBuildData(
			testDefinition([
				[0, 0, 0, 16, 2, 16, 0],
				[2, 2, 2, 12, 0, 12, 1]
			])
		);
		const upward = (slot: number) => {
			const group = data.groups.find((g) => g.materialSlot === slot)!;
			let area = 0;
			for (let t = 0; t < group.indices.length; t += 6) {
				const i0 = group.indices[t];
				if (group.normals[i0 * 3 + 1] !== 1) continue;
				const xs = [0, 1, 2, 5].map((o) => group.positions[group.indices[t + o] * 3]);
				const zs = [0, 1, 2, 5].map((o) => group.positions[group.indices[t + o] * 3 + 2]);
				area += (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
			}
			return area;
		};
		// The cloth owns its 0.75m square; the table top keeps only the 1m² ring around it.
		expect(upward(1)).toBeCloseTo(0.5625, 6);
		expect(upward(0)).toBeCloseTo(1 - 0.5625, 6);
		// The cloth's underside is hidden by the table (it lies on the table's top surface).
		const cloth = data.groups.find((g) => g.materialSlot === 1)!;
		expect(cloth.indices.length / 6).toBe(1);
		assertWellFormed(data);
	});

	it('draws the plane selected last where two planes overlap, on both sides, with no duplicates', () => {
		const boxes: TestBox[] = [
			[0, 0, 0, 16, 0, 16, 0],
			[4, 0, 4, 16, 0, 16, 1]
		];
		const earlierWins = compileMiniBuildData(testDefinition(boxes));
		// 12 × 12 overlap = 0.5625m² per side goes to block 0 (same layer → earlier block).
		expect(facing(earlierWins, 0, 1, 1).area).toBeCloseTo(1, 6);
		expect(facing(earlierWins, 1, 1, 1).area).toBeCloseTo(1 - 0.5625, 6);

		const definition = testDefinition(boxes);
		definition.blocks[1].layer = 1;
		const layered = compileMiniBuildData(definition);
		for (const normal of [1, -1] as const) {
			expect(facing(layered, 1, 1, normal).area).toBeCloseTo(1, 6);
			expect(facing(layered, 0, 1, normal).area).toBeCloseTo(1 - 0.5625, 6);
			// Every cell of the union is drawn exactly once per side.
			expect(facing(layered, 0, 1, normal).area + facing(layered, 1, 1, normal).area).toBeCloseTo(
				2 - 0.5625,
				6
			);
		}
		expect(layered.contentHash).not.toBe(earlierWins.contentHash);
		assertWellFormed(layered);
	});

	it('merges faces across cells hidden under solid blocks, so legs do not cut a rug into pieces', () => {
		const data = compileMiniBuildData(
			testDefinition([
				[0, 0, 0, 32, 0, 32, 0],
				[2, 0, 2, 2, 10, 2, 1],
				[28, 0, 2, 2, 10, 2, 1],
				[2, 0, 28, 2, 10, 2, 1],
				[28, 0, 28, 2, 10, 2, 1]
			])
		);
		// Rug: one quad on top (running under the legs), one underneath.
		expect(facing(data, 0, 1, 1).quads).toBe(1);
		expect(facing(data, 0, 1, -1).quads).toBe(1);
		expect(data.groups.find((g) => g.materialSlot === 0)!.indices.length / 3).toBe(4);
		// Legs lose their bottoms to the rug (the plane owns that surface) and keep the other 5 faces.
		expect(facing(data, 1, 1, -1).quads).toBe(0);
		expect(totalQuads(data)).toBe(2 + 4 * 5);

		// A block resting on a table top leaves the top as a single quad too.
		const stacked = compileMiniBuildData(
			testDefinition([
				[0, 0, 0, 16, 2, 16, 0],
				[4, 2, 4, 8, 8, 8, 1]
			])
		);
		expect(facing(stacked, 0, 1, 1).quads).toBe(1);
		assertWellFormed(stacked);
	});

	it('never lets glass hide a surface, and never draws glass over an opaque surface in the same place', () => {
		const definition = testDefinition(
			[
				[0, 0, 0, 16, 2, 16, 0],
				[4, 2, 4, 8, 8, 8, 1],
				[0, 2, 0, 16, 0, 16, 1]
			],
			{ slots: 2 }
		);
		definition.materials[1] = { ...definition.materials[1], finish: 'glass' };
		const data = compileMiniBuildData(definition);
		// The wooden top stays whole under the glass box and the glass sheet: you can see it through them.
		expect(facing(data, 0, 1, 1).area).toBeCloseTo(1, 6);
		// The glass sheet lies exactly on the wood, which is drawn instead, so no glass faces up there;
		// its underside and the box's base are against the wood and never drawn.
		expect(facing(data, 1, 1, 1).area).toBeCloseTo(0.25, 6); // only the glass box's own top
		expect(facing(data, 1, 1, -1).area).toBeCloseTo(0, 6);
		// The glass box keeps its four sides.
		expect(facing(data, 1, 0, 1).quads + facing(data, 1, 0, -1).quads).toBe(2);
		expect(facing(data, 1, 2, 1).quads + facing(data, 1, 2, -1).quads).toBe(2);
		assertWellFormed(data);
	});

	it('culls a plane buried inside a cuboid and never lets a plane hide a cuboid face', () => {
		const buried = compileMiniBuildData(
			testDefinition([
				[0, 0, 0, 8, 8, 8, 0],
				[2, 4, 2, 4, 0, 4, 1]
			])
		);
		expect(buried.groups.map((g) => g.materialSlot)).toEqual([0]);
		expect(totalQuads(buried)).toBe(6);

		// A plane sliced through the middle of a block's footprint, sticking out: the block keeps all
		// six faces (planes have no volume, so they cover nothing).
		const through = compileMiniBuildData(
			testDefinition([
				[0, 0, 0, 4, 4, 4, 0],
				[-4, 2, -4, 12, 0, 12, 1]
			])
		);
		const cube = through.groups.find((g) => g.materialSlot === 0)!;
		expect(cube.indices.length / 6).toBe(6);
		assertWellFormed(through);
	});

	it('compiles a 16-block design well below a frame', () => {
		const definition = sixteenBlockDefinition();
		compileMiniBuildData(definition);
		const started = performance.now();
		for (let i = 0; i < 50; i++) compileMiniBuildData(definition);
		const averageMs = (performance.now() - started) / 50;
		expect(averageMs).toBeLessThan(4);
	});

	it('rejects definitions with more than 16 blocks at compile time', () => {
		const boxes = Array.from(
			{ length: 17 },
			(_, i) => [i, 0, 0, 1, 1, 1] as [number, number, number, number, number, number]
		);
		expect(() => compileMiniBuildData(testDefinition(boxes))).toThrow();
	});
});

describe('MiniBuildCollisionCompiler', () => {
	it('merges four stacked cabinet blocks into one collision box', () => {
		const boxes = compileCollisionGridBoxes(
			testBlocks([
				[0, 0, 0, 8, 4, 8],
				[0, 4, 0, 8, 4, 8],
				[0, 8, 0, 8, 4, 8],
				[0, 12, 0, 8, 4, 8]
			]),
			MINI_BUILD_COLLISION
		);
		expect(boxes).toEqual([{ min: { x: 0, y: 0, z: 0 }, max: { x: 8, y: 16, z: 8 } }]);
	});

	it('treats tiny auto blocks (legs, handles) as visual-only', () => {
		const boxes = compileCollisionGridBoxes(
			testBlocks([
				[0, 0, 0, 2, 6, 2],
				[6, 0, 0, 2, 6, 2],
				[0, 6, 0, 8, 2, 8],
				// A zero-volume plane (a tablecloth) is always visual-only.
				[0, 8, 0, 8, 0, 8]
			]),
			MINI_BUILD_COLLISION
		);
		expect(boxes).toEqual([{ min: { x: 0, y: 6, z: 0 }, max: { x: 8, y: 8, z: 8 } }]);
	});

	it('falls back to one bounds box when every block is decorative', () => {
		const boxes = compileCollisionGridBoxes(
			testBlocks([
				[0, 0, 0, 1, 1, 1],
				[3, 0, 0, 1, 1, 1]
			]),
			MINI_BUILD_COLLISION
		);
		expect(boxes).toEqual([{ min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 1, z: 1 } }]);
	});

	it('never exceeds the per-design collision box ceiling', () => {
		const blocks = testBlocks(
			Array.from(
				{ length: 16 },
				(_, i) =>
					[(i % 4) * 10, 0, Math.floor(i / 4) * 10, 6, 6, 6] as [
						number,
						number,
						number,
						number,
						number,
						number
					]
			)
		);
		const boxes = compileCollisionGridBoxes(blocks, MINI_BUILD_COLLISION);
		expect(boxes.length).toBeLessThanOrEqual(MINI_BUILD_COLLISION.maxBoxesPerBuild);
		// Every solid block is still covered.
		for (const block of blocks) {
			const covered = boxes.some(
				(box) =>
					box.min.x <= block.positionGrid.x &&
					box.max.x >= block.positionGrid.x + 6 &&
					box.min.z <= block.positionGrid.z &&
					box.max.z >= block.positionGrid.z + 6
			);
			expect(covered).toBe(true);
		}
	});

	it('gives a plane-only design no collision, and thickens planes forced solid', () => {
		expect(
			compileCollisionGridBoxes(testBlocks([[0, 0, 0, 16, 0, 16]]), MINI_BUILD_COLLISION)
		).toEqual([]);
		const wall = testBlocks([
			[0, 0, 4, 16, 16, 0],
			[0, 0, 0, 16, 0, 16]
		]);
		wall[0].collision = 'solid';
		wall[1].collision = 'solid';
		expect(compileCollisionGridBoxes(wall, MINI_BUILD_COLLISION)).toEqual([
			{ min: { x: 0, y: 0, z: 3.5 }, max: { x: 16, y: 16, z: 4.5 } },
			// A floor plane at the bottom is pushed up rather than sinking below the anchor.
			{ min: { x: 0, y: 0, z: 0 }, max: { x: 16, y: 1, z: 16 } }
		]);
	});

	it('respects explicit collision modes', () => {
		const blocks = testBlocks([
			[0, 0, 0, 1, 1, 1],
			[4, 0, 0, 4, 4, 4]
		]);
		blocks[0].collision = 'solid';
		blocks[1].collision = 'none';
		expect(compileCollisionGridBoxes(blocks, MINI_BUILD_COLLISION)).toEqual([
			{ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }
		]);
	});
});
