import { colorMaterialFromHex } from '../../building/MaterialTypes';
import { computeBounds } from '../miniBuildGrid';
import {
	MINI_BUILD_SCHEMA_VERSION,
	type MiniBuildBlock,
	type MiniBuildDefinition,
	type MiniBuildMaterialSlot
} from '../MiniBuildTypes';

export type TestBox = [
	x: number,
	y: number,
	z: number,
	sx: number,
	sy: number,
	sz: number,
	slot?: number
];

export function testSlots(count = 1): MiniBuildMaterialSlot[] {
	const colors = ['#8B5A2B', '#E8DCC8', '#4A4A4C', '#A8D0E0'];
	return Array.from({ length: count }, (_, i) => ({
		name: `Slot ${i + 1}`,
		finish: 'wood' as const,
		material: colorMaterialFromHex(colors[i])
	}));
}

export function testBlocks(boxes: TestBox[]): MiniBuildBlock[] {
	return boxes.map(([x, y, z, sx, sy, sz, slot = 0], i) => ({
		id: `b${i}`,
		positionGrid: { x, y, z },
		sizeGrid: { x: sx, y: sy, z: sz },
		rotation: { x: 0, y: 0, z: 0 },
		materialSlot: slot
	}));
}

export function testDefinition(
	boxes: TestBox[],
	options: { id?: string; revision?: number; slots?: number; name?: string } = {}
): MiniBuildDefinition {
	const blocks = testBlocks(boxes);
	return {
		schemaVersion: MINI_BUILD_SCHEMA_VERSION,
		id: options.id ?? 'design-a',
		name: options.name ?? 'Test Design',
		revision: options.revision ?? 1,
		blocks,
		materials: testSlots(options.slots ?? Math.max(1, ...boxes.map((b) => (b[6] ?? 0) + 1))),
		bounds: computeBounds(blocks),
		anchor: { type: 'bottom-center' },
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z'
	};
}

/** A deterministic 16-block design with overlaps and two material slots. */
export function sixteenBlockDefinition(id = 'design-16'): MiniBuildDefinition {
	const boxes: TestBox[] = [];
	for (let i = 0; i < 16; i++) {
		boxes.push([
			(i % 4) * 3,
			Math.floor(i / 4) * 2,
			(i % 3) * 2,
			3 + (i % 2),
			2,
			2 + (i % 3),
			i % 2
		]);
	}
	return testDefinition(boxes, { id, slots: 2 });
}
