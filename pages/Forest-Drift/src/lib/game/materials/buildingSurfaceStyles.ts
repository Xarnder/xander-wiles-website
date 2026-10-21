import type { MaterialKind } from '../building/MaterialTypes';
import type { SurfaceStyle } from './ProceduralMaterialTypes';

/**
 * Framing is SOLID wood (`mapping: 'wood'` → `shader/woodShader.ts`): one continuous piece of timber
 * per post or beam with growth rings on its end grain — never boards. Planked surfaces (floors, door
 * leaves) keep the board texture below.
 */
const STRUCTURAL_TIMBER: SurfaceStyle = {
	type: 'timber',
	options: { variant: 'dark-oak' },
	mapping: 'wood'
};

const JOINERY_TIMBER: SurfaceStyle = {
	type: 'timber',
	options: { variant: 'aged-brown', weathering: 0.25 },
	mapping: 'wood'
};

/**
 * Semantic surface → procedural material. This table is the ONLY place that decides what a wall, a
 * beam or a roof is made of; builders keep asking `BuildingMaterialManager` for a `MaterialKind`
 * exactly as before. Adding a preset or re-dressing a surface is a one-line change here, never a
 * change to a procedural generator.
 *
 * Furniture uses shared wood maps and upholstered parts use fabric; colour overrides tint those maps.
 * Kinds without an entry (such as door handles) keep their flat look.
 */
export const BUILDING_SURFACE_STYLES: Readonly<Partial<Record<MaterialKind, SurfaceStyle>>> = {
	furniture: { type: 'timber', options: { variant: 'aged-brown' }, mapping: 'native' },
	'furniture-accent': { type: 'timber', options: { variant: 'aged-brown' }, mapping: 'native' },
	'mini-build-fabric': { type: 'fabric', mapping: 'native' },
	wall: { type: 'plaster', mapping: 'planar' },
	foundation: { type: 'masonry', options: { variant: 'cut-block' }, mapping: 'planar' },
	'foundation-top': { type: 'paving', options: { variant: 'cobble' }, mapping: 'planar' },
	'slab-floor': {
		type: 'timber',
		options: { variant: 'aged-brown', planks: true, weathering: 0.15 },
		mapping: 'planar'
	},
	'slab-roof': { type: 'slate', mapping: 'roof' },
	stair: { type: 'masonry', options: { variant: 'dressed', moss: 0.1 }, mapping: 'planar' },
	'wall-frame': STRUCTURAL_TIMBER,
	'wall-beam': STRUCTURAL_TIMBER,
	'window-frame': STRUCTURAL_TIMBER,
	'door-frame': STRUCTURAL_TIMBER,
	'stair-frame': STRUCTURAL_TIMBER,
	'slab-opening-frame': STRUCTURAL_TIMBER,
	skirting: JOINERY_TIMBER,
	'door-leaf': {
		type: 'timber',
		options: { variant: 'aged-brown', planks: true, weathering: 0.3 },
		mapping: 'grain'
	}
};

/**
 * Floor-detail wood (hotbar slot 6: plank floors and path frame rails). Solid wood whose average
 * colour is the player's chosen plank/rail colour (the geometry supplies its own per-board logs).
 */
export const FLOOR_DETAIL_WOOD_STYLE: SurfaceStyle = {
	type: 'timber',
	options: { variant: 'aged-brown' },
	mapping: 'wood'
};

/**
 * Path centres. One continuous dark-grey stone face: patchy tone and fine grit. UVs are authored
 * on the path geometry in metres.
 */
export const FLOOR_DETAIL_STONE_STYLE: SurfaceStyle = {
	type: 'paving',
	options: { variant: 'plain', moss: 0, dirt: 0, variation: 0.65 },
	mapping: 'native'
};

/** Window glass — bound onto the shared glass material (see `OpeningVisualBuilder.getGlassMaterial`). */
export const GLASS_SURFACE_STYLE: SurfaceStyle = { type: 'glass', mapping: 'planar' };

/** Terrain ground cover — a detail map over the terrain's vertex colours, on its own world-space UVs. */
export const TERRAIN_SURFACE_STYLE: SurfaceStyle = {
	type: 'grass',
	options: { variant: 'detail' },
	mapping: 'native'
};
