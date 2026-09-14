/**
 * The starter library. Every design here is an ordinary MiniBuildDefinition built under the exact
 * player rules — ≤16 cuboids, 0.0625m grid, ≤4 materials, ≤4m bounds — and is validated by the same
 * code as a player's build (see MiniBuildValidation.spec.ts). There is no private geometry: if a stock
 * object can't be made from cuboids, the answer is a better cuboid design, not a special mesh.
 *
 * Boxes are authored in 0.125m units (the original, coarser grid — furniture rarely needs finer)
 * and scaled to 0.0625m grid units when built, min corner first. +Z is the front of the object.
 */
import { colorMaterialFromHex } from '../building/MaterialTypes';
import { computeBounds, groundBlocks } from './miniBuildGrid';
import {
	MINI_BUILD_SCHEMA_VERSION,
	MINI_BUILD_V1_GRID_SCALE,
	type MiniBuildBlock,
	type MiniBuildDefinition,
	type MiniBuildFinish,
	type MiniBuildMaterialSlot,
	type MiniBuildSemanticType
} from './MiniBuildTypes';

/** In 0.125m units — multiplied by AUTHORED_SCALE to become grid units. */
type Box = [x: number, y: number, z: number, sx: number, sy: number, sz: number, slot: number];

const AUTHORED_SCALE = MINI_BUILD_V1_GRID_SCALE;

const EPOCH = '2026-01-01T00:00:00.000Z';

function slot(name: string, finish: MiniBuildFinish, color: string): MiniBuildMaterialSlot {
	return { name, finish, material: colorMaterialFromHex(color) };
}

const WOOD = slot('Wood', 'wood', '#8B5A2B');
const DARK_WOOD = slot('Dark Wood', 'wood', '#5C3A22');
const PALE_WOOD = slot('Pale Wood', 'wood', '#C19A6B');
const FABRIC = slot('Fabric', 'fabric', '#7A9A6A');
const CREAM = slot('Cream', 'fabric', '#F1E7D0');
const STONE = slot('Stone', 'stone', '#8A8578');
const WORKTOP = slot('Worktop', 'stone', '#B8AFA4');
const METAL = slot('Metal', 'metal', '#4A4A4C');
const BRASS = slot('Brass', 'metal', '#C5A046');
const EMBER = slot('Ember', 'plain', '#D97C33');
const SOOT = slot('Soot', 'stone', '#2B1B14');
const BOOK_RED = slot('Book Red', 'fabric', '#8B1E2D');
const BOOK_BLUE = slot('Book Blue', 'fabric', '#1F3A5F');
const CABINET = slot('Cabinet', 'wood', '#E8D5B5');

function design(
	defaultId: string,
	name: string,
	semanticType: MiniBuildSemanticType,
	materials: MiniBuildMaterialSlot[],
	boxes: Box[]
): MiniBuildDefinition {
	const blocks: MiniBuildBlock[] = groundBlocks(
		boxes.map(([x, y, z, sx, sy, sz, materialSlot], index) => ({
			id: `b${index + 1}`,
			positionGrid: { x: x * AUTHORED_SCALE, y: y * AUTHORED_SCALE, z: z * AUTHORED_SCALE },
			sizeGrid: { x: sx * AUTHORED_SCALE, y: sy * AUTHORED_SCALE, z: sz * AUTHORED_SCALE },
			rotation: { x: 0, y: 0, z: 0 },
			materialSlot
		}))
	);
	return {
		schemaVersion: MINI_BUILD_SCHEMA_VERSION,
		id: `default-${defaultId}`,
		name,
		revision: 1,
		blocks,
		materials: materials.map((entry) => ({ ...entry, material: { ...entry.material } })),
		bounds: computeBounds(blocks),
		anchor: { type: 'bottom-center' },
		semanticType,
		createdAt: EPOCH,
		updatedAt: EPOCH
	};
}

export const DEFAULT_MINI_BUILDS: readonly MiniBuildDefinition[] = [
	design(
		'chair',
		'Chair',
		'chair',
		[WOOD, DARK_WOOD],
		[
			[0, 0, 0, 1, 3, 1, 0],
			[3, 0, 0, 1, 3, 1, 0],
			[0, 0, 3, 1, 3, 1, 0],
			[3, 0, 3, 1, 3, 1, 0],
			[0, 3, 0, 4, 1, 4, 0],
			[0, 4, 0, 1, 4, 1, 1],
			[3, 4, 0, 1, 4, 1, 1],
			[0, 6, 0, 4, 2, 1, 1]
		]
	),
	design(
		'arm-chair',
		'Arm Chair',
		'chair',
		[DARK_WOOD, FABRIC, CREAM],
		[
			[0, 0, 0, 1, 1, 1, 0],
			[6, 0, 0, 1, 1, 1, 0],
			[0, 0, 5, 1, 1, 1, 0],
			[6, 0, 5, 1, 1, 1, 0],
			[0, 1, 0, 7, 2, 6, 1],
			[1, 3, 1, 5, 1, 5, 2],
			[0, 3, 0, 1, 3, 6, 1],
			[6, 3, 0, 1, 3, 6, 1],
			[0, 3, 0, 7, 5, 1, 1],
			[1, 4, 1, 5, 3, 1, 2]
		]
	),
	design(
		'stool',
		'Stool',
		'chair',
		[WOOD, DARK_WOOD],
		[
			[0, 0, 0, 1, 5, 1, 0],
			[3, 0, 0, 1, 5, 1, 0],
			[0, 0, 3, 1, 5, 1, 0],
			[3, 0, 3, 1, 5, 1, 0],
			[1, 1, 0, 2, 1, 1, 0],
			[1, 1, 3, 2, 1, 1, 0],
			[0, 5, 0, 4, 1, 4, 1]
		]
	),
	design(
		'bench',
		'Bench',
		'chair',
		[WOOD, DARK_WOOD],
		[
			[1, 0, 0, 1, 3, 3, 1],
			[10, 0, 0, 1, 3, 3, 1],
			[2, 1, 1, 8, 1, 1, 1],
			[0, 3, 0, 12, 1, 3, 0]
		]
	),
	design(
		'table',
		'Table',
		'table',
		[WOOD, DARK_WOOD],
		[
			[1, 0, 1, 1, 5, 1, 1],
			[10, 0, 1, 1, 5, 1, 1],
			[1, 0, 5, 1, 5, 1, 1],
			[10, 0, 5, 1, 5, 1, 1],
			[1, 4, 1, 10, 1, 5, 1],
			[0, 5, 0, 12, 1, 7, 0]
		]
	),
	design(
		'bedside-table',
		'Bedside Table',
		'table',
		[WOOD, DARK_WOOD, BRASS],
		[
			[0, 0, 0, 4, 4, 3, 0],
			[0, 4, 0, 4, 1, 4, 1],
			[0, 2, 3, 4, 1, 1, 1],
			[1, 2, 4, 2, 1, 1, 2]
		]
	),
	design(
		'bed',
		'Bed',
		'bed',
		[WOOD, CREAM, FABRIC],
		[
			[0, 0, 0, 1, 1, 1, 0],
			[11, 0, 0, 1, 1, 1, 0],
			[0, 0, 15, 1, 1, 1, 0],
			[11, 0, 15, 1, 1, 1, 0],
			[0, 1, 0, 12, 2, 16, 0],
			[0, 0, 0, 12, 7, 1, 0],
			[0, 0, 15, 12, 4, 1, 0],
			[1, 3, 1, 10, 2, 14, 1],
			[2, 5, 1, 8, 1, 3, 1],
			[1, 5, 6, 10, 1, 9, 2]
		]
	),
	design(
		'wardrobe',
		'Wardrobe',
		'storage',
		[WOOD, DARK_WOOD, BRASS],
		[
			[1, 0, 0, 9, 16, 5, 1],
			[0, 16, 0, 11, 1, 6, 1],
			[2, 1, 5, 3, 14, 1, 0],
			[6, 1, 5, 3, 14, 1, 0],
			[4, 8, 6, 1, 2, 1, 2],
			[6, 8, 6, 1, 2, 1, 2]
		]
	),
	design(
		'workbench',
		'Workbench',
		'workbench',
		[PALE_WOOD, DARK_WOOD, METAL],
		[
			[0, 5, 0, 14, 2, 6, 0],
			[1, 0, 1, 1, 5, 1, 1],
			[12, 0, 1, 1, 5, 1, 1],
			[1, 0, 4, 1, 5, 1, 1],
			[12, 0, 4, 1, 5, 1, 1],
			[1, 1, 1, 12, 1, 4, 1],
			[0, 7, 0, 14, 4, 1, 1],
			[1, 7, 4, 2, 1, 2, 2],
			[6, 7, 1, 3, 1, 1, 2]
		]
	),
	design(
		'kitchen-counter',
		'Kitchen Counter',
		'storage',
		[CABINET, WORKTOP, DARK_WOOD, METAL],
		[
			[0, 0, 0, 8, 1, 4, 2],
			[0, 1, 0, 8, 5, 5, 0],
			[0, 6, 0, 8, 1, 6, 1],
			[1, 1, 5, 6, 2, 1, 0],
			[1, 4, 5, 6, 1, 1, 0],
			[3, 2, 6, 2, 1, 1, 3]
		]
	),
	design(
		'kitchen-sink',
		'Sink Counter',
		'storage',
		[CABINET, WORKTOP, METAL, DARK_WOOD],
		[
			[0, 0, 0, 8, 1, 4, 3],
			[2, 5, 2, 4, 1, 3, 2],
			[0, 1, 0, 8, 5, 5, 0],
			[0, 6, 5, 8, 1, 1, 1],
			[0, 6, 0, 8, 1, 2, 1],
			[0, 6, 2, 2, 1, 3, 1],
			[6, 6, 2, 2, 1, 3, 1],
			[1, 1, 5, 6, 4, 1, 0],
			[3, 3, 6, 2, 1, 1, 2],
			[4, 7, 0, 1, 2, 1, 2],
			[4, 8, 1, 1, 1, 2, 2]
		]
	),
	design(
		'stove',
		'Stove',
		'stove',
		[STONE, METAL, SOOT, EMBER],
		[
			[0, 0, 0, 7, 8, 6, 0],
			[0, 8, 0, 7, 1, 6, 1],
			[5, 9, 0, 2, 10, 2, 0],
			[1, 1, 6, 5, 3, 1, 2],
			[2, 1, 7, 3, 1, 1, 3],
			[1, 9, 2, 2, 1, 2, 1],
			[1, 9, 4, 2, 1, 2, 1],
			[1, 5, 6, 5, 1, 1, 1]
		]
	),
	design(
		'chest',
		'Chest',
		'storage',
		[WOOD, DARK_WOOD, METAL, BRASS],
		[
			[0, 0, 0, 6, 3, 4, 0],
			[0, 3, 0, 6, 1, 4, 1],
			[1, 0, 4, 1, 4, 1, 2],
			[4, 0, 4, 1, 4, 1, 2],
			[2, 2, 4, 2, 1, 1, 3]
		]
	),
	design(
		'barrel',
		'Barrel',
		'storage',
		[METAL, WOOD, DARK_WOOD],
		[
			[1, 1, 0, 4, 1, 6, 0],
			[0, 1, 1, 6, 1, 4, 0],
			[1, 5, 0, 4, 1, 6, 0],
			[0, 5, 1, 6, 1, 4, 0],
			[1, 0, 0, 4, 7, 6, 1],
			[0, 0, 1, 6, 7, 4, 1],
			[1, 7, 1, 4, 1, 4, 2]
		]
	),
	design(
		'shelf',
		'Shelf',
		'storage',
		[WOOD],
		[
			[0, 0, 0, 1, 10, 3, 0],
			[7, 0, 0, 1, 10, 3, 0],
			[1, 0, 0, 6, 1, 3, 0],
			[1, 3, 0, 6, 1, 3, 0],
			[1, 6, 0, 6, 1, 3, 0],
			[0, 9, 0, 8, 1, 3, 0]
		]
	),
	design(
		'bookcase',
		'Bookcase',
		'storage',
		[WOOD, DARK_WOOD, BOOK_RED, BOOK_BLUE],
		[
			[0, 0, 0, 1, 15, 3, 0],
			[7, 0, 0, 1, 15, 3, 0],
			[1, 0, 0, 6, 15, 1, 1],
			[0, 15, 0, 8, 1, 3, 0],
			[1, 0, 1, 6, 1, 2, 0],
			[1, 4, 1, 6, 1, 2, 0],
			[1, 8, 1, 6, 1, 2, 0],
			[1, 12, 1, 6, 1, 2, 0],
			[1, 1, 1, 4, 3, 2, 2],
			[5, 1, 1, 2, 2, 2, 3],
			[2, 5, 1, 3, 3, 2, 3],
			[1, 9, 1, 5, 2, 2, 2]
		]
	)
];

const BY_ID = new Map(DEFAULT_MINI_BUILDS.map((definition) => [definition.id, definition]));

export function getDefaultMiniBuild(id: string): MiniBuildDefinition | undefined {
	return BY_ID.get(id);
}

export const STARTER_MINI_BUILD_ID = 'default-chair';
