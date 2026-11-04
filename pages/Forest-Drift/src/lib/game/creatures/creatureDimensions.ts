import type { SpeciesGenome } from './CreatureTypes';

/**
 * A creature's footprint radius and standing height in metres, at `size` × its reference
 * dimensions. Pure (no Three.js), so the multiplayer room can use it too.
 */
export function creatureDimensions(species: SpeciesGenome, size = 1) {
	const p = species.proportions;
	return {
		radius: Math.max(p.bodyLength * 0.5, p.bodyWidth, p.stanceWidth) * size,
		height: (p.legLength + p.bodyDepth + p.neckLength + p.headSize) * size
	};
}
