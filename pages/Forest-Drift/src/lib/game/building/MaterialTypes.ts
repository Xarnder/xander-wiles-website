/**
 * Logical building-material representation — framework- and Three.js-free, same rule as every
 * other *Types.ts file in this project. A painted building object stores ONE of these, never a raw
 * Three.js material or a bare colour string; the render layer (BuildingMaterialManager) is the only
 * place that ever turns one into an actual `THREE.Material` — see its class doc comment.
 *
 * Deliberately a union with exactly one member today, not a bare `{color: string}` shape, so a
 * future `{type: 'texture', textureId: string, scale: number, rotation: number}` variant (or brick/
 * wood/stone/plaster/metal presets built on it) is a new case added to this union and to the
 * `switch` in `BuildingMaterialManager.resolveMaterial` — never a redesign of every place a wall/
 * slab/foundation stores its own material. Do NOT add the texture branch yet (see the README's
 * "Paint Tool" section); this comment exists so the *next* person doesn't have to guess whether the
 * union shape was an accident.
 */
export type BuildingMaterialDefinition = {
	type: 'color';
	color: string;
};

/**
 * A named, reusable `BuildingMaterialDefinition` — what both the default palette's swatches and a
 * player's saved colours actually are. `id` is stable and never reused (a saved colour keeps the
 * same id for its whole lifetime, including across the localStorage round trip — see
 * MaterialPresetStore.ts), so a UI can key a swatch list on it without relying on colour equality.
 */
export interface MaterialPreset {
	id: string;
	name: string;
	definition: BuildingMaterialDefinition;
}

/** One named section of the default palette (`Neutrals`, `Warm`, `Cool`, `Accent`, ...) — grouped for the swatch grid, never mixed with the player's own Saved Colours (see MaterialPresetStore.ts). */
export interface MaterialPaletteGroup {
	group: string;
	presets: MaterialPreset[];
}

const HEX3 = /^#?([0-9a-fA-F]{3})$/;
const HEX6 = /^#?([0-9a-fA-F]{6})$/;

/**
 * The one serializable colour format every part of this system agrees on: uppercase `#RRGGBB`. A
 * 3-digit shorthand (`#fff`) is expanded; anything else throws — callers only ever pass a value that
 * already came from a validated source (a preset, or a native `<input type="color">`, which itself
 * always emits `#rrggbb`), so a malformed string reaching here is a real bug upstream, not a
 * player-triggerable error to swallow silently.
 */
export function normalizeColorHex(input: string): string {
	const hex6 = HEX6.exec(input);
	if (hex6) return `#${hex6[1].toUpperCase()}`;
	const hex3 = HEX3.exec(input);
	if (hex3) {
		const [r, g, b] = hex3[1];
		return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
	}
	throw new Error(`normalizeColorHex: not a hex colour: ${input}`);
}

function colorPreset(id: string, name: string, color: string): MaterialPreset {
	return { id, name, definition: { type: 'color', color: normalizeColorHex(color) } };
}

/**
 * The curated, built-in swatch groups every player sees regardless of what they've saved — see the
 * README's "Paint Tool" section for why these stay a fixed, hand-picked set rather than a raw colour
 * wheel: a small curated palette is faster to choose from and keeps painted buildings visually
 * coherent with each other.
 */
export const DEFAULT_MATERIAL_PALETTE: readonly MaterialPaletteGroup[] = [
	{
		group: 'Neutrals',
		presets: [
			colorPreset('white', 'White', '#FFFFFF'),
			colorPreset('light-grey', 'Light Grey', '#D8D8D8'),
			colorPreset('grey', 'Grey', '#9A9A9A'),
			colorPreset('dark-grey', 'Dark Grey', '#5A5A5A'),
			colorPreset('black', 'Black', '#1C1C1C')
		]
	},
	{
		group: 'Warm',
		presets: [
			colorPreset('cream', 'Cream', '#F1E7D0'),
			colorPreset('sand', 'Sand', '#D9C9A3'),
			colorPreset('terracotta', 'Terracotta', '#C1694F'),
			colorPreset('brown', 'Brown', '#7A5230')
		]
	},
	{
		group: 'Cool',
		presets: [
			colorPreset('blue', 'Blue', '#3E6FA6'),
			colorPreset('teal', 'Teal', '#2E8B84'),
			colorPreset('green', 'Green', '#4F8F52')
		]
	},
	{
		group: 'Accent',
		presets: [
			colorPreset('red', 'Red', '#C1443C'),
			colorPreset('orange', 'Orange', '#D97C33'),
			colorPreset('yellow', 'Yellow', '#E0B23A'),
			colorPreset('purple', 'Purple', '#7B5AA6'),
			colorPreset('pink', 'Pink', '#C97AA0')
		]
	}
];

/**
 * The kinds of building surface `BuildingMaterialManager` knows how to render — ceilings and floors
 * intentionally share one look (`'slab-floor'`), matching SlabManager's own existing `materialFor()`
 * split (only a flat roof looks different). `'window-frame' | 'door-frame' | 'door-leaf'` back the
 * procedural opening visuals (see OpeningVisualBuilder.ts) — routed through this same cache/CSM-
 * registration mechanism so they're architecturally paintable later (a `BuildingMaterialDefinition`
 * override) even though nothing calls `getMaterial` with one yet; window glass is deliberately NOT a
 * `MaterialKind` here, since it needs a `MeshPhysicalMaterial` (transparency/reflection), not the
 * `MeshStandardMaterial` this cache always builds — see OpeningVisualBuilder's own glass material.
 */
export type MaterialKind =
	'wall' | 'foundation' | 'slab-floor' | 'slab-roof' | 'window-frame' | 'door-frame' | 'door-leaf';
