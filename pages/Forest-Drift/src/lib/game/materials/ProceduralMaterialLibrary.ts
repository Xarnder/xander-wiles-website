import * as THREE from 'three';
import { hashStringToUint32 } from '../terrain/seededRandom';
import { createMaterialMapSource, type MaterialMapSource } from './MaterialMapSource';
import { DEFAULT_MATERIAL_PALETTE_ID } from './materialPalettes';
import { recipeCacheKey, resolveMaterialRecipe } from './materialPresets';
import type {
	MaterialMapData,
	MaterialPaletteId,
	MaterialQuality,
	ProceduralMaterialOptions,
	ProceduralMaterialType,
	ResolvedMaterialRecipe,
	SurfaceStyle
} from './ProceduralMaterialTypes';
import {
	applySurfaceShader,
	createSurfaceShaderUniforms,
	type SurfaceShaderKind,
	type SurfaceShaderUniforms
} from './shader/surfaceShader';
import {
	configureSurfaceUniforms,
	isShaderLaidOut,
	shaderQualityFor,
	surfaceShaderKindFor
} from './shader/surfaceShaderPresets';
import { clearSurfaceMappingSpec, type SurfaceMappingBinder } from './SurfaceMappingBinder';

/**
 * Number of distinct texture variations per material type a world can draw from. The world seed
 * picks one, so different worlds look different, while the texture count stays bounded however
 * many buildings exist — per-building variety comes from UV offsets and tints (`surfaceMapping.ts`),
 * not from unique textures.
 */
export const MATERIAL_SEED_SLOTS = 4;

/** Unreferenced texture sets kept around (LRU) before being disposed — covers toggling quality/palette back and forth. */
const MAX_IDLE_TEXTURE_SETS = 4;

export interface ProceduralBindingOptions {
	/** Painted colour (`#RRGGBB`): the texture is tinted so its average equals this colour. */
	tint?: string;
	/**
	 * Detail mode: the surface's own vertex colours carry its base colour (terrain), and the texture
	 * only adds structure — its average is normalised to white.
	 */
	detail?: boolean;
	/** Metres per unit of the mesh's existing UVs (only for `mapping: 'native'`). Default 1. */
	uvUnitMeters?: number;
}

interface TextureSet {
	key: string;
	map: THREE.DataTexture;
	normalMap: THREE.DataTexture;
	ormMap: THREE.DataTexture;
	meanLinear: readonly [number, number, number];
	references: number;
	bytes: number;
}

/** Everything a binding may change, captured before it does, so disabling restores the exact legacy look. */
interface FlatLook {
	color: THREE.Color;
	roughness: number;
	metalness: number;
	vertexColors: boolean;
	map: THREE.Texture | null;
	normalMap: THREE.Texture | null;
	roughnessMap: THREE.Texture | null;
	aoMap: THREE.Texture | null;
	opacity: number;
	envMapIntensity: number;
}

interface Binding {
	material: THREE.MeshStandardMaterial;
	style: SurfaceStyle;
	options: ProceduralBindingOptions;
	flat: FlatLook;
	applied: TextureSet | null;
	/** Key of the texture set this binding currently wants (guards against stale async results). */
	wantedKey: string | null;
	/** World-scale shader treatment for the wanted recipe (null = plain texture sampling). */
	shaderKind: SurfaceShaderKind | null;
	shaderRecipe: ResolvedMaterialRecipe | null;
	uniforms: SurfaceShaderUniforms;
}

export interface ProceduralMaterialLibraryOptions {
	binder?: SurfaceMappingBinder;
	source?: MaterialMapSource;
	quality?: MaterialQuality;
	palette?: MaterialPaletteId;
	enabled?: boolean;
	/**
	 * World-scale anti-tiling (default on): masonry and paving are laid out per pixel in the shader,
	 * grass gets macro ground-cover variation, and stochastic textures are sampled without a tile
	 * grid. Off = the original repeated texture tiles, kept for comparison.
	 */
	antiTiling?: boolean;
	anisotropy?: number;
	/** Fired once per material this library creates itself (CSM registration). */
	onMaterialCreated?: (material: THREE.Material) => void;
}

export interface ProceduralMaterialStats {
	textureSets: number;
	idleTextureSets: number;
	gpuBytes: number;
	pending: number;
	bindings: number;
}

function captureFlatLook(material: THREE.MeshStandardMaterial): FlatLook {
	return {
		color: material.color.clone(),
		roughness: material.roughness,
		metalness: material.metalness,
		vertexColors: material.vertexColors,
		map: material.map,
		normalMap: material.normalMap,
		roughnessMap: material.roughnessMap,
		aoMap: material.aoMap,
		opacity: material.opacity,
		envMapIntensity: material.envMapIntensity
	};
}

/**
 * Turns procedural recipes into Three.js materials and keeps them up to date.
 *
 * Two entry points:
 * - `getProceduralMaterial(type, options)` — a ready, cached `MeshStandardMaterial` for any recipe.
 * - `bindMaterial(material, style, options)` — puts a procedural look on an EXISTING material
 *   (how `BuildingMaterialManager` and the terrain integrate, without new material identities, so
 *   CSM registration, paint previews and every mesh reference keep working).
 *
 * Maps are generated asynchronously (worker pool); a bound material shows its legacy flat look until
 * its maps arrive, then swaps in once. Texture sets are cached by recipe key and reference-counted,
 * so any number of materials resolving to the same recipe share one set of GPU textures.
 */
export class ProceduralMaterialLibrary {
	private readonly binder?: SurfaceMappingBinder;
	private readonly source: MaterialMapSource;
	private readonly onMaterialCreated?: (material: THREE.Material) => void;
	private readonly bindings = new Map<THREE.Material, Binding>();
	private readonly textureSets = new Map<string, TextureSet>();
	private readonly idleSets: string[] = [];
	private readonly pendingData = new Map<string, Promise<MaterialMapData>>();
	private readonly ownMaterials = new Map<string, THREE.MeshStandardMaterial>();
	private readonly idleWaiters: (() => void)[] = [];
	private pendingCount = 0;
	private quality: MaterialQuality;
	private palette: MaterialPaletteId;
	private enabled: boolean;
	private antiTiling: boolean;
	private anisotropy: number;
	private worldSeed = '';
	private disposed = false;

	constructor(options: ProceduralMaterialLibraryOptions = {}) {
		this.binder = options.binder;
		this.source = options.source ?? createMaterialMapSource();
		this.onMaterialCreated = options.onMaterialCreated;
		this.quality = options.quality ?? 'medium';
		this.palette = options.palette ?? DEFAULT_MATERIAL_PALETTE_ID;
		this.enabled = options.enabled ?? true;
		this.antiTiling = options.antiTiling ?? true;
		this.anisotropy = options.anisotropy ?? 1;
	}

	// ---------------------------------------------------------------- public configuration

	isEnabled(): boolean {
		return this.enabled;
	}

	/** Switches every bound material between procedural and its original flat look. */
	setEnabled(enabled: boolean): void {
		if (this.enabled === enabled) return;
		this.enabled = enabled;
		this.refreshAll();
	}

	isAntiTiling(): boolean {
		return this.antiTiling;
	}

	/** Switches between world-scale non-repeating surfaces and the original tiled textures. */
	setAntiTiling(antiTiling: boolean): void {
		if (this.antiTiling === antiTiling) return;
		this.antiTiling = antiTiling;
		this.refreshAll();
	}

	getQuality(): MaterialQuality {
		return this.quality;
	}

	setQuality(quality: MaterialQuality): void {
		if (this.quality === quality) return;
		this.quality = quality;
		this.refreshAll();
	}

	getPalette(): MaterialPaletteId {
		return this.palette;
	}

	setPalette(palette: MaterialPaletteId): void {
		if (this.palette === palette) return;
		this.palette = palette;
		this.refreshAll();
	}

	/** World seed: selects which of the `MATERIAL_SEED_SLOTS` variations each material type uses. */
	setWorldSeed(seed: string): void {
		if (this.worldSeed === seed) return;
		this.worldSeed = seed;
		this.binder?.invalidateAll();
		this.refreshAll();
	}

	setAnisotropy(anisotropy: number): void {
		const value = Math.max(1, Math.round(anisotropy));
		if (value === this.anisotropy) return;
		this.anisotropy = value;
		for (const set of this.textureSets.values()) {
			for (const texture of [set.map, set.normalMap, set.ormMap]) {
				texture.anisotropy = value;
				texture.needsUpdate = true;
			}
		}
	}

	/** Resolves once every requested texture set has been generated and applied. */
	whenIdle(): Promise<void> {
		if (this.pendingCount === 0) return Promise.resolve();
		return new Promise((resolve) => this.idleWaiters.push(resolve));
	}

	getStats(): ProceduralMaterialStats {
		let gpuBytes = 0;
		for (const set of this.textureSets.values()) gpuBytes += set.bytes;
		return {
			textureSets: this.textureSets.size,
			idleTextureSets: this.idleSets.length,
			gpuBytes,
			pending: this.pendingCount,
			bindings: this.bindings.size
		};
	}

	/** The texture set currently applied to a bound material (debug/gallery inspection), or `null` while it is flat. */
	getAppliedMaps(material: THREE.Material): {
		key: string;
		map: THREE.DataTexture;
		normalMap: THREE.DataTexture;
		ormMap: THREE.DataTexture;
	} | null {
		const applied = this.bindings.get(material)?.applied;
		return applied
			? { key: applied.key, map: applied.map, normalMap: applied.normalMap, ormMap: applied.ormMap }
			: null;
	}

	/** The recipe a style resolves to under the current quality/palette/world seed. */
	resolveRecipe(style: Pick<SurfaceStyle, 'type' | 'options'>): ResolvedMaterialRecipe {
		const options: ProceduralMaterialOptions = { palette: this.palette, ...style.options };
		if (options.seed === undefined) {
			const slot =
				(hashStringToUint32(`${this.worldSeed}::${style.type}`) >>> 0) % MATERIAL_SEED_SLOTS;
			options.seed = `${style.type}:${options.variant ?? ''}:${slot}`;
		}
		return resolveMaterialRecipe(style.type, options, this.quality);
	}

	// ---------------------------------------------------------------- materials

	/**
	 * A cached, procedurally-textured material for `type`/`options`. Meshes using it are mapped in
	 * planar mode by the binder. The same options always return the same material instance.
	 */
	getProceduralMaterial<T extends ProceduralMaterialType>(
		type: T,
		options: ProceduralMaterialOptions<T> = {},
		mapping: SurfaceStyle['mapping'] = type === 'timber'
			? 'grain'
			: type === 'slate'
				? 'roof'
				: 'planar'
	): THREE.MeshStandardMaterial {
		const key = `${type}|${mapping}|${JSON.stringify(options, Object.keys(options).sort())}`;
		const cached = this.ownMaterials.get(key);
		if (cached) return cached;
		const material =
			type === 'glass'
				? new THREE.MeshPhysicalMaterial({
						transparent: true,
						side: THREE.DoubleSide,
						depthWrite: false
					})
				: new THREE.MeshStandardMaterial();
		material.name = `procedural:${type}`;
		this.ownMaterials.set(key, material);
		this.onMaterialCreated?.(material);
		this.bindMaterial(material, { type, options, mapping });
		return material;
	}

	/** Attaches (or re-targets) a procedural look on an existing material. */
	bindMaterial(
		material: THREE.MeshStandardMaterial,
		style: SurfaceStyle,
		options: ProceduralBindingOptions = {}
	): void {
		let binding = this.bindings.get(material);
		if (!binding) {
			binding = {
				material,
				style,
				options,
				flat: captureFlatLook(material),
				applied: null,
				wantedKey: null,
				shaderKind: null,
				shaderRecipe: null,
				uniforms: createSurfaceShaderUniforms()
			};
			this.bindings.set(material, binding);
			material.addEventListener('dispose', () => this.unbind(material, false));
		} else {
			binding.style = style;
			binding.options = options;
		}
		// Missing `color` attribute (a mesh rendered before the binder mapped it) reads as white, not black.
		(
			material as THREE.Material & { defaultAttributeValues?: Record<string, number[]> }
		).defaultAttributeValues = {
			color: [1, 1, 1]
		};
		this.applyBinding(binding);
	}

	/** Stops managing a material; `restore` puts its original flat look back. */
	unbind(material: THREE.Material, restore = true): void {
		const binding = this.bindings.get(material);
		if (!binding) return;
		if (restore) this.restoreFlat(binding);
		else this.releaseSet(binding.applied);
		binding.applied = null;
		this.bindings.delete(material);
	}

	dispose(): void {
		this.disposed = true;
		for (const binding of [...this.bindings.values()]) this.unbind(binding.material, true);
		for (const material of this.ownMaterials.values()) material.dispose();
		this.ownMaterials.clear();
		for (const set of this.textureSets.values()) this.disposeSet(set);
		this.textureSets.clear();
		this.idleSets.length = 0;
		this.source.dispose();
		this.pendingCount = 0;
		this.flushIdleWaiters();
	}

	// ---------------------------------------------------------------- internals

	private refreshAll(): void {
		for (const binding of this.bindings.values()) this.applyBinding(binding);
	}

	private textureKey(recipe: ResolvedMaterialRecipe, uvUnitMeters: number): string {
		return `${recipeCacheKey(recipe)}@${uvUnitMeters}`;
	}

	private applyBinding(binding: Binding): void {
		if (!this.enabled || this.disposed) {
			binding.wantedKey = null;
			this.restoreFlat(binding);
			return;
		}
		// Only procedural surfaces need binder mapping; flat (and native-UV) materials are left alone.
		const style = binding.style;
		if (style.mapping === 'native') clearSurfaceMappingSpec(binding.material);
		else {
			this.binder?.watch(binding.material, {
				mode: style.mapping,
				weathering: style.type !== 'glass'
			});
		}
		let recipe = this.resolveRecipe(binding.style);
		const shaderKind = this.antiTiling ? surfaceShaderKindFor(recipe) : null;
		if (isShaderLaidOut(shaderKind)) {
			// The shader places the stones; the texture only needs to supply stone grain.
			recipe = this.resolveRecipe({
				...binding.style,
				options: { ...binding.style.options, structure: false }
			});
		}
		binding.shaderKind = shaderKind;
		binding.shaderRecipe = recipe;
		const uvUnit = binding.style.mapping === 'native' ? (binding.options.uvUnitMeters ?? 1) : 1;
		const key = this.textureKey(recipe, uvUnit);
		binding.wantedKey = key;
		if (binding.applied?.key === key) {
			this.assignLook(binding, binding.applied);
			return;
		}
		const ready = this.textureSets.get(key);
		if (ready) {
			this.useSet(binding, ready);
			return;
		}
		this.pendingCount++;
		this.loadSet(recipe, uvUnit, key)
			.then((set) => {
				if (this.disposed) return;
				if (binding.wantedKey === key && this.bindings.get(binding.material) === binding) {
					this.useSet(binding, set);
				} else if (set.references === 0) {
					this.markIdle(set);
				}
			})
			.catch((error) => console.warn('[materials] texture generation failed', error))
			.finally(() => {
				this.pendingCount = Math.max(0, this.pendingCount - 1);
				if (this.pendingCount === 0) this.flushIdleWaiters();
			});
	}

	private async loadSet(
		recipe: ResolvedMaterialRecipe,
		uvUnit: number,
		key: string
	): Promise<TextureSet> {
		const existing = this.textureSets.get(key);
		if (existing) return existing;
		const recipeKey = recipeCacheKey(recipe);
		let dataPromise = this.pendingData.get(recipeKey);
		if (!dataPromise) {
			dataPromise = this.source.generate(recipe);
			this.pendingData.set(recipeKey, dataPromise);
			dataPromise.finally(() => this.pendingData.delete(recipeKey)).catch(() => {});
		}
		const data = await dataPromise;
		const raced = this.textureSets.get(key);
		if (raced) return raced;
		const set = this.createSet(key, data, uvUnit);
		this.textureSets.set(key, set);
		return set;
	}

	private createSet(key: string, data: MaterialMapData, uvUnit: number): TextureSet {
		const make = (pixels: Uint8Array, size: number, colorSpace: THREE.ColorSpace) => {
			const texture = new THREE.DataTexture(
				pixels,
				size,
				size,
				THREE.RGBAFormat,
				THREE.UnsignedByteType
			);
			texture.colorSpace = colorSpace;
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;
			texture.repeat.set(uvUnit / data.tileWidth, uvUnit / data.tileHeight);
			texture.magFilter = THREE.LinearFilter;
			texture.minFilter = THREE.LinearMipmapLinearFilter;
			texture.generateMipmaps = true;
			texture.anisotropy = this.anisotropy;
			texture.needsUpdate = true;
			return texture;
		};
		// ×4/3 for the mip chain.
		const bytes = Math.round(
			(data.albedo.byteLength + data.normal.byteLength + data.orm.byteLength) * (4 / 3)
		);
		return {
			key,
			map: make(data.albedo, data.size, THREE.SRGBColorSpace),
			normalMap: make(data.normal, data.size, THREE.NoColorSpace),
			ormMap: make(data.orm, data.ormSize, THREE.NoColorSpace),
			meanLinear: data.meanLinear,
			references: 0,
			bytes
		};
	}

	private useSet(binding: Binding, set: TextureSet): void {
		if (binding.applied !== set) {
			set.references++;
			const idleIndex = this.idleSets.indexOf(set.key);
			if (idleIndex >= 0) this.idleSets.splice(idleIndex, 1);
			this.releaseSet(binding.applied);
			binding.applied = set;
		}
		this.assignLook(binding, set);
	}

	private assignLook(binding: Binding, set: TextureSet): void {
		const material = binding.material;
		const glass = binding.style.type === 'glass';
		const programChanged =
			material.map !== set.map ||
			material.vertexColors !== (glass ? false : true) ||
			material.normalMap === null;
		material.map = set.map;
		material.normalMap = set.normalMap;
		material.roughnessMap = set.ormMap;
		material.roughness = 1;
		material.metalness = 0;

		const mean = set.meanLinear;
		const laidOut = isShaderLaidOut(binding.shaderKind);
		if (laidOut) {
			// The shader multiplies in palette colours (and any paint as a ratio); the grain map is
			// normalised to an average of 1 so it only adds detail.
			material.color.setRGB(1 / mean[0], 1 / mean[1], 1 / mean[2]);
		} else if (binding.options.tint) {
			const tint = new THREE.Color(binding.options.tint);
			material.color.setRGB(tint.r / mean[0], tint.g / mean[1], tint.b / mean[2]);
		} else if (binding.options.detail) {
			material.color.setRGB(1 / mean[0], 1 / mean[1], 1 / mean[2]);
		} else {
			material.color.setRGB(1, 1, 1);
		}

		if (glass) {
			material.aoMap = null;
			material.vertexColors = false;
			material.opacity = 0.62;
			material.envMapIntensity = 1.6;
			const physical = material as THREE.MeshPhysicalMaterial;
			if (physical.isMeshPhysicalMaterial) {
				physical.ior = 1.5;
				physical.specularIntensity = 1;
			}
		} else {
			material.aoMap = set.ormMap;
			material.aoMapIntensity = 1;
			// Terrain (detail mode) already carries its biome colour in vertex colours; building
			// surfaces get theirs from the binder's weathering pass.
			material.vertexColors = true;
		}
		if (binding.shaderKind && binding.shaderRecipe) {
			const uvUnit = binding.style.mapping === 'native' ? (binding.options.uvUnitMeters ?? 1) : 1;
			configureSurfaceUniforms(
				binding.uniforms,
				binding.shaderRecipe,
				uvUnit,
				laidOut && binding.options.tint ? new THREE.Color(binding.options.tint) : null
			);
		}
		applySurfaceShader(
			material,
			binding.shaderKind,
			binding.uniforms,
			shaderQualityFor(this.quality)
		);
		if (programChanged) material.needsUpdate = true;
	}

	private restoreFlat(binding: Binding): void {
		const material = binding.material;
		const flat = binding.flat;
		applySurfaceShader(material, null, binding.uniforms, 0);
		clearSurfaceMappingSpec(material);
		const programChanged =
			material.map !== flat.map ||
			material.normalMap !== flat.normalMap ||
			material.vertexColors !== flat.vertexColors;
		material.color.copy(flat.color);
		material.roughness = flat.roughness;
		material.metalness = flat.metalness;
		material.vertexColors = flat.vertexColors;
		material.map = flat.map;
		material.normalMap = flat.normalMap;
		material.roughnessMap = flat.roughnessMap;
		material.aoMap = flat.aoMap;
		material.opacity = flat.opacity;
		material.envMapIntensity = flat.envMapIntensity;
		if (programChanged) material.needsUpdate = true;
		this.releaseSet(binding.applied);
		binding.applied = null;
	}

	private releaseSet(set: TextureSet | null): void {
		if (!set) return;
		set.references = Math.max(0, set.references - 1);
		if (set.references === 0) this.markIdle(set);
	}

	private markIdle(set: TextureSet): void {
		if (!this.idleSets.includes(set.key)) this.idleSets.push(set.key);
		while (this.idleSets.length > MAX_IDLE_TEXTURE_SETS) {
			const key = this.idleSets.shift() as string;
			const evicted = this.textureSets.get(key);
			if (evicted && evicted.references === 0) {
				this.disposeSet(evicted);
				this.textureSets.delete(key);
			}
		}
	}

	private disposeSet(set: TextureSet): void {
		set.map.dispose();
		set.normalMap.dispose();
		set.ormMap.dispose();
	}

	private flushIdleWaiters(): void {
		for (const resolve of this.idleWaiters.splice(0)) resolve();
	}
}
