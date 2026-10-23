import { createInteraction } from './MiniBuildInteractions';
/**
 * The starter library. Every design here is an ordinary MiniBuildDefinition built under the exact
 * player rules — ≤16 cuboids, ≤4 cylinders, ≤2 spheres, 0.03125m grid, ≤4 materials, ≤4m bounds,
 * rotations in 7.5° steps — and is validated by the same code as a player's build (see
 * MiniBuildValidation.spec.ts). There is no private geometry: if a stock object can't be made from
 * these pieces, the answer is a better design, not a special mesh.
 *
 * Designs are authored in grid units (1 = 3.125 cm) at real furniture sizes: seats at 45–47 cm,
 * tables at 75 cm, 3–6 cm legs and rails, 3 cm boards. +Z is the front of the object. Every material
 * slot picks a procedural texture (stored only where it differs from its finish's Auto), so no stock
 * piece is ever drawn in flat colour.
 *
 * Tricks a player can use too: a surface split into several blocks shows several boards (each block
 * is its own piece of timber); a plane laid on a door draws its panel; octagonal cylinders make
 * turned legs, posts and hob plates; angled blocks rake chair backs and splay stool legs.
 */
import { colorMaterialFromHex } from '../building/MaterialTypes';
import { computeBounds, effectiveSize, groundBlocks } from './miniBuildGrid';
import { MINI_BUILD_AUTO_TEXTURE } from './miniBuildTextures';
import {
	MINI_BUILD_SCHEMA_VERSION,
	type MiniBuildBlock,
	type MiniBuildBlockRotation,
	type MiniBuildDefinition,
	type MiniBuildFinish,
	type MiniBuildInteractionType,
	type MiniBuildMaterialSlot,
	type MiniBuildSemanticType,
	type MiniBuildShape,
	type MiniBuildTextureId
} from './MiniBuildTypes';

type Vec = [x: number, y: number, z: number];

/** A block before ids are assigned. */
type Part = Omit<MiniBuildBlock, 'id'>;

const EPOCH = '2026-01-01T00:00:00.000Z';

const UPRIGHT: MiniBuildBlockRotation = { x: 0, y: 0, z: 0 };

function slot(
	name: string,
	finish: MiniBuildFinish,
	texture: Exclude<MiniBuildTextureId, 'auto' | 'flat'>,
	color: string
): MiniBuildMaterialSlot {
	return {
		name,
		finish,
		material: colorMaterialFromHex(color),
		// Stored only when it differs from what the finish picks anyway.
		...(MINI_BUILD_AUTO_TEXTURE[finish] === texture ? {} : { texture })
	};
}

function part(shape: MiniBuildShape, at: Vec, size: Vec, materialSlot: number): Part {
	return {
		...(shape === 'cuboid' ? {} : { shape }),
		positionGrid: { x: at[0], y: at[1], z: at[2] },
		sizeGrid: { x: size[0], y: size[1], z: size[2] },
		rotation: { ...UPRIGHT },
		materialSlot
	};
}

/** Axis-aligned cuboid from its min corner. One zero size makes a plane. */
function box(x: number, y: number, z: number, sx: number, sy: number, sz: number, s: number) {
	return part('cuboid', [x, y, z], [sx, sy, sz], s);
}

/** Upright cylinder (axis along Y) from the min corner of its bounding box. */
function cyl(x: number, y: number, z: number, sx: number, sy: number, sz: number, s: number) {
	return part('cylinder', [x, y, z], [sx, sy, sz], s);
}

/** Sphere or ellipsoid from the min corner of its bounding box. */
function ball(x: number, y: number, z: number, sx: number, sy: number, sz: number, s: number) {
	return part('sphere', [x, y, z], [sx, sy, sz], s);
}

/**
 * A cylinder lying along X or Z, given by the min corner and size of the box it fills (`size` is in
 * world axes, the long one being `axis`).
 */
function rod(axis: 'x' | 'z', at: Vec, size: Vec, s: number): Part {
	const [sx, sy, sz] = size;
	// The cylinder's own axis is local Y: a quarter turn about Z lays it along X, about X along Z.
	const local: Vec = axis === 'x' ? [sy, sx, sz] : [sx, sz, sy];
	return {
		...part('cylinder', at, local, s),
		rotation: axis === 'x' ? { x: 0, y: 0, z: 90 } : { x: 90, y: 0, z: 0 }
	};
}

/**
 * An angled block given by its centre (grid units, may be a half unit). Its stored position is the
 * min corner of its quarter-turn grid box, which must land on the grid — designs choose sizes and
 * centres so it does, and a mistake fails loudly when the module loads.
 */
function angled(
	shape: MiniBuildShape,
	centre: Vec,
	size: Vec,
	rotation: Vec,
	materialSlot: number
): Part {
	const rot = { x: rotation[0], y: rotation[1], z: rotation[2] };
	const effective = effectiveSize({
		sizeGrid: { x: size[0], y: size[1], z: size[2] },
		rotation: rot
	});
	const at: Vec = [
		centre[0] - effective.x / 2,
		centre[1] - effective.y / 2,
		centre[2] - effective.z / 2
	];
	if (!at.every(Number.isInteger)) {
		throw new Error(`Angled part centred at ${centre.join(', ')} is off the grid`);
	}
	return { ...part(shape, at, size, materialSlot), rotation: rot };
}

/** Interaction anchors in grid units: [type, x, y, z, yaw]. */
type Anchor = [type: MiniBuildInteractionType, x: number, y: number, z: number, rotationY: number];

function design(
	defaultId: string,
	name: string,
	semanticType: MiniBuildSemanticType,
	materials: MiniBuildMaterialSlot[],
	parts: Part[],
	anchors: Anchor[] = []
): MiniBuildDefinition {
	const blocks: MiniBuildBlock[] = groundBlocks(
		parts.map((entry, index) => ({ ...entry, id: `b${index + 1}` }))
	);
	return {
		schemaVersion: MINI_BUILD_SCHEMA_VERSION,
		id: `default-${defaultId}`,
		name,
		revision: 1,
		interactionLocations: anchors.map(([type, x, y, z, rotationY], index) => ({
			...createInteraction(type, { x, y, z }),
			id: `${defaultId}-interaction-${index + 1}`,
			rotationY
		})),
		blocks,
		materials: materials.map((entry) => ({ ...entry, material: { ...entry.material } })),
		bounds: computeBounds(blocks),
		anchor: { type: 'bottom-center' },
		semanticType,
		createdAt: EPOCH,
		updatedAt: EPOCH
	};
}

/** Back rake for chair backs: 7.5° (tops lean towards −Z, away from the sitter). */
const RAKE: Vec = [352.5, 0, 0];

const OAK = '#76502F';
const DARK_OAK = '#4A3324';
const PINE = '#C49A68';

export const DEFAULT_MINI_BUILDS: readonly MiniBuildDefinition[] = [
	// Ladder-back chair: turned legs and raked back posts with acorn finials, three graduated slats
	// and a woven rush seat on a rail frame.
	design(
		'chair',
		'Chair',
		'chair',
		[slot('Oak', 'wood', 'aged-oak', OAK), slot('Rush seat', 'fabric', 'woven-fabric', '#B59A5E')],
		[
			cyl(0, 0, 11, 2, 16, 2, 0),
			cyl(12, 0, 11, 2, 16, 2, 0),
			angled('cylinder', [1, 16, 1], [2, 32, 2], RAKE, 0),
			angled('cylinder', [13, 16, 1], [2, 32, 2], RAKE, 0),
			ball(-1, 31, -2, 3, 3, 3, 0),
			ball(12, 31, -2, 3, 3, 3, 0),
			box(2, 12, 11, 10, 2, 1, 0),
			box(2, 12, 1, 10, 2, 1, 0),
			box(1, 12, 2, 1, 2, 9, 0),
			box(12, 12, 2, 1, 2, 9, 0),
			box(1, 14, 1, 12, 1, 11, 1),
			box(1, 5, 2, 1, 1, 9, 0),
			box(12, 5, 2, 1, 1, 9, 0),
			box(2, 7, 11, 10, 1, 1, 0),
			box(2, 5, 2, 10, 1, 1, 0),
			angled('cuboid', [7, 19.5, 0.5], [10, 3, 1], RAKE, 0),
			angled('cuboid', [7, 23.5, 0], [10, 2, 1], RAKE, 0),
			angled('cuboid', [7, 27.5, -0.5], [10, 3, 1], RAKE, 0)
		],
		[['sit', 7, 15, 6, 180]]
	),
	// Club arm chair: short turned feet, scroll-capped arms, a reclined back with a loose cushion,
	// a deep seat cushion and a throw pillow.
	design(
		'arm-chair',
		'Arm Chair',
		'chair',
		[
			slot('Dark oak', 'wood', 'dark-oak', '#3E2A1C'),
			slot('Upholstery', 'fabric', 'woven-fabric', '#6F8A63'),
			slot('Cushions', 'fabric', 'woven-fabric', '#E9DFC8'),
			slot('Pillow', 'fabric', 'woven-fabric', '#B5653A')
		],
		[
			cyl(1, 0, 2, 2, 3, 2, 0),
			cyl(23, 0, 2, 2, 3, 2, 0),
			cyl(1, 0, 23, 2, 3, 2, 0),
			cyl(23, 0, 23, 2, 3, 2, 0),
			box(0, 3, 1, 26, 7, 25, 1),
			box(0, 3, 3, 4, 14, 23, 1),
			box(22, 3, 3, 4, 14, 23, 1),
			box(-1, 17, 3, 5, 3, 23, 1),
			box(22, 17, 3, 5, 3, 23, 1),
			angled('cuboid', [13, 17.5, 2.5], [26, 27, 5], RAKE, 1),
			angled('cuboid', [13, 20.5, 6.5], [18, 15, 3], RAKE, 2),
			box(4, 10, 7, 18, 4, 20, 2),
			angled('cuboid', [9, 17, 9.5], [8, 7, 2], [345, 22.5, 0], 3)
		],
		[['sit', 13, 14, 16, 180]]
	),
	// Three-legged stool: a round seat on splayed, turned legs joined by staggered rungs.
	design(
		'stool',
		'Stool',
		'chair',
		[slot('Oak', 'wood', 'aged-oak', OAK)],
		[
			cyl(0, 20, 0, 14, 2, 14, 0),
			angled('cylinder', [7, 11, 14], [2, 22, 2], [345, 0, 0], 0),
			angled('cylinder', [1, 11, 4], [2, 22, 2], [7.5, 0, 345], 0),
			angled('cylinder', [13, 11, 4], [2, 22, 2], [7.5, 0, 15], 0),
			box(0, 6, 3, 14, 1, 1, 0),
			angled('cuboid', [3.5, 8.5, 9.5], [13, 1, 1], [0, 300, 0], 0),
			angled('cuboid', [10.5, 8.5, 9.5], [13, 1, 1], [0, 60, 0], 0)
		],
		[['sit', 7, 22, 7, 180]]
	),
	// Trestle bench: a two-board seat on board legs with feet and bearers, tied by a through
	// stretcher with wedges showing outside each leg.
	design(
		'bench',
		'Bench',
		'chair',
		[slot('Oak', 'wood', 'aged-oak', OAK), slot('Dark oak', 'wood', 'dark-oak', DARK_OAK)],
		[
			box(0, 14, 0, 48, 1, 6, 0),
			box(0, 14, 6, 48, 1, 6, 0),
			box(5, 2, 3, 2, 11, 6, 1),
			box(41, 2, 3, 2, 11, 6, 1),
			box(4, 0, 1, 4, 2, 10, 1),
			box(40, 0, 1, 4, 2, 10, 1),
			box(4, 13, 1, 4, 1, 10, 1),
			box(40, 13, 1, 4, 1, 10, 1),
			box(3, 6, 5, 42, 2, 2, 1),
			box(3, 5, 5, 1, 4, 2, 0),
			box(44, 5, 5, 1, 4, 2, 0)
		],
		[
			['sit', 12, 15, 6, 180],
			['sit', 36, 15, 6, 180]
		]
	),
	// Farmhouse dining table: a three-board top on turned legs and aprons, with a drawer.
	design(
		'table',
		'Table',
		'table',
		[
			slot('Oak', 'wood', 'aged-oak', OAK),
			slot('Dark oak', 'wood', 'dark-oak', DARK_OAK),
			slot('Brass', 'metal', 'brass', '#B08A3E')
		],
		[
			box(0, 23, 0, 48, 1, 9, 0),
			box(0, 23, 9, 48, 1, 10, 0),
			box(0, 23, 19, 48, 1, 9, 0),
			cyl(2, 0, 2, 3, 23, 3, 1),
			cyl(43, 0, 2, 3, 23, 3, 1),
			cyl(2, 0, 23, 3, 23, 3, 1),
			cyl(43, 0, 23, 3, 23, 3, 1),
			box(5, 19, 24, 38, 4, 1, 1),
			box(5, 19, 3, 38, 4, 1, 1),
			box(3, 19, 5, 1, 4, 18, 1),
			box(44, 19, 5, 1, 4, 18, 1),
			box(18, 19, 25, 13, 3, 1, 0),
			ball(24, 20, 26, 1, 1, 1, 2)
		]
	),
	// Bedside table: overlay drawer with a brass knob above an open shelf holding two books, on
	// short turned feet.
	design(
		'bedside-table',
		'Bedside Table',
		'table',
		[
			slot('Oak', 'wood', 'aged-oak', OAK),
			slot('Brass', 'metal', 'brass', '#B08A3E'),
			slot('Book cloth', 'fabric', 'woven-fabric', '#7A2430')
		],
		[
			box(0, 18, 0, 15, 1, 14, 0),
			box(1, 4, 1, 1, 14, 11, 0),
			box(13, 4, 1, 1, 14, 11, 0),
			box(2, 4, 1, 11, 14, 1, 0),
			box(2, 4, 2, 11, 1, 10, 0),
			box(2, 11, 2, 11, 1, 10, 0),
			box(1, 12, 12, 13, 6, 1, 0),
			box(3, 5, 3, 7, 1, 8, 2),
			box(4, 6, 4, 5, 1, 6, 2),
			cyl(1, 0, 1, 2, 4, 2, 0),
			cyl(12, 0, 1, 2, 4, 2, 0),
			cyl(1, 0, 10, 2, 4, 2, 0),
			cyl(12, 0, 10, 2, 4, 2, 0),
			ball(7, 14, 13, 1, 1, 1, 1)
		]
	),
	// Round pedestal table: an octagonal top over a deep apron, a turned column with a vase-shaped
	// bulb, and four sabre feet sloping down from the hub.
	design(
		'round-table',
		'Round Table',
		'table',
		[slot('Oak', 'wood', 'aged-oak', OAK), slot('Dark oak', 'wood', 'dark-oak', DARK_OAK)],
		[
			cyl(-18, 23, -18, 36, 1, 36, 0),
			cyl(-15, 20, -15, 30, 3, 30, 1),
			cyl(-3, 6, -3, 6, 14, 6, 1),
			ball(-5, 9, -5, 10, 8, 10, 1),
			cyl(-4, 2, -4, 8, 4, 8, 1),
			angled('cuboid', [11, 3, 0], [14, 2, 4], [0, 0, 345], 1),
			angled('cuboid', [-11, 3, 0], [14, 2, 4], [0, 0, 15], 1),
			angled('cuboid', [0, 3, 11], [4, 2, 14], [15, 0, 0], 1),
			angled('cuboid', [0, 3, -11], [4, 2, 14], [345, 0, 0], 1)
		]
	),
	// Low coffee table: a two-board top on square legs and aprons, a slatted under-shelf on side
	// stretchers, and a glazed stoneware bowl.
	design(
		'coffee-table',
		'Coffee Table',
		'table',
		[slot('Oak', 'wood', 'aged-oak', OAK), slot('Stoneware', 'stone', 'smooth-stone', '#3E5A78')],
		[
			box(0, 13, 0, 36, 1, 10, 0),
			box(0, 13, 10, 36, 1, 10, 0),
			box(1, 0, 1, 2, 13, 2, 0),
			box(33, 0, 1, 2, 13, 2, 0),
			box(1, 0, 17, 2, 13, 2, 0),
			box(33, 0, 17, 2, 13, 2, 0),
			box(3, 10, 18, 30, 3, 1, 0),
			box(3, 10, 1, 30, 3, 1, 0),
			box(1, 10, 3, 1, 3, 14, 0),
			box(34, 10, 3, 1, 3, 14, 0),
			box(1, 2, 3, 2, 1, 14, 0),
			box(33, 2, 3, 2, 1, 14, 0),
			box(2, 3, 3, 32, 1, 4, 0),
			box(2, 3, 8, 32, 1, 4, 0),
			box(2, 3, 13, 32, 1, 4, 0),
			cyl(12, 14, 6, 8, 2, 8, 1)
		]
	),
	// Two-metre trestle table laid for a meal: a three-board top on board trestles with feet and
	// bearers, a wedged through-stretcher, a linen runner, a stoneware jug and two bowls.
	design(
		'trestle-table',
		'Trestle Table',
		'table',
		[
			slot('Oak', 'wood', 'aged-oak', OAK),
			slot('Dark oak', 'wood', 'dark-oak', DARK_OAK),
			slot('Linen', 'fabric', 'woven-fabric', '#D9CBB0'),
			slot('Stoneware', 'stone', 'smooth-stone', '#B5A27E')
		],
		[
			box(0, 23, 0, 64, 1, 9, 0),
			box(0, 23, 9, 64, 1, 8, 0),
			box(0, 23, 17, 64, 1, 9, 0),
			box(9, 3, 7, 2, 19, 12, 1),
			box(53, 3, 7, 2, 19, 12, 1),
			box(8, 0, 3, 4, 3, 20, 1),
			box(52, 0, 3, 4, 3, 20, 1),
			box(8, 22, 2, 4, 1, 22, 1),
			box(52, 22, 2, 4, 1, 22, 1),
			box(7, 8, 12, 50, 3, 2, 1),
			box(7, 7, 12, 1, 5, 2, 0),
			box(56, 7, 12, 1, 5, 2, 0),
			box(4, 24, 9, 56, 0, 8, 2),
			cyl(30, 24, 10, 5, 7, 5, 3),
			cyl(16, 24, 3, 6, 2, 6, 3),
			cyl(43, 24, 17, 6, 2, 6, 3)
		]
	),
	// Mahogany console table for a hall: slender legs, two drawers with brass knobs, a low shelf
	// with a pair of books, a glazed vase and a brass candlestick on top.
	design(
		'console-table',
		'Console Table',
		'table',
		[
			slot('Mahogany', 'wood', 'mahogany', '#5A3522'),
			slot('Brass', 'metal', 'brass', '#B08A3E'),
			slot('Stoneware', 'stone', 'smooth-stone', '#3E5A78'),
			slot('Book cloth', 'fabric', 'woven-fabric', '#7A2430')
		],
		[
			box(0, 24, 0, 36, 1, 11, 0),
			box(1, 0, 1, 2, 24, 2, 0),
			box(33, 0, 1, 2, 24, 2, 0),
			box(1, 0, 8, 2, 24, 2, 0),
			box(33, 0, 8, 2, 24, 2, 0),
			box(3, 19, 1, 30, 5, 1, 0),
			box(1, 19, 3, 1, 5, 5, 0),
			box(34, 19, 3, 1, 5, 5, 0),
			box(3, 19, 9, 15, 5, 1, 0),
			box(18, 19, 9, 15, 5, 1, 0),
			box(2, 4, 2, 32, 1, 7, 0),
			box(5, 5, 3, 8, 1, 5, 3),
			box(6, 6, 3, 6, 1, 5, 3),
			ball(10, 21, 10, 1, 1, 1, 1),
			ball(25, 21, 10, 1, 1, 1, 1),
			cyl(27, 25, 4, 4, 7, 4, 2),
			cyl(6, 25, 4, 3, 1, 3, 1),
			cyl(7, 26, 5, 1, 6, 1, 1)
		]
	),
	// Pedestal writing desk: three drawers with brass pulls in a panelled pedestal, a centre drawer,
	// a green baize writing surface, and a brass candlestick with its candle.
	design(
		'writing-desk',
		'Writing Desk',
		'table',
		[
			slot('Walnut', 'wood', 'aged-oak', '#5E3F27'),
			slot('Baize', 'fabric', 'woven-fabric', '#3F5B3A'),
			slot('Brass', 'metal', 'brass', '#B08A3E'),
			slot('Wax', 'stone', 'smooth-stone', '#EDE4D0')
		],
		[
			box(0, 23, 0, 40, 1, 20, 0),
			box(3, 24, 3, 34, 0, 14, 1),
			box(1, 0, 1, 1, 23, 18, 0),
			box(13, 0, 1, 1, 23, 18, 0),
			box(2, 0, 1, 11, 23, 17, 0),
			box(2, 16, 18, 11, 6, 1, 0),
			box(2, 9, 18, 11, 6, 1, 0),
			box(2, 2, 18, 11, 6, 1, 0),
			box(6, 19, 19, 3, 1, 1, 2),
			box(6, 12, 19, 3, 1, 1, 2),
			box(6, 5, 19, 3, 1, 1, 2),
			box(37, 0, 1, 2, 23, 2, 0),
			box(37, 0, 17, 2, 23, 2, 0),
			box(14, 19, 1, 23, 4, 1, 0),
			box(38, 19, 3, 1, 4, 14, 0),
			box(14, 19, 18, 23, 4, 1, 0),
			ball(25, 21, 19, 1, 1, 1, 2),
			cyl(31, 24, 4, 3, 1, 3, 2),
			cyl(32, 25, 5, 1, 5, 1, 3)
		]
	),
	// Weathered picnic table: a slatted top and two bench boards on A-frame legs, bolted to seat
	// and top bearers. Seats four.
	design(
		'picnic-table',
		'Picnic Table',
		'table',
		[slot('Weathered wood', 'wood', 'weathered-wood', '#8A7F70')],
		[
			box(0, 23, 14, 58, 1, 6, 0),
			box(0, 23, 21, 58, 1, 6, 0),
			box(0, 23, 28, 58, 1, 6, 0),
			box(0, 14, 2, 58, 1, 8, 0),
			box(0, 14, 38, 58, 1, 8, 0),
			box(6, 12, 0, 2, 2, 48, 0),
			box(50, 12, 0, 2, 2, 48, 0),
			box(6, 21, 13, 2, 2, 22, 0),
			box(50, 21, 13, 2, 2, 22, 0),
			angled('cuboid', [5, 12, 14], [2, 26, 2], [30, 0, 0], 0),
			angled('cuboid', [5, 12, 34], [2, 26, 2], [330, 0, 0], 0),
			angled('cuboid', [53, 12, 14], [2, 26, 2], [30, 0, 0], 0),
			angled('cuboid', [53, 12, 34], [2, 26, 2], [330, 0, 0], 0)
		],
		[
			['sit', 17, 15, 6, 180],
			['sit', 41, 15, 6, 180],
			['sit', 17, 15, 42, 0],
			['sit', 41, 15, 42, 0]
		]
	),
	// Double bed: square posts with turned caps, a panelled headboard and footboard, side rails,
	// a mattress, a woollen blanket with the sheet turned down over it, and two pillows.
	design(
		'bed',
		'Bed',
		'bed',
		[
			slot('Dark oak', 'wood', 'dark-oak', DARK_OAK),
			slot('Linen', 'fabric', 'woven-fabric', '#EDE6D6'),
			slot('Blanket', 'fabric', 'woven-fabric', '#5F7F56')
		],
		[
			box(0, 0, 0, 3, 36, 3, 0),
			box(45, 0, 0, 3, 36, 3, 0),
			box(3, 31, 0, 42, 3, 3, 0),
			box(3, 9, 0, 42, 2, 3, 0),
			box(3, 11, 1, 42, 20, 1, 0),
			box(0, 0, 63, 3, 18, 3, 0),
			box(45, 0, 63, 3, 18, 3, 0),
			box(3, 15, 63, 42, 2, 3, 0),
			box(3, 9, 64, 42, 6, 1, 0),
			box(1, 7, 3, 2, 4, 60, 0),
			box(45, 7, 3, 2, 4, 60, 0),
			box(3, 11, 3, 42, 7, 60, 1),
			box(2, 13, 24, 44, 6, 40, 2),
			box(2, 19, 24, 44, 1, 5, 1),
			cyl(0, 36, 0, 3, 2, 3, 0),
			cyl(45, 36, 0, 3, 2, 3, 0),
			cyl(0, 18, 63, 3, 2, 3, 0),
			cyl(45, 18, 63, 3, 2, 3, 0),
			ball(5, 17, 4, 17, 5, 10, 1),
			ball(26, 17, 4, 17, 5, 10, 1)
		],
		[['lie', 24, 19, 32, 0]]
	),
	// Wardrobe: plinth, stepped cornice, two panelled doors with brass knobs over a long drawer
	// with brass pulls; the reveals between drawer, doors and cornice show as shadow lines.
	design(
		'wardrobe',
		'Wardrobe',
		'storage',
		[
			slot('Oak', 'wood', 'aged-oak', OAK),
			slot('Panels', 'wood', 'aged-oak', '#5E3F27'),
			slot('Brass', 'metal', 'brass', '#B08A3E')
		],
		[
			box(0, 0, 0, 36, 3, 18, 0),
			box(1, 3, 0, 34, 57, 17, 0),
			box(0, 60, 0, 36, 1, 18, 0),
			box(-1, 61, 0, 38, 2, 19, 0),
			box(2, 16, 17, 16, 43, 1, 0),
			box(18, 16, 17, 16, 43, 1, 0),
			box(2, 4, 17, 32, 11, 1, 0),
			box(4, 38, 18, 12, 18, 0, 1),
			box(4, 19, 18, 12, 16, 0, 1),
			box(20, 38, 18, 12, 18, 0, 1),
			box(20, 19, 18, 12, 16, 0, 1),
			box(7, 9, 18, 4, 1, 1, 2),
			box(25, 9, 18, 4, 1, 1, 2),
			ball(16, 36, 18, 1, 1, 1, 2),
			ball(19, 36, 18, 1, 1, 1, 2)
		]
	),
	// Joiner's workbench: a thick two-board pine top on square legs, a shelf, a front vise with an
	// iron screw and tommy bar, and a tool board with a hanging saw and hammer.
	design(
		'workbench',
		'Workbench',
		'workbench',
		[
			slot('Pine', 'wood', 'pine', PINE),
			slot('Oak', 'wood', 'aged-oak', OAK),
			slot('Iron', 'metal', 'forged-iron', '#45423F')
		],
		[
			box(0, 26, 0, 56, 2, 10, 0),
			box(0, 26, 10, 56, 2, 10, 0),
			box(3, 0, 2, 3, 26, 3, 1),
			box(50, 0, 2, 3, 26, 3, 1),
			box(3, 0, 15, 3, 26, 3, 1),
			box(50, 0, 15, 3, 26, 3, 1),
			box(3, 6, 2, 50, 1, 16, 0),
			box(6, 22, 17, 44, 4, 1, 1),
			box(6, 20, 20, 9, 8, 2, 1),
			box(0, 28, 0, 56, 12, 1, 1),
			box(30, 31, 1, 13, 5, 0, 2),
			box(43, 31, 1, 3, 4, 1, 1),
			box(14, 30, 1, 1, 8, 1, 1),
			box(12, 37, 1, 5, 2, 1, 2),
			rod('z', [10, 23, 18], [1, 1, 7], 2),
			rod('x', [6, 23, 24], [9, 1, 1], 2)
		]
	),
	// Pine base cabinet: recessed toe kick, a drawer over two shaker doors, a soapstone worktop and
	// upstand, brass pull and knobs.
	design(
		'kitchen-counter',
		'Kitchen Counter',
		'storage',
		[
			slot('Cabinet', 'wood', 'pine', PINE),
			slot('Panels', 'wood', 'pine', '#A27A4E'),
			slot('Worktop', 'stone', 'smooth-stone', '#5A5650'),
			slot('Brass', 'metal', 'brass', '#B08A3E')
		],
		[
			box(1, 0, 0, 30, 3, 15, 1),
			box(1, 3, 0, 30, 24, 18, 0),
			box(0, 3, 0, 1, 24, 18, 0),
			box(31, 3, 0, 1, 24, 18, 0),
			box(0, 27, 0, 32, 2, 19, 2),
			box(0, 29, 0, 32, 4, 1, 2),
			box(1, 21, 18, 30, 5, 1, 0),
			box(1, 4, 18, 15, 16, 1, 0),
			box(16, 4, 18, 15, 16, 1, 0),
			box(3, 6, 19, 11, 12, 0, 1),
			box(18, 6, 19, 11, 12, 0, 1),
			box(12, 23, 19, 8, 1, 1, 3),
			ball(14, 15, 19, 1, 1, 1, 3),
			ball(17, 15, 19, 1, 1, 1, 3)
		]
	),
	// The matching sink unit: a carved soapstone apron-front sink set into the worktop, a brass
	// swan-neck tap with a cross handle, and shaker doors below.
	design(
		'kitchen-sink',
		'Sink Counter',
		'storage',
		[
			slot('Cabinet', 'wood', 'pine', PINE),
			slot('Panels', 'wood', 'pine', '#A27A4E'),
			slot('Soapstone', 'stone', 'smooth-stone', '#5A5650'),
			slot('Brass', 'metal', 'brass', '#B08A3E')
		],
		[
			box(1, 0, 0, 30, 3, 15, 1),
			box(7, 3, 0, 18, 15, 18, 0),
			box(0, 3, 0, 7, 24, 18, 0),
			box(25, 3, 0, 7, 24, 18, 0),
			box(0, 27, 0, 7, 2, 19, 2),
			box(25, 27, 0, 7, 2, 19, 2),
			box(7, 27, 0, 18, 2, 4, 2),
			box(7, 18, 17, 18, 11, 2, 2),
			box(7, 18, 4, 18, 11, 2, 2),
			box(7, 18, 6, 2, 11, 11, 2),
			box(23, 18, 6, 2, 11, 11, 2),
			box(9, 18, 6, 14, 2, 11, 2),
			box(1, 4, 18, 15, 13, 1, 0),
			box(16, 4, 18, 15, 13, 1, 0),
			box(3, 6, 19, 11, 9, 0, 1),
			box(18, 6, 19, 11, 9, 0, 1),
			cyl(15, 29, 1, 2, 6, 2, 3),
			rod('z', [15, 33, 3], [2, 2, 6], 3),
			cyl(15, 31, 7, 2, 2, 2, 3),
			rod('x', [12, 31, 1], [8, 1, 1], 3),
			ball(14, 12, 19, 1, 1, 1, 3),
			ball(17, 12, 19, 1, 1, 1, 3)
		]
	),
	// Cast-iron cook stove on short legs: two hob plates, a flue collar and stove pipe, a firebox
	// door with a glowing window, an ash drawer, an oven door and a brass towel rail.
	design(
		'stove',
		'Stove',
		'stove',
		[
			slot('Cast iron', 'metal', 'forged-iron', '#403C39'),
			slot('Brass', 'metal', 'brass', '#B08A3E'),
			slot('Embers', 'stone', 'gravel', '#D9772E')
		],
		[
			box(1, 0, 1, 2, 4, 2, 0),
			box(25, 0, 1, 2, 4, 2, 0),
			box(1, 0, 16, 2, 4, 2, 0),
			box(25, 0, 16, 2, 4, 2, 0),
			box(0, 4, 0, 28, 22, 19, 0),
			box(-1, 26, -1, 30, 1, 21, 0),
			box(2, 13, 19, 11, 10, 1, 0),
			box(4, 15, 20, 7, 5, 0, 2),
			box(2, 5, 19, 11, 6, 1, 0),
			box(15, 5, 19, 11, 18, 1, 0),
			box(16, 20, 20, 9, 1, 1, 1),
			box(0, 24, 21, 28, 1, 1, 1),
			box(1, 24, 19, 1, 1, 2, 1),
			box(26, 24, 19, 1, 1, 2, 1),
			cyl(3, 27, 9, 7, 1, 7, 0),
			cyl(12, 27, 9, 7, 1, 7, 0),
			cyl(20, 27, 2, 7, 2, 7, 0),
			cyl(21, 29, 3, 5, 31, 5, 0),
			ball(11, 17, 20, 1, 1, 1, 1),
			ball(7, 7, 20, 1, 1, 1, 1)
		]
	),
	// Blanket chest: three-board body on a plinth, a domed lid, iron straps over the lid and down
	// both faces, side handles, and a brass lock plate with a padlock.
	design(
		'chest',
		'Chest',
		'storage',
		[
			slot('Oak', 'wood', 'aged-oak', OAK),
			slot('Iron', 'metal', 'forged-iron', '#45423F'),
			slot('Brass', 'metal', 'brass', '#B08A3E'),
			slot('Dark oak', 'wood', 'dark-oak', DARK_OAK)
		],
		[
			box(-1, 0, -1, 30, 2, 18, 3),
			box(1, 2, 0, 26, 4, 16, 0),
			box(1, 6, 0, 26, 4, 16, 0),
			box(1, 10, 0, 26, 4, 16, 0),
			box(0, 2, 0, 1, 12, 16, 0),
			box(27, 2, 0, 1, 12, 16, 0),
			rod('x', [0, 10, 0], [28, 8, 16], 0),
			rod('x', [5, 9, -1], [2, 10, 18], 1),
			rod('x', [21, 9, -1], [2, 10, 18], 1),
			box(5, 2, 16, 2, 12, 1, 1),
			box(21, 2, 16, 2, 12, 1, 1),
			box(5, 2, -1, 2, 12, 1, 1),
			box(21, 2, -1, 2, 12, 1, 1),
			box(12, 9, 16, 4, 6, 1, 2),
			box(-1, 9, 5, 1, 1, 6, 1),
			box(28, 9, 5, 1, 1, 6, 1),
			ball(13, 6, 17, 2, 3, 1, 2)
		]
	),
	// Pine plank chest: a boarded body on turned bun feet with a moulded skirt, a lid with
	// breadboard cleats, iron strap hinges, a keyhole escutcheon and iron side handles.
	design(
		'plank-chest',
		'Plank Chest',
		'storage',
		[slot('Pine', 'wood', 'pine', '#B88D5E'), slot('Iron', 'metal', 'forged-iron', '#45423F')],
		[
			cyl(1, 0, 1, 3, 3, 3, 0),
			cyl(26, 0, 1, 3, 3, 3, 0),
			cyl(1, 0, 11, 3, 3, 3, 0),
			cyl(26, 0, 11, 3, 3, 3, 0),
			box(-1, 3, -1, 32, 2, 17, 0),
			box(0, 5, 14, 30, 9, 1, 0),
			box(0, 5, 0, 30, 9, 1, 0),
			box(0, 5, 1, 1, 9, 13, 0),
			box(29, 5, 1, 1, 9, 13, 0),
			box(1, 14, -1, 28, 2, 17, 0),
			box(-1, 14, -1, 2, 2, 17, 0),
			box(29, 14, -1, 2, 2, 17, 0),
			box(6, 16, -1, 2, 0, 9, 1),
			box(22, 16, -1, 2, 0, 9, 1),
			box(14, 10, 15, 2, 2, 0, 1),
			box(-1, 9, 5, 1, 1, 5, 1),
			box(30, 9, 5, 1, 1, 5, 1)
		]
	),
	// Travel trunk: canvas over a frame, with oak bands round the base and lid seam, oak slats and
	// leather straps over the top, brass corner caps and lock plate, and leather side handles.
	design(
		'travel-trunk',
		'Travel Trunk',
		'storage',
		[
			slot('Canvas', 'fabric', 'woven-fabric', '#6B6A4A'),
			slot('Oak', 'wood', 'aged-oak', OAK),
			slot('Brass', 'metal', 'brass', '#B08A3E'),
			slot('Leather', 'fabric', 'woven-fabric', '#4A2E1E')
		],
		[
			box(0, 0, 0, 32, 2, 18, 1),
			box(1, 2, 1, 30, 10, 16, 0),
			box(0, 12, 0, 32, 2, 18, 1),
			box(1, 14, 1, 30, 5, 16, 0),
			box(4, 2, 0, 2, 18, 18, 1),
			box(26, 2, 0, 2, 18, 18, 1),
			box(10, 2, 0, 2, 18, 18, 3),
			box(20, 2, 0, 2, 18, 18, 3),
			box(0, 17, 0, 3, 3, 3, 2),
			box(29, 17, 0, 3, 3, 3, 2),
			box(0, 17, 15, 3, 3, 3, 2),
			box(29, 17, 15, 3, 3, 3, 2),
			box(14, 11, 18, 4, 5, 1, 2),
			box(-1, 8, 6, 1, 1, 6, 3),
			box(32, 8, 6, 1, 1, 6, 3)
		]
	),
	// Strongbox: a small dark-oak coffer bound in iron — two straps over the lid, a band round the
	// lid seam — with a lid handle, a hasp and a brass padlock.
	design(
		'strongbox',
		'Strongbox',
		'storage',
		[
			slot('Dark oak', 'wood', 'dark-oak', DARK_OAK),
			slot('Iron', 'metal', 'forged-iron', '#45423F'),
			slot('Brass', 'metal', 'brass', '#B08A3E')
		],
		[
			box(1, 0, 0, 14, 8, 10, 0),
			box(1, 8, 0, 14, 3, 10, 0),
			box(0, 0, 0, 1, 11, 10, 0),
			box(15, 0, 0, 1, 11, 10, 0),
			box(3, 0, -1, 1, 12, 12, 1),
			box(12, 0, -1, 1, 12, 12, 1),
			box(-1, 7, -1, 18, 2, 12, 1),
			box(7, 7, 11, 2, 4, 1, 1),
			box(6, 11, 4, 4, 1, 2, 1),
			ball(7, 4, 12, 2, 3, 1, 2)
		]
	),
	// Oak barrel: staves bulging at the bilge, iron chime hoops near each end, and a brass tap.
	design(
		'barrel',
		'Barrel',
		'storage',
		[
			slot('Staves', 'wood', 'aged-oak', '#7A5134'),
			slot('Hoops', 'metal', 'forged-iron', '#45423F'),
			slot('Brass', 'metal', 'brass', '#B08A3E')
		],
		[
			cyl(0, 0, 0, 18, 28, 18, 0),
			ball(-1, 1, -1, 20, 26, 20, 0),
			cyl(-1, 3, -1, 20, 1, 20, 1),
			cyl(-1, 24, -1, 20, 1, 20, 1),
			rod('z', [8, 5, 16], [2, 2, 5], 2)
		]
	),
	// Open shelving: three shelves between board sides, back rails, a wicker basket and a stoneware
	// crock below, plates and a lidded jar in the middle, books on top.
	design(
		'shelf',
		'Shelf',
		'storage',
		[
			slot('Oak', 'wood', 'aged-oak', OAK),
			slot('Stoneware', 'stone', 'smooth-stone', '#D8CCB4'),
			slot('Wicker', 'fabric', 'woven-fabric', '#A88A5A'),
			slot('Book cloth', 'fabric', 'woven-fabric', '#24405F')
		],
		[
			box(0, 0, 0, 1, 40, 10, 0),
			box(31, 0, 0, 1, 40, 10, 0),
			box(-1, 40, 0, 34, 1, 11, 0),
			box(1, 2, 0, 30, 1, 10, 0),
			box(1, 15, 0, 30, 1, 10, 0),
			box(1, 28, 0, 30, 1, 10, 0),
			box(1, 0, 8, 30, 2, 1, 0),
			box(1, 20, 0, 30, 2, 1, 0),
			box(1, 33, 0, 30, 2, 1, 0),
			box(3, 3, 2, 10, 6, 7, 2),
			box(3, 29, 2, 4, 8, 7, 3),
			box(10, 29, 2, 7, 2, 6, 3),
			cyl(18, 3, 2, 7, 8, 7, 1),
			rod('z', [3, 16, 1], [8, 8, 1], 1),
			rod('z', [12, 16, 1], [8, 8, 1], 1),
			cyl(23, 16, 3, 5, 6, 5, 1),
			ball(25, 22, 5, 1, 1, 1, 1)
		]
	),
	// Bookcase: board sides, a plinth and overhanging top, a back panel, four shelves, short runs
	// of cloth-bound books in alternating colours and heights (one leaning, one lying in a stack),
	// a brass candlestick and a brass orb on a stand.
	design(
		'bookcase',
		'Bookcase',
		'storage',
		[
			slot('Oak', 'wood', 'aged-oak', '#5E3F27'),
			slot('Red cloth', 'fabric', 'woven-fabric', '#7A2430'),
			slot('Blue cloth', 'fabric', 'woven-fabric', '#24405F'),
			slot('Brass', 'metal', 'brass', '#B08A3E')
		],
		[
			box(0, 0, 0, 1, 58, 10, 0),
			box(29, 0, 0, 1, 58, 10, 0),
			box(-1, 58, 0, 32, 2, 11, 0),
			box(1, 0, 9, 28, 3, 1, 0),
			box(1, 3, 0, 28, 55, 0, 0),
			box(1, 3, 0, 28, 1, 10, 0),
			box(1, 17, 0, 28, 1, 10, 0),
			box(1, 31, 0, 28, 1, 10, 0),
			box(1, 45, 0, 28, 1, 10, 0),
			box(1, 4, 2, 3, 10, 7, 1),
			box(4, 4, 2, 3, 9, 7, 2),
			box(7, 4, 2, 2, 11, 7, 1),
			angled('cuboid', [11, 9, 5.5], [2, 10, 7], [0, 0, 15], 2),
			box(1, 18, 2, 4, 10, 7, 2),
			box(5, 18, 2, 3, 9, 7, 1),
			box(3, 46, 2, 9, 3, 7, 1),
			cyl(21, 32, 4, 3, 1, 3, 3),
			cyl(22, 33, 5, 1, 6, 1, 3),
			cyl(22, 46, 5, 2, 2, 2, 3),
			ball(21, 48, 4, 4, 4, 4, 3)
		]
	),
	// Old gas lamp post: a stone footing, a stepped cast-iron base and fluted lower shaft, a slim
	// column with a collar and a ladder bar, and a glazed lantern with a glowing mantle under a
	// stepped roof and finial. Purely decorative: it does not light the world.
	design(
		'lamp-post',
		'Lamp Post',
		'decoration',
		[
			slot('Cast iron', 'metal', 'forged-iron', '#33332F'),
			slot('Glass', 'glass', 'old-glass', '#C8C29A'),
			slot('Mantle', 'fabric', 'woven-fabric', '#F2C66B'),
			slot('Stone', 'stone', 'cut-stone', '#8A8578')
		],
		[
			box(-9, 0, -9, 18, 2, 18, 3),
			cyl(-6, 2, -6, 12, 5, 12, 0),
			cyl(-4, 7, -4, 8, 6, 8, 0),
			cyl(-3, 13, -3, 6, 20, 6, 0),
			cyl(-2, 33, -2, 4, 57, 4, 0),
			box(-4, 33, -4, 8, 1, 8, 0),
			angled('cuboid', [0, 33.5, 0], [8, 1, 8], [0, 45, 0], 0),
			box(-8, 82, -1, 16, 1, 2, 0),
			box(-5, 90, -5, 10, 1, 10, 0),
			box(-4, 91, -4, 8, 12, 8, 1),
			box(-1, 93, -1, 2, 4, 2, 2),
			box(-5, 91, -5, 1, 12, 1, 0),
			box(4, 91, -5, 1, 12, 1, 0),
			box(-5, 91, 4, 1, 12, 1, 0),
			box(4, 91, 4, 1, 12, 1, 0),
			box(-5, 103, -5, 10, 1, 10, 0),
			box(-6, 104, -6, 12, 1, 12, 0),
			angled('cuboid', [0, 106.5, 0], [8, 3, 8], [0, 45, 0], 0),
			box(-2, 108, -2, 4, 2, 4, 0),
			ball(-1, 110, -1, 2, 3, 2, 0)
		]
	),
	// Water well: an octagonal fieldstone wall round dark water, timber posts carrying a ridge beam
	// and a board roof, a windlass with an iron crank, and a bucket on its chain.
	design(
		'well',
		'Water Well',
		'decoration',
		[
			slot('Fieldstone', 'stone', 'fieldstone', '#8F887C'),
			slot('Timber', 'wood', 'weathered-wood', '#7D7266'),
			slot('Water', 'stone', 'smooth-stone', '#1F2E33'),
			slot('Iron', 'metal', 'forged-iron', '#45423F')
		],
		[
			box(-8, 0, 15, 16, 24, 5, 0),
			box(-8, 0, -20, 16, 24, 5, 0),
			box(15, 0, -8, 5, 24, 16, 0),
			box(-20, 0, -8, 5, 24, 16, 0),
			// The diagonal walls stand a unit proud so no two wall tops share a plane.
			angled('cuboid', [12, 12.5, 12.5], [16, 25, 5], [0, 45, 0], 0),
			angled('cuboid', [-12, 12.5, -12.5], [16, 25, 5], [0, 45, 0], 0),
			angled('cuboid', [12.5, 12.5, -12], [16, 25, 5], [0, 135, 0], 0),
			angled('cuboid', [-12.5, 12.5, 12], [16, 25, 5], [0, 135, 0], 0),
			angled('cylinder', [0, 8, 0], [34, 16, 34], [0, 22.5, 0], 2),
			box(-19, 24, -2, 4, 50, 4, 1),
			box(15, 24, -2, 4, 50, 4, 1),
			box(-22, 74, -2, 44, 3, 4, 1),
			angled('cuboid', [0, 68.5, 12], [46, 1, 30], [37.5, 0, 0], 1),
			angled('cuboid', [0, 68, -11.5], [46, 1, 30], [322.5, 0, 0], 1),
			rod('x', [-15, 50, -2], [30, 4, 4], 1),
			box(19, 51, -1, 2, 2, 2, 3),
			box(21, 45, -1, 1, 8, 2, 3),
			box(22, 45, -1, 3, 2, 2, 3),
			cyl(0, 40, 0, 1, 10, 1, 3),
			cyl(-3, 33, -3, 7, 7, 7, 1)
		]
	)
];

const BY_ID = new Map(DEFAULT_MINI_BUILDS.map((definition) => [definition.id, definition]));

export function getDefaultMiniBuild(id: string): MiniBuildDefinition | undefined {
	return BY_ID.get(id);
}

export const STARTER_MINI_BUILD_ID = 'default-chair';
