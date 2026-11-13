import type { TreeSpeciesDefinition, TreeSpeciesId } from './TreeSpeciesTypes';

/**
 * The species set: deliberately distinct silhouettes so a forest reads at a glance — round
 * broadleaf, layered pine, narrow cypress, small ornamental, towering spruce spires, slender
 * white birches, tall bare-trunked Scots pines with high flat crowns, and weeping willows.
 * Everything about a species is a rule or a range; the prototype generator turns (species, seeded
 * variant) into a design. Adding a species is adding an entry here (and, for a new canopy kind, a
 * builder in `treePrototypeGenerator.ts`) — never hand-authored meshes.
 *
 * Sizes are metres at placement scale 1. Colours are restrained, slightly warm greens that sit
 * with the Alpine material palette. Heights at scale 1 span ~4 m (ornamental) to ~25 m (spruce);
 * `instanceScale`, `sizeSkew` and `youngFraction` spread each species further, so a stand mixes
 * saplings, ordinary trees and the odd giant.
 */
const BASE_TREE_SPECIES = {
	oak: {
		id: 'oak',
		family: 'broadleaf',
		label: 'Round broadleaf (oak)',
		trunk: {
			height: [2.4, 3.4],
			radius: [0.22, 0.32],
			taper: 0.55,
			bend: [0.02, 0.1],
			branches: [2, 4],
			extendIntoCanopy: 0.45
		},
		canopy: {
			kind: 'blobs',
			clusterCount: [4, 6],
			width: [4.6, 6.2],
			height: [3.8, 5],
			clusterScale: [0.26, 0.36],
			squash: [0.78, 0.92],
			verticalOffset: [0.3, 0.42],
			lumpiness: 0.1
		},
		style: {
			foliageDark: '#2E4F1E',
			foliage: '#4E7A2C',
			foliageLight: '#86A843',
			trunkDark: '#3A2A1C',
			trunk: '#5E4430',
			tintVariation: 0.5
		},
		surface: { bark: 'furrowed', foliage: 'broadleaf' },
		prototypeCount: 3,
		instanceWidthScale: [0.88, 1.15],
		instanceScale: [0.88, 1.35],
		sizeSkew: 1.3,
		youngFraction: 0.08,
		youngScale: [0.45, 0.7],
		cards: [
			{
				layout: 'surface',
				tile: 'oak',
				count: 84,
				length: [1.15, 1.55],
				aspect: 0.85,
				lift: 0.15,
				inset: 0.38
			}
		],
		windResponse: 1,
		triangleBudget: [10800, 2800, 560, 100]
	},
	pine: {
		id: 'pine',
		family: 'pine',
		label: 'Tall pine',
		trunk: {
			height: [1.6, 2.4],
			radius: [0.18, 0.26],
			taper: 0.35,
			bend: [0, 0.03],
			branches: [0, 0],
			extendIntoCanopy: 0.85
		},
		canopy: {
			kind: 'tiers',
			tierCount: [5, 7],
			baseRadius: [2.2, 2.9],
			height: [8.5, 11.5],
			overlap: 0.42,
			droop: [0.25, 0.45],
			rimNotch: 0.82
		},
		style: {
			foliageDark: '#1E3D28',
			foliage: '#2F5A38',
			foliageLight: '#557F4A',
			trunkDark: '#3B2A1E',
			trunk: '#5A4030',
			tintVariation: 0.35
		},
		surface: { bark: 'plated', foliage: 'needles' },
		prototypeCount: 3,
		instanceWidthScale: [0.9, 1.1],
		instanceScale: [0.85, 1.25],
		sizeSkew: 1.2,
		youngFraction: 0.12,
		youngScale: [0.4, 0.7],
		cards: [
			{
				layout: 'rim',
				tile: 'needles',
				count: 13,
				length: [1.1, 1.6],
				aspect: 0.72,
				lift: -0.1,
				inset: 0.42
			}
		],
		windResponse: 0.55,
		triangleBudget: [1800, 540, 176, 116]
	},
	cypress: {
		id: 'cypress',
		family: 'cypress',
		label: 'Slim cypress',
		trunk: {
			height: [0.7, 1.1],
			radius: [0.16, 0.22],
			taper: 0.5,
			bend: [0, 0.02],
			branches: [0, 0],
			extendIntoCanopy: 0.4
		},
		canopy: {
			kind: 'spindle',
			height: [8, 11],
			radius: [0.95, 1.35],
			widestAt: [0.28, 0.4],
			bulges: [3, 5],
			lumpiness: 0.12
		},
		style: {
			foliageDark: '#1C3524',
			foliage: '#2B4C31',
			foliageLight: '#4A6E40',
			trunkDark: '#35281D',
			trunk: '#4E3A2A',
			tintVariation: 0.3
		},
		surface: { bark: 'fibrous', foliage: 'scales' },
		prototypeCount: 2,
		instanceWidthScale: [0.85, 1.12],
		instanceScale: [0.8, 1.2],
		youngFraction: 0.1,
		youngScale: [0.45, 0.7],
		cards: [
			{
				layout: 'surface',
				tile: 'scales',
				count: 58,
				length: [0.8, 1.15],
				aspect: 0.72,
				lift: 1.1,
				inset: 0.45
			}
		],
		windResponse: 0.4,
		triangleBudget: [1000, 360, 130, 64]
	},
	ornamental: {
		id: 'ornamental',
		family: 'ornamental',
		label: 'Small ornamental',
		trunk: {
			height: [1.4, 2],
			radius: [0.12, 0.17],
			taper: 0.6,
			bend: [0.03, 0.12],
			branches: [1, 3],
			extendIntoCanopy: 0.35
		},
		canopy: {
			kind: 'blobs',
			clusterCount: [2, 4],
			width: [2.6, 3.4],
			height: [2.2, 2.9],
			clusterScale: [0.34, 0.44],
			squash: [0.8, 0.95],
			verticalOffset: [0.32, 0.45],
			lumpiness: 0.08
		},
		style: {
			foliageDark: '#3B5A20',
			foliage: '#6A8F33',
			foliageLight: '#A2BE58',
			trunkDark: '#3E2E22',
			trunk: '#6A5038',
			tintVariation: 0.45,
			alternateFoliage: [
				// Warm autumn-turned ornamental — used by one prototype for occasional colour accents.
				{ dark: '#6E4A1C', base: '#A8742C', light: '#D3A452' }
			]
		},
		surface: { bark: 'smooth', foliage: 'small-leaf' },
		prototypeCount: 3,
		instanceWidthScale: [0.9, 1.15],
		instanceScale: [0.8, 1.15],
		cards: [
			{
				layout: 'surface',
				tile: 'small-leaf',
				count: 44,
				length: [0.85, 1.15],
				aspect: 0.85,
				lift: 0.1,
				inset: 0.38
			}
		],
		windResponse: 1.2,
		triangleBudget: [7300, 1900, 380, 100]
	},
	spruce: {
		id: 'spruce',
		family: 'spruce',
		label: 'Towering spruce',
		trunk: {
			height: [2.6, 3.6],
			radius: [0.32, 0.44],
			taper: 0.28,
			bend: [0, 0.015],
			branches: [0, 0],
			extendIntoCanopy: 0.9
		},
		canopy: {
			kind: 'tiers',
			tierCount: [12, 15],
			baseRadius: [2.7, 3.4],
			height: [17, 23],
			overlap: 0.55,
			droop: [0.55, 0.85],
			rimNotch: 0.76,
			taper: 1.1
		},
		style: {
			foliageDark: '#132B1E',
			foliage: '#1F4530',
			foliageLight: '#3B6847',
			trunkDark: '#2E241C',
			trunk: '#5C4C3E',
			tintVariation: 0.3
		},
		surface: { bark: 'plated', foliage: 'needles' },
		prototypeCount: 3,
		instanceWidthScale: [0.85, 1.1],
		instanceScale: [0.8, 1.4],
		sizeSkew: 1.6,
		youngFraction: 0.16,
		youngScale: [0.28, 0.6],
		cards: [
			{
				layout: 'rim',
				tile: 'spruce',
				count: 16,
				length: [1.3, 1.9],
				aspect: 0.75,
				lift: -0.35,
				inset: 0.45
			}
		],
		windResponse: 0.45,
		triangleBudget: [3400, 820, 260, 110]
	},
	birch: {
		id: 'birch',
		family: 'broadleaf',
		label: 'Silver birch',
		trunk: {
			height: [4.6, 6],
			radius: [0.15, 0.21],
			taper: 0.5,
			bend: [0.02, 0.08],
			branches: [3, 5],
			extendIntoCanopy: 0.75
		},
		canopy: {
			kind: 'blobs',
			clusterCount: [5, 7],
			width: [3.4, 4.4],
			height: [7, 9],
			clusterScale: [0.33, 0.4],
			squash: [1, 1.2],
			verticalOffset: [0.4, 0.5],
			lumpiness: 0.14,
			spread: 0.42
		},
		style: {
			foliageDark: '#3F5E22',
			foliage: '#6C9434',
			foliageLight: '#B0CA60',
			trunkDark: '#3A3532',
			trunk: '#E6E2D8',
			tintVariation: 0.45,
			alternateFoliage: [
				// A birch turning gold.
				{ dark: '#76611E', base: '#BE972C', light: '#E6C858' }
			]
		},
		surface: { bark: 'papery', foliage: 'small-leaf' },
		prototypeCount: 3,
		instanceWidthScale: [0.85, 1.15],
		instanceScale: [0.85, 1.2],
		youngFraction: 0.15,
		youngScale: [0.45, 0.7],
		cards: [
			{
				layout: 'surface',
				tile: 'birch',
				count: 96,
				length: [1.2, 1.7],
				aspect: 0.8,
				lift: -0.55,
				inset: 0.32
			}
		],
		windResponse: 1.3,
		triangleBudget: [11800, 3000, 600, 100]
	},
	scotsPine: {
		id: 'scotsPine',
		family: 'pine',
		label: 'Scots pine',
		trunk: {
			height: [11, 14],
			radius: [0.26, 0.34],
			taper: 0.55,
			bend: [0.03, 0.09],
			branches: [3, 5],
			extendIntoCanopy: 0.5
		},
		canopy: {
			kind: 'blobs',
			clusterCount: [4, 6],
			width: [5, 6.6],
			height: [3.6, 4.8],
			clusterScale: [0.22, 0.3],
			squash: [0.58, 0.72],
			verticalOffset: [0.12, 0.25],
			lumpiness: 0.14,
			spread: 0.5
		},
		style: {
			foliageDark: '#1F3A26',
			foliage: '#36593A',
			foliageLight: '#6A8A55',
			trunkDark: '#4A3426',
			trunk: '#B4683A',
			tintVariation: 0.3
		},
		surface: { bark: 'plated', foliage: 'needles' },
		prototypeCount: 2,
		instanceWidthScale: [0.85, 1.15],
		instanceScale: [0.85, 1.3],
		sizeSkew: 1.3,
		youngFraction: 0.1,
		youngScale: [0.5, 0.75],
		cards: [
			{
				layout: 'surface',
				tile: 'needles',
				count: 62,
				length: [1, 1.4],
				aspect: 0.72,
				lift: 0.5,
				inset: 0.36
			}
		],
		windResponse: 0.6,
		triangleBudget: [10400, 2700, 540, 100]
	},
	willow: {
		id: 'willow',
		family: 'weeping',
		label: 'Weeping willow',
		trunk: {
			height: [2.2, 3],
			radius: [0.3, 0.42],
			taper: 0.55,
			bend: [0.06, 0.16],
			branches: [3, 5],
			extendIntoCanopy: 0.5
		},
		canopy: {
			kind: 'blobs',
			clusterCount: [5, 7],
			width: [6.4, 7.8],
			height: [4, 5.2],
			clusterScale: [0.22, 0.29],
			squash: [0.7, 0.85],
			verticalOffset: [0.35, 0.5],
			lumpiness: 0.12,
			spread: 0.2
		},
		style: {
			foliageDark: '#465C20',
			foliage: '#7A983A',
			foliageLight: '#B6C86A',
			trunkDark: '#352A20',
			trunk: '#5E5040',
			tintVariation: 0.35
		},
		surface: { bark: 'furrowed', foliage: 'small-leaf' },
		prototypeCount: 2,
		instanceWidthScale: [0.9, 1.1],
		instanceScale: [0.9, 1.15],
		cards: [
			{
				layout: 'surface',
				tile: 'small-leaf',
				count: 40,
				length: [0.9, 1.2],
				aspect: 0.85,
				lift: -0.15,
				inset: 0.38
			},
			{
				layout: 'hang',
				tile: 'willow',
				count: 58,
				length: [2.2, 4.4],
				aspect: 0.34,
				lift: 0,
				inset: 0.06,
				segments: 3
			}
		],
		windResponse: 1.4,
		triangleBudget: [11800, 3000, 600, 100]
	}
} satisfies Record<string, TreeSpeciesDefinition>;

// ---------------------------------------------------------------------------------- biome variants

/**
 * Biome tint variants (biomes Phase 2): the same shapes as an existing species with a different
 * palette, so they cost a few prototypes rather than new geometry. Crown shading lights the upper
 * crown toward `foliageLight`, so a near-white light reads as snow resting on the tiers.
 */
export const TREE_SPECIES: Readonly<Record<TreeSpeciesId, TreeSpeciesDefinition>> = {
	...BASE_TREE_SPECIES,
	frostedSpruce: {
		...BASE_TREE_SPECIES.spruce,
		id: 'frostedSpruce',
		label: 'Snow-dusted spruce',
		style: {
			...BASE_TREE_SPECIES.spruce.style,
			foliageDark: '#24423A',
			foliage: '#7C948C',
			foliageLight: '#F0F4F5',
			tintVariation: 0.2
		}
	},
	frostedPine: {
		...BASE_TREE_SPECIES.pine,
		id: 'frostedPine',
		label: 'Snow-dusted pine',
		style: {
			...BASE_TREE_SPECIES.pine.style,
			foliageDark: '#26443A',
			foliage: '#7A928A',
			foliageLight: '#EEF3F4',
			tintVariation: 0.2
		}
	},
	warmOak: {
		...BASE_TREE_SPECIES.oak,
		id: 'warmOak',
		label: 'Wind-bronzed oak',
		style: {
			...BASE_TREE_SPECIES.oak.style,
			foliageDark: '#4A3F1C',
			foliage: '#8A6E2C',
			foliageLight: '#C6A24C',
			tintVariation: 0.45
		}
	},

	// ------------------------------------------------------------------- biome species (Phase 3)

	/** Dark Forest: a wide, dense, low-light broadleaf that closes the canopy overhead. */
	darkBroadleaf: {
		...BASE_TREE_SPECIES.oak,
		id: 'darkBroadleaf',
		sharedVariantsFromLod: 2,
		label: 'Dark broadleaf',
		trunk: {
			height: [2.6, 3.6],
			radius: [0.32, 0.45],
			taper: 0.55,
			bend: [0.02, 0.08],
			branches: [3, 5],
			extendIntoCanopy: 0.45
		},
		canopy: {
			kind: 'blobs',
			clusterCount: [5, 7],
			width: [6.6, 8.4],
			height: [4.6, 5.8],
			clusterScale: [0.27, 0.34],
			squash: [0.78, 0.9],
			verticalOffset: [0.3, 0.4],
			lumpiness: 0.1,
			spread: 0.18
		},
		style: {
			foliageDark: '#14280F',
			foliage: '#24401A',
			foliageLight: '#3E6328',
			trunkDark: '#241A12',
			trunk: '#3D2C1F',
			tintVariation: 0.35
		},
		instanceWidthScale: [0.95, 1.2],
		instanceScale: [0.95, 1.35],
		cards: [
			{
				layout: 'surface',
				tile: 'oak',
				count: 96,
				length: [1.2, 1.6],
				aspect: 0.85,
				lift: 0.1,
				inset: 0.4
			}
		],
		triangleBudget: [12800, 3300, 660, 100]
	},
	/** Old Growth Birch Forest: the silver birch, grown tall and old. */
	tallBirch: {
		...BASE_TREE_SPECIES.birch,
		id: 'tallBirch',
		label: 'Old-growth birch',
		trunk: { ...BASE_TREE_SPECIES.birch.trunk, height: [7.5, 10], radius: [0.2, 0.28] },
		canopy: {
			...BASE_TREE_SPECIES.birch.canopy,
			width: [4, 5.2],
			height: [9, 12]
		},
		instanceScale: [0.95, 1.3],
		youngFraction: 0.06
	},
	/** Jungle: tall pale trunks under a broad, layered crown. */
	jungleGiant: {
		...BASE_TREE_SPECIES.oak,
		id: 'jungleGiant',
		sharedVariantsFromLod: 2,
		family: 'broadleaf',
		label: 'Jungle giant',
		trunk: {
			height: [9, 13],
			radius: [0.45, 0.62],
			taper: 0.62,
			bend: [0.02, 0.07],
			branches: [3, 5],
			extendIntoCanopy: 0.4
		},
		canopy: {
			kind: 'blobs',
			clusterCount: [5, 7],
			width: [7.6, 9],
			height: [4.4, 5.8],
			clusterScale: [0.24, 0.31],
			squash: [0.6, 0.74],
			verticalOffset: [0.25, 0.35],
			lumpiness: 0.12,
			spread: 0.12
		},
		style: {
			foliageDark: '#0F3318',
			foliage: '#1F5A2A',
			foliageLight: '#4D8C3C',
			trunkDark: '#3A3226',
			trunk: '#7A6E5A',
			tintVariation: 0.4
		},
		surface: { bark: 'smooth', foliage: 'broadleaf' },
		instanceWidthScale: [0.9, 1.15],
		instanceScale: [0.85, 1.3],
		sizeSkew: 1.4,
		youngFraction: 0.1,
		youngScale: [0.4, 0.65],
		cards: [
			{
				layout: 'surface',
				tile: 'broadleaf',
				count: 104,
				length: [1.3, 1.8],
				aspect: 0.85,
				lift: 0.1,
				inset: 0.4
			}
		],
		windResponse: 0.8,
		triangleBudget: [12800, 3300, 660, 100]
	},
	/** Bamboo Jungle: a stand of jointed green culms with feathery leaf clumps. */
	bamboo: {
		id: 'bamboo',
		// Stands of culms look alike from mid-distance; per-instance scale, turn and tint vary them.
		sharedVariantsFromLod: 1,
		family: 'bamboo',
		label: 'Bamboo',
		// The trunk only sizes the collider around the stand; culms replace it.
		trunk: {
			height: [6, 8],
			radius: [0.45, 0.6],
			taper: 1,
			bend: [0, 0],
			branches: [0, 0],
			extendIntoCanopy: 0
		},
		canopy: {
			kind: 'stalks',
			culmCount: [8, 12],
			height: [7, 10.5],
			radius: [0.05, 0.075],
			spread: [0.35, 0.6],
			lean: [0.05, 0.13],
			leafClumps: [5, 7],
			leafSize: [0.85, 1.2],
			joints: [8, 12],
			lumpiness: 0.16
		},
		style: {
			foliageDark: '#3E6A22',
			foliage: '#6C9A34',
			foliageLight: '#A9C858',
			trunkDark: '#5A7428',
			trunk: '#A3B650',
			tintVariation: 0.35
		},
		surface: { bark: 'smooth', foliage: 'small-leaf' },
		prototypeCount: 3,
		instanceWidthScale: [0.85, 1.15],
		instanceScale: [0.85, 1.2],
		youngFraction: 0.12,
		youngScale: [0.45, 0.7],
		cards: [
			{
				layout: 'surface',
				tile: 'small-leaf',
				count: 72,
				length: [0.8, 1.15],
				aspect: 0.5,
				lift: 0.1,
				inset: 0.35
			}
		],
		windResponse: 1.2,
		triangleBudget: [14500, 3700, 760, 110]
	},
	/** Savanna: a flat, wide umbrella crown on a forked trunk. */
	acacia: {
		...BASE_TREE_SPECIES.oak,
		id: 'acacia',
		label: 'Acacia',
		trunk: {
			height: [3.2, 4.4],
			radius: [0.2, 0.28],
			taper: 0.55,
			bend: [0.06, 0.16],
			branches: [3, 5],
			extendIntoCanopy: 0.25
		},
		canopy: {
			kind: 'blobs',
			clusterCount: [5, 7],
			width: [6.5, 8.5],
			height: [1.4, 2],
			clusterScale: [0.26, 0.33],
			squash: [0.32, 0.42],
			verticalOffset: [0.05, 0.15],
			lumpiness: 0.08,
			spread: 0.03
		},
		style: {
			foliageDark: '#3E4E1C',
			foliage: '#6B7A2C',
			foliageLight: '#A3AE52',
			trunkDark: '#2E241C',
			trunk: '#5B4A38',
			tintVariation: 0.4
		},
		surface: { bark: 'furrowed', foliage: 'small-leaf' },
		instanceWidthScale: [0.9, 1.2],
		instanceScale: [0.85, 1.25],
		cards: [
			{
				layout: 'surface',
				tile: 'small-leaf',
				count: 70,
				length: [0.9, 1.25],
				aspect: 0.8,
				lift: 0.35,
				inset: 0.35
			}
		],
		windResponse: 0.7
	},
	/** Cherry Grove: a small spreading tree in full pink blossom. */
	cherry: {
		...BASE_TREE_SPECIES.oak,
		id: 'cherry',
		label: 'Cherry blossom',
		trunk: {
			height: [1.8, 2.6],
			radius: [0.16, 0.24],
			taper: 0.55,
			bend: [0.04, 0.12],
			branches: [3, 5],
			extendIntoCanopy: 0.4
		},
		canopy: {
			kind: 'blobs',
			clusterCount: [4, 6],
			width: [4.2, 5.4],
			height: [3, 4],
			clusterScale: [0.28, 0.35],
			squash: [0.8, 0.95],
			verticalOffset: [0.3, 0.42],
			lumpiness: 0.12
		},
		style: {
			foliageDark: '#A85475',
			foliage: '#E38CAE',
			foliageLight: '#F8C8DA',
			trunkDark: '#2E1F1C',
			trunk: '#5A3B34',
			tintVariation: 0.35
		},
		surface: { bark: 'smooth', foliage: 'small-leaf' },
		instanceScale: [0.85, 1.2],
		cards: [
			{
				layout: 'surface',
				tile: 'small-leaf',
				count: 90,
				length: [0.9, 1.25],
				aspect: 0.85,
				lift: 0.15,
				inset: 0.38
			}
		],
		windResponse: 1.1
	},
	/** Silverwood: a pale-barked tree with silvery, misty foliage. */
	paleTree: {
		...BASE_TREE_SPECIES.oak,
		id: 'paleTree',
		label: 'Silverwood tree',
		trunk: {
			height: [2.8, 3.8],
			radius: [0.22, 0.3],
			taper: 0.5,
			bend: [0.04, 0.12],
			branches: [3, 5],
			extendIntoCanopy: 0.5
		},
		canopy: {
			kind: 'blobs',
			clusterCount: [4, 6],
			width: [4.6, 6],
			height: [4.6, 6],
			clusterScale: [0.27, 0.35],
			squash: [0.85, 1],
			verticalOffset: [0.32, 0.44],
			lumpiness: 0.12,
			spread: 0.26
		},
		style: {
			foliageDark: '#5C6863',
			foliage: '#98A49E',
			foliageLight: '#D8E0DC',
			trunkDark: '#7A7974',
			trunk: '#C9C7BF',
			tintVariation: 0.25
		},
		surface: { bark: 'papery', foliage: 'small-leaf' },
		cards: [
			{
				layout: 'surface',
				tile: 'small-leaf',
				count: 90,
				length: [1, 1.4],
				aspect: 0.85,
				lift: -0.2,
				inset: 0.36
			}
		],
		windResponse: 1.1
	},
	/** Swamp: a dark, heavy weeping tree with curtains of trailing leaves. */
	swampTree: {
		...BASE_TREE_SPECIES.willow,
		id: 'swampTree',
		label: 'Swamp tree',
		trunk: { ...BASE_TREE_SPECIES.willow.trunk, height: [2.4, 3.4], radius: [0.38, 0.52] },
		style: {
			foliageDark: '#25351A',
			foliage: '#4A5E2A',
			foliageLight: '#7E9046',
			trunkDark: '#2A231B',
			trunk: '#4A3F33',
			tintVariation: 0.3
		}
	},
	/** Desert: a ribbed column with upturned arms. */
	cactus: {
		id: 'cactus',
		family: 'cactus',
		label: 'Cactus',
		// The trunk only sizes the collider around the main column.
		trunk: {
			height: [2, 3],
			radius: [0.3, 0.4],
			taper: 1,
			bend: [0, 0],
			branches: [0, 0],
			extendIntoCanopy: 0
		},
		canopy: {
			kind: 'columnar',
			height: [3, 4.6],
			radius: [0.24, 0.34],
			arms: [0, 3],
			armStart: [0.3, 0.55],
			armReach: [0.55, 0.9],
			armRise: [0.6, 1.4],
			ribs: 8
		},
		style: {
			foliageDark: '#2C4A26',
			foliage: '#4F7A3A',
			foliageLight: '#86A85A',
			trunkDark: '#2C4A26',
			trunk: '#4F7A3A',
			tintVariation: 0.3
		},
		surface: { bark: 'smooth', foliage: 'broadleaf' },
		prototypeCount: 3,
		instanceWidthScale: [0.9, 1.1],
		instanceScale: [0.8, 1.25],
		youngFraction: 0.2,
		youngScale: [0.4, 0.65],
		cards: [],
		windResponse: 0,
		triangleBudget: [2400, 1200, 500, 200]
	}
};

export function getTreeSpecies(id: TreeSpeciesId): TreeSpeciesDefinition {
	return TREE_SPECIES[id];
}

/** Rough full height of a species at scale 1 (trunk + the taller canopy), metres — for bounds and LOD probes. */
export function nominalTreeHeight(species: TreeSpeciesDefinition): number {
	const canopy = species.canopy;
	const trunk = species.trunk.height[1];
	if (canopy.kind === 'tiers') return trunk + canopy.height[1];
	if (canopy.kind === 'spindle') return trunk * 0.6 + canopy.height[1];
	if (canopy.kind === 'stalks') return canopy.height[1] + canopy.leafSize[1] * 0.6;
	if (canopy.kind === 'columnar') return canopy.height[1] + canopy.radius[1];
	return trunk + canopy.height[1] * (canopy.verticalOffset[1] + 0.7);
}
