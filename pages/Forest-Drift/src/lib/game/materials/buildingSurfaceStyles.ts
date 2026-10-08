import type { MaterialKind } from '../building/MaterialTypes';
import type { SurfaceStyle } from './ProceduralMaterialTypes';

const STRUCTURAL_TIMBER: SurfaceStyle = {
	type: 'timber',
	options: { variant: 'dark-oak' },
	mapping: 'grain'
};

const JOINERY_TIMBER: SurfaceStyle = {
	type: 'timber',
	options: { variant: 'aged-brown', weathering: 0.25 },
	mapping: 'grain'
};

/**
 * Semantic surface → procedural material. This table is the ONLY place that decides what a wall, a
 * beam or a roof is made of; builders keep asking `BuildingMaterialManager` for a `MaterialKind`
 * exactly as before. Adding a preset or re-dressing a surface is a one-line change here, never a
 * change to a procedural generator.
 *
 * Kinds without an entry (furniture, mini-build slots, door handles) keep their flat look — their
 * colours are player-authored per object, and a texture would fight that.
 */
export const BUILDING_SURFACE_STYLES: Readonly<Partial<Record<MaterialKind, SurfaceStyle>>> = {
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

/** Window glass — bound onto the shared glass material (see `OpeningVisualBuilder.getGlassMaterial`). */
export const GLASS_SURFACE_STYLE: SurfaceStyle = { type: 'glass', mapping: 'planar' };

/** Terrain ground cover — a detail map over the terrain's vertex colours, on its own world-space UVs. */
export const TERRAIN_SURFACE_STYLE: SurfaceStyle = {
	type: 'grass',
	options: { variant: 'detail' },
	mapping: 'native'
};
