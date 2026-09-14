import * as THREE from 'three';
import type { BuildingMaterialDefinition, MaterialKind } from './MaterialTypes';
import { normalizeColorHex } from './MaterialTypes';

/** Every visual property of a building surface's DEFAULT look (no paint override) — extracted unchanged from WallManager/FoundationMesh/SlabManager's own former module-level material constants, so an unpainted object renders byte-identical to before this system existed. */
interface MaterialTemplate {
	color: number;
	roughness: number;
	metalness: number;
	flatShading?: boolean;
	polygonOffset?: boolean;
	polygonOffsetFactor?: number;
	polygonOffsetUnits?: number;
	transparent?: boolean;
	opacity?: number;
}

/** Shared default for wall / window / door frames so they read as the same timber. */
const TIMBER_FRAME: MaterialTemplate = {
	color: 0x5c4632,
	roughness: 0.82,
	metalness: 0.02,
	flatShading: true
};

const TEMPLATES: Record<MaterialKind, MaterialTemplate> = {
	wall: { color: 0xcfc6b3, roughness: 0.88, metalness: 0.02, flatShading: true },
	foundation: {
		color: 0x8a8578,
		roughness: 0.92,
		metalness: 0.04,
		flatShading: true,
		polygonOffset: true,
		polygonOffsetFactor: -1,
		polygonOffsetUnits: -1
	},
	'slab-floor': {
		color: 0xd8d2c4,
		roughness: 0.9,
		metalness: 0.02,
		flatShading: true,
		polygonOffset: true,
		polygonOffsetFactor: -1,
		polygonOffsetUnits: -1
	},
	'slab-roof': {
		color: 0x8f8a7e,
		roughness: 0.95,
		metalness: 0.02,
		flatShading: true,
		polygonOffset: true,
		polygonOffsetFactor: -1,
		polygonOffsetUnits: -1
	},
	'window-frame': TIMBER_FRAME,
	'door-frame': TIMBER_FRAME,
	'door-leaf': { color: 0x8a5a35, roughness: 0.7, metalness: 0.02 },
	'door-handle': { color: 0x2c2c2c, roughness: 0.4, metalness: 0.7 },
	'wall-frame': TIMBER_FRAME,
	skirting: { color: 0xc19a6b, roughness: 0.84, metalness: 0.02, flatShading: true },
	stair: { color: 0xb9ac95, roughness: 0.85, metalness: 0.02, flatShading: true },
	'stair-frame': TIMBER_FRAME,
	'slab-opening-frame': TIMBER_FRAME,
	'wall-beam': TIMBER_FRAME,
	furniture: { color: 0x8b5a2b, roughness: 0.84, metalness: 0.04, flatShading: true },
	'furniture-accent': { color: 0x5c3a22, roughness: 0.78, metalness: 0.08, flatShading: true },
	'mini-build-wood': { color: 0x8b5a2b, roughness: 0.82, metalness: 0.02 },
	'mini-build-fabric': { color: 0xe8dcc8, roughness: 0.95, metalness: 0 },
	'mini-build-metal': { color: 0x4a4a4c, roughness: 0.42, metalness: 0.65 },
	'mini-build-stone': { color: 0x8a8578, roughness: 0.92, metalness: 0.02 },
	'mini-build-glass': {
		color: 0xa8d0e0,
		roughness: 0.08,
		metalness: 0.1,
		transparent: true,
		opacity: 0.45
	},
	'mini-build-plain': { color: 0xcccccc, roughness: 0.7, metalness: 0 }
};

/** `undefined` (no override — use the kind's own default look) collapses to a stable `'default'` key; a colour definition's key is its normalized hex, so two differently-cased/shorthand inputs that mean the same colour still share one cached material. */
function definitionKey(definition: BuildingMaterialDefinition | undefined): string {
	if (!definition) return 'default';
	if (definition.type === 'color') return `color:${normalizeColorHex(definition.color)}`;
	// Unreachable with today's single-member union — kept as a fallback rather than a thrown error
	// so a future material type this function doesn't understand yet degrades to "default" instead
	// of crashing the render loop; see MaterialTypes.ts's doc comment on why the union has room to grow.
	return 'default';
}

/**
 * Resolves a logical `BuildingMaterialDefinition` (or `undefined`, meaning "use this surface kind's
 * own default look") into an actual `THREE.Material`, caching by `(kind, definition)` so painting
 * many objects the same colour — or leaving most objects unpainted, the overwhelmingly common case —
 * never allocates a new material per object. This is the ONLY place in the codebase that turns
 * logical paint state into a real Three.js material; WallManager/WallPathManager/SlabManager/
 * FoundationManager all call `getMaterial()` instead of constructing their own `MeshStandardMaterial`
 * the way each used to (a single shared module-level constant, reused unconditionally by every
 * instance) — see each manager's own `rebuildEntry`/`buildEntry`.
 *
 * Materials returned here are cached and therefore SHARED — never mutate one in place (no
 * `.color.set(...)` on a material this returned). `PaintTool`'s live hover preview instead swaps a
 * mesh's `.material` REFERENCE to whichever cached material the paint action would actually apply —
 * a genuine, byte-identical preview of the real result, not an approximation — and restores the
 * original reference when the hover target changes; see PaintTool.clearHighlight. Since nothing
 * ever mutates a cached material in place, temporarily pointing another mesh at one is always safe.
 */
export class BuildingMaterialManager {
	private readonly cache = new Map<string, THREE.MeshStandardMaterial>();
	private readonly onMaterialCreated?: (material: THREE.Material) => void;

	/** `onMaterialCreated` fires exactly once per newly-allocated material (never for a cache hit) — ThreeScene uses it to register every building material with the graphics pipeline's cascaded-shadow system as soon as painting a new colour creates it, without needing to know about painting at all. */
	constructor(onMaterialCreated?: (material: THREE.Material) => void) {
		this.onMaterialCreated = onMaterialCreated;
	}

	getMaterial(
		kind: MaterialKind,
		definition: BuildingMaterialDefinition | undefined
	): THREE.Material {
		const key = `${kind}:${definitionKey(definition)}`;
		const cached = this.cache.get(key);
		if (cached) return cached;

		const template = TEMPLATES[kind];
		const material = new THREE.MeshStandardMaterial({
			color: definition?.type === 'color' ? normalizeColorHex(definition.color) : template.color,
			roughness: template.roughness,
			metalness: template.metalness,
			flatShading: template.flatShading ?? false,
			...(template.transparent ? { transparent: true, opacity: template.opacity ?? 1 } : {}),
			...(template.polygonOffset
				? {
						polygonOffset: true,
						polygonOffsetFactor: template.polygonOffsetFactor ?? 0,
						polygonOffsetUnits: template.polygonOffsetUnits ?? 0
					}
				: {})
		});
		this.cache.set(key, material);
		this.onMaterialCreated?.(material);
		return material;
	}

	dispose(): void {
		for (const material of this.cache.values()) material.dispose();
		this.cache.clear();
	}
}
