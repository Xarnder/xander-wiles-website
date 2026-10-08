import type {
	MaterialPaletteId,
	ProceduralMaterialType,
	ProceduralVariantMap,
	RgbColor
} from './ProceduralMaterialTypes';

/**
 * Art direction for procedural materials. A palette names the colours each material generator
 * reads (`base`, `dark`, `mortar`, …); a generator never hardcodes a colour of its own, so a new
 * palette is a data change only — no generator or world-generation code changes.
 *
 * Only `alpine` is fully tuned (against the reference: warm cream plaster, dark brown beams,
 * charcoal-blue slate, light grey masonry, warm grey paving, rich greens). The others are starting
 * points expressed as overrides on top of it, so they inherit every colour they don't name.
 */

type ColorTable = Record<string, string>;

export interface MaterialPaletteDefinition {
	id: MaterialPaletteId;
	label: string;
	/** Colours shared by every variant of a material type. */
	colors: { [T in ProceduralMaterialType]: ColorTable };
	/** Per-variant colour overrides, merged over `colors[type]`. */
	variantColors: {
		[T in ProceduralMaterialType]?: { [V in ProceduralVariantMap[T]]?: ColorTable };
	};
}

/** Overrides-only shape for palettes derived from another. */
interface PaletteOverrides {
	id: MaterialPaletteId;
	label: string;
	colors?: { [T in ProceduralMaterialType]?: ColorTable };
	variantColors?: MaterialPaletteDefinition['variantColors'];
}

const ALPINE: MaterialPaletteDefinition = {
	id: 'alpine',
	label: 'Alpine timber-framed',
	colors: {
		plaster: {
			base: '#DCCDAE',
			light: '#E9DFC8',
			dark: '#C3B190',
			dirt: '#7A6E5E',
			stain: '#9A8C73',
			moss: '#6B7646'
		},
		timber: {
			base: '#4A3427',
			dark: '#2B1D15',
			light: '#6B4E39',
			weathered: '#6F665B',
			knot: '#24170F'
		},
		slate: {
			base: '#3C434B',
			dark: '#272C32',
			light: '#56606A',
			rust: '#6A5C4D',
			lichen: '#7F8366',
			gap: '#16191C'
		},
		masonry: {
			stone: '#968C7C',
			dark: '#70685C',
			light: '#AFA594',
			mortar: '#857D6E',
			dirt: '#5C5346',
			moss: '#56633A'
		},
		paving: {
			stone: '#9C8C75',
			dark: '#776955',
			light: '#B8A78B',
			joint: '#7A6D5A',
			moss: '#55633A'
		},
		ground: {
			soil: '#6A5641',
			dark: '#47392A',
			pebble: '#9C9486',
			gravel: '#8B8478'
		},
		grass: {
			base: '#557F35',
			dark: '#30521D',
			light: '#82A347',
			dry: '#A99E5D',
			soil: '#5A4631',
			flower: '#E2C24A'
		},
		glass: {
			tint: '#24323A',
			sheen: '#9FB6C2'
		}
	},
	variantColors: {
		timber: {
			'aged-brown': {
				base: '#6C4C33',
				dark: '#43301F',
				light: '#8A694B',
				weathered: '#857B6D',
				knot: '#2E2014'
			},
			weathered: {
				base: '#7B7062',
				dark: '#4D453C',
				light: '#9A9082',
				weathered: '#A39C90',
				knot: '#3A322A'
			},
			fresh: {
				base: '#C79C6C',
				dark: '#9A6F45',
				light: '#DDB98C',
				weathered: '#B9A78E',
				knot: '#7A5232'
			},
			'dark-stained': {
				base: '#33241B',
				dark: '#1B120D',
				light: '#4B3628',
				weathered: '#5A5047',
				knot: '#120B07'
			}
		},
		masonry: {
			fieldstone: { stone: '#A39A88', dark: '#82796A', light: '#BDB4A2' },
			rough: { stone: '#9C978B', dark: '#7C776C', light: '#B5B0A4' }
		},
		paving: {
			flagstone: { stone: '#958E81', dark: '#77705F', light: '#B0A99B' }
		},
		ground: {
			gravel: { soil: '#7C7366', dark: '#5D554B' }
		},
		grass: {
			dry: { base: '#8A8A45', dark: '#5E6230', light: '#B3A65E' },
			detail: {
				base: '#8C9478',
				dark: '#5F6650',
				light: '#ABB291',
				dry: '#B0A783',
				soil: '#6A6052',
				flower: '#C9C2A0'
			}
		}
	}
};

const DERIVED: readonly PaletteOverrides[] = [
	{
		id: 'medieval-village',
		label: 'Medieval village',
		colors: {
			plaster: { base: '#E4DFD2', light: '#F0ECE2', dark: '#C9C2B2' },
			timber: { base: '#3A2A20', dark: '#22170F', light: '#57412F' },
			slate: { base: '#5B5148', dark: '#3E362F', light: '#776B5F' }
		}
	},
	{
		id: 'english-countryside',
		label: 'English countryside',
		colors: {
			plaster: { base: '#E8E1CF', light: '#F3EDDF', dark: '#D0C6AE' },
			timber: { base: '#2E2620', dark: '#1A1511', light: '#463B32' },
			masonry: { stone: '#B9A887', dark: '#9A8A6A', light: '#D2C3A3' },
			grass: { base: '#4F8A3A', dark: '#2F5C22', light: '#7DAA4E' }
		}
	},
	{
		id: 'mountain-lodge',
		label: 'Weathered mountain lodge',
		colors: {
			plaster: { base: '#CFC4AE', dark: '#B3A68D' },
			timber: { base: '#5E4B3B', dark: '#3A2C21', light: '#7C6753', weathered: '#8C8478' },
			slate: { base: '#4A4F55', dark: '#33373C', light: '#666C73' },
			masonry: { stone: '#8F8A80', dark: '#6F6A61', light: '#A9A49A' }
		}
	},
	{
		id: 'old-european-town',
		label: 'Old European town',
		colors: {
			plaster: { base: '#E2C9A0', light: '#EDD9B6', dark: '#C9AC7F' },
			slate: { base: '#34393F', dark: '#22262A', light: '#4C535A' },
			paving: { stone: '#7F786E', dark: '#625C53', light: '#9C958A' }
		}
	}
];

function derivePalette(
	base: MaterialPaletteDefinition,
	overrides: PaletteOverrides
): MaterialPaletteDefinition {
	const colors = { ...base.colors };
	for (const type of Object.keys(overrides.colors ?? {}) as ProceduralMaterialType[]) {
		colors[type] = { ...base.colors[type], ...overrides.colors?.[type] };
	}
	return {
		id: overrides.id,
		label: overrides.label,
		colors,
		variantColors: overrides.variantColors ?? base.variantColors
	};
}

export const MATERIAL_PALETTES: Readonly<Record<MaterialPaletteId, MaterialPaletteDefinition>> =
	Object.fromEntries([
		[ALPINE.id, ALPINE],
		...DERIVED.map((overrides) => [overrides.id, derivePalette(ALPINE, overrides)])
	]) as Record<MaterialPaletteId, MaterialPaletteDefinition>;

export const DEFAULT_MATERIAL_PALETTE_ID: MaterialPaletteId = 'alpine';

/** Parses `#RRGGBB` into sRGB 0..1 components. */
export function hexToRgb(hex: string): RgbColor {
	const value = Number.parseInt(hex.replace('#', ''), 16);
	return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** The named colours a generator sees for `type`/`variant` under `paletteId`, as sRGB triples. */
export function resolvePaletteColors(
	paletteId: MaterialPaletteId,
	type: ProceduralMaterialType,
	variant: string
): Record<string, RgbColor> {
	const palette = MATERIAL_PALETTES[paletteId] ?? MATERIAL_PALETTES[DEFAULT_MATERIAL_PALETTE_ID];
	const variantTable = (palette.variantColors[type] as Record<string, ColorTable> | undefined)?.[
		variant
	];
	const merged: ColorTable = { ...palette.colors[type], ...variantTable };
	const resolved: Record<string, RgbColor> = {};
	for (const name of Object.keys(merged).sort()) resolved[name] = hexToRgb(merged[name]);
	return resolved;
}
