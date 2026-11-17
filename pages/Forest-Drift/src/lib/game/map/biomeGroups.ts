import { BIOME_DEFINITIONS } from '../biomes/biomeDefinitions';
import type { BiomeGroup } from '../biomes/BiomeTypes';

/** One group of the full map's Biomes list (Find a biome plan §6, Q1, Q11). */
export interface BiomeListGroup {
	group: BiomeGroup;
	label: string;
	/** Biome indices (into `BIOME_IDS`), in definition order; variants sit with their group. */
	biomes: readonly number[];
}

/** The list's order and labels follow `docs/biomes.md`: Temperate, Cold, Tropical, Warm and dry, Wet. */
const ORDER: readonly { group: BiomeGroup; label: string }[] = [
	{ group: 'temperate', label: 'Temperate' },
	{ group: 'cold', label: 'Cold' },
	{ group: 'tropical', label: 'Tropical' },
	{ group: 'warmDry', label: 'Warm and dry' },
	{ group: 'swamp', label: 'Wet' }
];

export const BIOME_LIST_GROUPS: readonly BiomeListGroup[] = ORDER.map(({ group, label }) => ({
	group,
	label,
	biomes: BIOME_DEFINITIONS.flatMap((def, index) => (def.group === group ? [index] : []))
}));
