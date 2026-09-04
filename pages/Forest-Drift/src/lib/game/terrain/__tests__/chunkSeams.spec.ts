import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TerrainChunk } from '../TerrainChunk';
import { TerrainHeightSampler } from '../TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../TerrainSettings';
import { worldToChunkCoord } from '../chunkKey';

interface Edge {
	positions: number[];
	normals: number[];
}

/** Reads one edge column/row (by vertex index along the fixed axis) out of a populated chunk. */
function readEdge(
	chunk: TerrainChunk,
	resolution: number,
	fixedAxis: 'x' | 'z',
	fixedIndex: number
): Edge {
	const positions: number[] = [];
	const normals: number[] = [];
	const geometry: THREE.BufferGeometry = chunk.mesh.geometry;
	const positionAttr = geometry.getAttribute('position');
	const normalAttr = geometry.getAttribute('normal');
	const verticesPerSide = resolution + 1;

	for (let i = 0; i < verticesPerSide; i++) {
		const xi = fixedAxis === 'x' ? fixedIndex : i;
		const zi = fixedAxis === 'z' ? fixedIndex : i;
		const vertexIndex = zi * verticesPerSide + xi;
		positions.push(
			positionAttr.getX(vertexIndex),
			positionAttr.getY(vertexIndex),
			positionAttr.getZ(vertexIndex)
		);
		normals.push(
			normalAttr.getX(vertexIndex),
			normalAttr.getY(vertexIndex),
			normalAttr.getZ(vertexIndex)
		);
	}

	return { positions, normals };
}

describe('seamless chunk boundaries', () => {
	const settings = createDefaultTerrainSettings();
	const resolution = settings.chunkResolution;
	const sampler = new TerrainHeightSampler(settings);

	it('chunk (0,0) right edge matches chunk (1,0) left edge exactly', () => {
		const chunkA = new TerrainChunk(resolution);
		const chunkB = new TerrainChunk(resolution);
		chunkA.populate(0, 0, settings.chunkSize, sampler, 1);
		chunkB.populate(1, 0, settings.chunkSize, sampler, 1);

		const rightEdgeOfA = readEdge(chunkA, resolution, 'x', resolution);
		const leftEdgeOfB = readEdge(chunkB, resolution, 'x', 0);

		expect(rightEdgeOfA.positions).toEqual(leftEdgeOfB.positions);
		expect(rightEdgeOfA.normals).toEqual(leftEdgeOfB.normals);
	});

	it('chunk (0,0) top edge matches chunk (0,1) bottom edge exactly', () => {
		const chunkA = new TerrainChunk(resolution);
		const chunkB = new TerrainChunk(resolution);
		chunkA.populate(0, 0, settings.chunkSize, sampler, 1);
		chunkB.populate(0, 1, settings.chunkSize, sampler, 1);

		const farEdgeOfA = readEdge(chunkA, resolution, 'z', resolution);
		const nearEdgeOfB = readEdge(chunkB, resolution, 'z', 0);

		expect(farEdgeOfA.positions).toEqual(nearEdgeOfB.positions);
		expect(farEdgeOfA.normals).toEqual(nearEdgeOfB.normals);
	});

	it('holds across the world-zero boundary too: chunk (-1,0) right edge matches chunk (0,0) left edge', () => {
		const chunkA = new TerrainChunk(resolution);
		const chunkB = new TerrainChunk(resolution);
		chunkA.populate(-1, 0, settings.chunkSize, sampler, 1);
		chunkB.populate(0, 0, settings.chunkSize, sampler, 1);

		const rightEdgeOfA = readEdge(chunkA, resolution, 'x', resolution);
		const leftEdgeOfB = readEdge(chunkB, resolution, 'x', 0);

		expect(rightEdgeOfA.positions).toEqual(leftEdgeOfB.positions);
		expect(rightEdgeOfA.normals).toEqual(leftEdgeOfB.normals);
	});

	it('holds for the diagonal neighbour across zero: chunk (-1,-1) matches (0,-1) and (-1,0) along shared edges', () => {
		const corner = new TerrainChunk(resolution);
		const east = new TerrainChunk(resolution);
		const north = new TerrainChunk(resolution);
		corner.populate(-1, -1, settings.chunkSize, sampler, 1);
		east.populate(0, -1, settings.chunkSize, sampler, 1);
		north.populate(-1, 0, settings.chunkSize, sampler, 1);

		expect(readEdge(corner, resolution, 'x', resolution).positions).toEqual(
			readEdge(east, resolution, 'x', 0).positions
		);
		expect(readEdge(corner, resolution, 'z', resolution).positions).toEqual(
			readEdge(north, resolution, 'z', 0).positions
		);
	});
});

describe('worldToChunkCoord negative-coordinate correctness', () => {
	it('floors toward negative infinity across the zero boundary', () => {
		const chunkSize = 96;
		expect(worldToChunkCoord(0, chunkSize)).toBe(0);
		expect(worldToChunkCoord(95.999, chunkSize)).toBe(0);
		expect(worldToChunkCoord(96, chunkSize)).toBe(1);
		expect(worldToChunkCoord(-0.001, chunkSize)).toBe(-1);
		expect(worldToChunkCoord(-96, chunkSize)).toBe(-1);
		expect(worldToChunkCoord(-96.001, chunkSize)).toBe(-2);
	});
});
