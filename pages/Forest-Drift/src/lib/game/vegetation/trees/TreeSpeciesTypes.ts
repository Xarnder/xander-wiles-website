/**
 * Tree species and prototype types — framework- and Three.js-free like every other `*Types.ts`.
 *
 * The pipeline these describe (see the README's "Stylised trees" section):
 *
 *   species definition (rules + ranges)
 *     → a few procedural PROTOTYPES per species (seeded designs)
 *       → compiled once per LOD into shared geometry (TreePrototypeCache)
 *         → referenced by lightweight per-tree instances, batched per chunk × prototype × LOD
 *
 * Nothing here is per placed tree except `TreeInstanceDefinition`, which is a handful of numbers.
 */

export type TreeFamily = 'broadleaf' | 'pine' | 'cypress' | 'ornamental';

export type TreeSpeciesId = 'oak' | 'pine' | 'cypress' | 'ornamental';

export const TREE_SPECIES_IDS: readonly TreeSpeciesId[] = ['oak', 'pine', 'cypress', 'ornamental'];

/** Level of detail: 0 near … 3 very far (cheap silhouette). */
export type TreeLod = 0 | 1 | 2 | 3;

export const TREE_LODS: readonly TreeLod[] = [0, 1, 2, 3];

/** A `[min, max]` range the prototype generator samples deterministically. */
export type Range = readonly [number, number];

export interface TrunkRules {
	/** Trunk height up to the canopy base, metres. */
	height: Range;
	/** Radius at the ground, metres. */
	radius: Range;
	/** Top radius as a fraction of the base radius. */
	taper: number;
	/** Maximum horizontal offset of the trunk top relative to its height (a gentle lean/bend). */
	bend: Range;
	/** Short branch stubs reaching into the canopy (LOD0 only). */
	branches: Range;
	/** How much of the trunk continues up into the canopy (0 = stops at canopy base). */
	extendIntoCanopy: number;
}

/** Rounded-blob canopies (broadleaf, ornamental). */
export interface BlobCanopyRules {
	kind: 'blobs';
	clusterCount: Range;
	/** Canopy overall width (diameter), metres. */
	width: Range;
	/** Canopy overall height, metres. */
	height: Range;
	/** Individual cluster radius as a fraction of canopy width. */
	clusterScale: Range;
	/** Vertical squash of each cluster (1 = sphere). */
	squash: Range;
	/** Canopy centre offset above the trunk top, as a fraction of canopy height (negative sinks the trunk into the canopy). */
	verticalOffset: Range;
	/** Lumpiness of cluster surfaces, as a fraction of cluster radius. */
	lumpiness: number;
}

/** Stacked conical tiers (pine). */
export interface TieredCanopyRules {
	kind: 'tiers';
	tierCount: Range;
	/** Bottom tier radius, metres. */
	baseRadius: Range;
	/** Total foliage height above the trunk's first branches, metres. */
	height: Range;
	/** How much each tier overlaps the next (0..1). */
	overlap: number;
	/** Downward droop of each tier's rim, metres. */
	droop: Range;
	/** Jagged rim: inner points sit at this fraction of the tier radius. */
	rimNotch: number;
}

/** A narrow lathed spindle with vertical lumps (cypress). */
export interface SpindleCanopyRules {
	kind: 'spindle';
	height: Range;
	/** Max radius, metres. */
	radius: Range;
	/** Where along its height the spindle is widest (0 bottom … 1 top). */
	widestAt: Range;
	/** Number of soft horizontal bulges up the spindle. */
	bulges: Range;
	lumpiness: number;
}

export type CanopyRules = BlobCanopyRules | TieredCanopyRules | SpindleCanopyRules;

/** Colours as `#RRGGBB` (sRGB). Vertex colours interpolate between these. */
export interface TreeStyle {
	/** Shadowed / lower foliage. */
	foliageDark: string;
	/** Main foliage colour. */
	foliage: string;
	/** Sunlit top highlight. */
	foliageLight: string;
	trunkDark: string;
	trunk: string;
	/** Per-instance tint spread (0..1): hue/value jitter applied as an instance colour. */
	tintVariation: number;
	/** Optional alternate foliage palettes some prototypes use (e.g. autumn / blossom ornamentals). */
	alternateFoliage?: readonly { dark: string; base: string; light: string }[];
}

/** Procedural bark, drawn per pixel by the tree shader along each trunk/branch axis. */
export type TreeBarkKind = 'furrowed' | 'plated' | 'fibrous' | 'smooth';
/** Procedural foliage surface: leaf clusters, needle tufts or scale-like sprays. */
export type TreeFoliageKind = 'broadleaf' | 'small-leaf' | 'needles' | 'scales';

export interface TreeSurfaceStyle {
	bark: TreeBarkKind;
	foliage: TreeFoliageKind;
}

/**
 * Surface kind codes stored in the `treeSurface` vertex attribute (x) — the shader branches on
 * them. Bark kinds are < 4, foliage kinds ≥ 4.
 */
export const TREE_SURFACE_CODES: Readonly<Record<TreeBarkKind | TreeFoliageKind, number>> = {
	furrowed: 0,
	plated: 1,
	fibrous: 2,
	smooth: 3,
	broadleaf: 4,
	'small-leaf': 5,
	needles: 6,
	scales: 7
};

/** Approximate triangle budget per LOD — enforced by tests, used to pick tessellation. */
export type TriangleBudget = readonly [lod0: number, lod1: number, lod2: number, lod3: number];

export interface TreeSpeciesDefinition {
	id: TreeSpeciesId;
	family: TreeFamily;
	label: string;
	trunk: TrunkRules;
	canopy: CanopyRules;
	style: TreeStyle;
	/** Procedural bark and foliage surfaces. */
	surface: TreeSurfaceStyle;
	/** Number of procedural prototype designs compiled for this species (draw calls scale with it). */
	prototypeCount: number;
	/** Per-instance non-uniform scale: canopy width multiplier range (height comes from the placement scale). */
	instanceWidthScale: Range;
	/** Per-instance overall scale range (multiplies the placement scale). */
	instanceScale: Range;
	/** Wind sway amplitude multiplier (0 = rigid). */
	windResponse: number;
	triangleBudget: TriangleBudget;
}

/** One compiled prototype design: which species, which seeded variant. */
export interface TreePrototypeKey {
	speciesId: TreeSpeciesId;
	variant: number;
}

/**
 * A placed tree: everything needed to render and regenerate it, nothing else. Identity is the
 * vegetation cell (see TreePlacementGenerator) — no mesh, no material, no per-tree object graph.
 */
export interface TreeInstanceDefinition {
	id: string;
	cellX: number;
	cellZ: number;
	speciesId: TreeSpeciesId;
	/** Prototype variant within the species. */
	variant: number;
	worldX: number;
	worldZ: number;
	/** Uniform scale (height). */
	scale: number;
	/** Additional horizontal scale relative to `scale` (canopy width variation). */
	widthScale: number;
	rotationY: number;
	/** Per-instance tint roll in [0, 1) (mapped to a subtle colour multiplier at render time). */
	tint: number;
}

/** Plain-array mesh data for one prototype LOD (Node-testable; turned into a BufferGeometry by the cache). */
export interface TreeMeshData {
	positions: Float32Array;
	normals: Float32Array;
	/** Linear RGB vertex colours. */
	colors: Float32Array;
	/** 0 at the trunk base → 1 at the canopy's outer edge: drives shader wind sway. */
	wind: Float32Array;
	/**
	 * Per vertex: surface kind code (`TREE_SURFACE_CODES`) and a grain direction — the branch axis
	 * for bark, the needle/spray direction for conifer foliage, zero for broadleaf.
	 */
	surface: Float32Array;
	indices: Uint32Array;
	/** Axis-aligned bounds in prototype space (y = 0 at the ground). */
	min: [number, number, number];
	max: [number, number, number];
}

export function triangleCount(mesh: TreeMeshData): number {
	return mesh.indices.length / 3;
}
