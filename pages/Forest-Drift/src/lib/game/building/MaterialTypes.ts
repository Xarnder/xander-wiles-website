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
export function colorMaterialFromHex(color: string): BuildingMaterialDefinition {
	return { type: 'color', color: normalizeColorHex(color) };
}

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
 * wheel: grouped palettes are faster to choose from than a free picker and keep painted buildings
 * visually coherent with each other. Existing swatch `id`s and hex values are stable (saved colours
 * and tests key off them); new groups/swatches are additions only.
 */
export const DEFAULT_MATERIAL_PALETTE: readonly MaterialPaletteGroup[] = [
	{
		group: 'Neutrals',
		presets: [
			colorPreset('white', 'White', '#FFFFFF'),
			colorPreset('ivory', 'Ivory', '#F4F0E6'),
			colorPreset('light-grey', 'Light Grey', '#D8D8D8'),
			colorPreset('warm-grey', 'Warm Grey', '#B8AFA4'),
			colorPreset('grey', 'Grey', '#9A9A9A'),
			colorPreset('cool-grey', 'Cool Grey', '#7A8490'),
			colorPreset('dark-grey', 'Dark Grey', '#5A5A5A'),
			colorPreset('charcoal', 'Charcoal', '#3A3A3A'),
			colorPreset('black', 'Black', '#1C1C1C')
		]
	},
	{
		group: 'Warm',
		presets: [
			colorPreset('cream', 'Cream', '#F1E7D0'),
			colorPreset('beige', 'Beige', '#E8D5B5'),
			colorPreset('sand', 'Sand', '#D9C9A3'),
			colorPreset('tan', 'Tan', '#C4A574'),
			colorPreset('ochre', 'Ochre', '#C4923A'),
			colorPreset('terracotta', 'Terracotta', '#C1694F'),
			colorPreset('rust', 'Rust', '#A34A2A'),
			colorPreset('brown', 'Brown', '#7A5230'),
			colorPreset('umber', 'Umber', '#4E3423')
		]
	},
	{
		group: 'Cool',
		presets: [
			colorPreset('sky', 'Sky', '#7EB6D9'),
			colorPreset('blue', 'Blue', '#3E6FA6'),
			colorPreset('navy', 'Navy', '#1F3A5F'),
			colorPreset('teal', 'Teal', '#2E8B84'),
			colorPreset('seafoam', 'Seafoam', '#5BA89A'),
			colorPreset('sage', 'Sage', '#7A9A6A'),
			colorPreset('green', 'Green', '#4F8F52'),
			colorPreset('forest', 'Forest', '#2D5A34'),
			colorPreset('slate', 'Slate', '#5C6B7A')
		]
	},
	{
		group: 'Wood',
		presets: [
			colorPreset('birch', 'Birch', '#E6D2A8'),
			colorPreset('pine', 'Pine', '#D4B483'),
			colorPreset('oak', 'Oak', '#C19A6B'),
			colorPreset('honey', 'Honey', '#C48A3A'),
			colorPreset('weathered', 'Weathered', '#8B7355'),
			colorPreset('mahogany', 'Mahogany', '#6B2E1F'),
			colorPreset('walnut', 'Walnut', '#4A2C1A'),
			colorPreset('ebony', 'Ebony', '#2B1B14')
		]
	},
	{
		group: 'Stone',
		presets: [
			colorPreset('marble', 'Marble', '#EDE8E0'),
			colorPreset('limestone', 'Limestone', '#E4DCC8'),
			colorPreset('sandstone', 'Sandstone', '#C9B48A'),
			colorPreset('concrete', 'Concrete', '#9B9B96'),
			colorPreset('granite', 'Granite', '#8A8680'),
			colorPreset('cobble', 'Cobble', '#6E6558'),
			colorPreset('slate-stone', 'Blue Slate', '#4A4E55'),
			colorPreset('brick', 'Brick', '#8B3A2A')
		]
	},
	{
		group: 'Metal',
		presets: [
			colorPreset('zinc', 'Zinc', '#A8B0B8'),
			colorPreset('steel', 'Steel', '#7C848C'),
			colorPreset('iron', 'Iron', '#4A4A4C'),
			colorPreset('lead', 'Lead', '#5A5C5E'),
			colorPreset('copper', 'Copper', '#B87333'),
			colorPreset('bronze', 'Bronze', '#8C6A3A'),
			colorPreset('brass', 'Brass', '#C5A046'),
			colorPreset('gold-leaf', 'Gold Leaf', '#D4AF37')
		]
	},
	{
		group: 'Accent',
		presets: [
			colorPreset('red', 'Red', '#C1443C'),
			colorPreset('crimson', 'Crimson', '#8B1E2D'),
			colorPreset('coral', 'Coral', '#E07A5F'),
			colorPreset('orange', 'Orange', '#D97C33'),
			colorPreset('yellow', 'Yellow', '#E0B23A'),
			colorPreset('gold', 'Gold', '#D4A017'),
			colorPreset('lime', 'Lime', '#8BBF3A'),
			colorPreset('purple', 'Purple', '#7B5AA6'),
			colorPreset('violet', 'Violet', '#5A3D8A'),
			colorPreset('pink', 'Pink', '#C97AA0'),
			colorPreset('magenta', 'Magenta', '#B03A6E')
		]
	},
	{
		group: 'Pastels',
		presets: [
			colorPreset('blush', 'Blush', '#F2C4C4'),
			colorPreset('peach', 'Peach', '#F3C9A7'),
			colorPreset('lemon', 'Lemon', '#F3E4A0'),
			colorPreset('mint-pastel', 'Mint', '#C5E4C8'),
			colorPreset('powder', 'Powder', '#C5D6F0'),
			colorPreset('lilac', 'Lilac', '#D4C4E8'),
			colorPreset('lavender', 'Lavender', '#B8A0D0'),
			colorPreset('rose', 'Rose', '#E8A0B8')
		]
	}
];

/**
 * The kinds of building surface `BuildingMaterialManager` knows how to render — ceilings and floors
 * intentionally share one look (`'slab-floor'`), matching SlabManager's own existing `materialFor()`
 * split (only a flat roof looks different). `'window-frame' | 'door-frame' | 'door-leaf' | 'door-handle'` back the
 * procedural opening visuals (see OpeningVisualBuilder.ts) — routed through this same cache/CSM-
 * registration mechanism so they're architecturally paintable later (a `BuildingMaterialDefinition`
 * override) even though nothing calls `getMaterial` with one yet; window glass is deliberately NOT a
 * `MaterialKind` here, since it needs a `MeshPhysicalMaterial` (transparency/reflection), not the
 * `MeshStandardMaterial` this cache always builds — see OpeningVisualBuilder's own glass material.
 */
export type MaterialKind =
	| 'wall'
	| 'foundation'
	| 'slab-floor'
	| 'slab-roof'
	| 'window-frame'
	| 'door-frame'
	| 'door-leaf'
	/** Latch-side knobs on both faces of a door leaf — see OpeningVisualBuilder.ts. */
	| 'door-handle'
	/** Procedural wall edge framing (vertical posts + top beam) — see WallFrameBuilder.ts. Its own kind so a frame's look stays independently paintable from the wall body it's attached to, same reasoning as the opening-frame kinds above. */
	| 'wall-frame'
	/** Interior baseboards — see SkirtingBuilder.ts. Its own kind so skirting stays a timber colour instead of inheriting the wall's paint. */
	| 'skirting'
	/** Stair solid steps — see StairManager.ts. Own kind so E-customise / a later paint pass can recolour stairs without touching framing. */
	| 'stair'
	/** Stair stringers / railings / newels / nosings — see StairFrameBuilder.ts. Same timber family as wall frames, own kind so a later paint pass can recolour stairs without touching walls. */
	| 'stair-frame'
	/** Trim around a slab stairwell opening — see SlabOpeningFrameBuilder.ts. */
	| 'slab-opening-frame'
	/** Placeable wall timber (Beam tool) — same timber family as wall frames, own kind so a later paint pass can recolour beams without touching framing. */
	| 'wall-beam'
	/** Procedural furniture primary surfaces (wood, stone, metal) — see FurnitureManager.ts. */
	| 'furniture'
	/** Furniture secondary surfaces (fabric, mattress, door panels, metal trim). */
	| 'furniture-accent';
