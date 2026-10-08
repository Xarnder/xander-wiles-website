import type { TreeSpeciesDefinition, TreeSpeciesId } from './TreeSpeciesTypes';

/**
 * The V1 species set: four families with deliberately distinct silhouettes so a forest reads at a
 * glance — round broadleaf, layered pine, narrow cypress, small ornamental. Everything about a
 * species is a rule or a range; the prototype generator turns (species, seeded variant) into a
 * design. Adding a species is adding an entry here (and, for a new canopy kind, a builder in
 * `treePrototypeGenerator.ts`) — never hand-authored meshes.
 *
 * Sizes are metres at placement scale 1. Colours are restrained, slightly warm greens that sit
 * with the Alpine material palette.
 */
export const TREE_SPECIES: Readonly<Record<TreeSpeciesId, TreeSpeciesDefinition>> = {
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
		prototypeCount: 4,
		instanceWidthScale: [0.88, 1.15],
		instanceScale: [0.9, 1.08],
		windResponse: 1,
		triangleBudget: [900, 260, 80, 30]
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
		prototypeCount: 4,
		instanceWidthScale: [0.9, 1.1],
		instanceScale: [0.88, 1.12],
		windResponse: 0.55,
		triangleBudget: [700, 220, 70, 24]
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
		prototypeCount: 3,
		instanceWidthScale: [0.85, 1.12],
		instanceScale: [0.88, 1.1],
		windResponse: 0.4,
		triangleBudget: [520, 180, 60, 32]
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
		prototypeCount: 3,
		instanceWidthScale: [0.9, 1.15],
		instanceScale: [0.85, 1.1],
		windResponse: 1.2,
		triangleBudget: [600, 200, 60, 30]
	}
};

export function getTreeSpecies(id: TreeSpeciesId): TreeSpeciesDefinition {
	return TREE_SPECIES[id];
}
