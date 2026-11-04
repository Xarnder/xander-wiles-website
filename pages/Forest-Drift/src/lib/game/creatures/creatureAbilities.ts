/**
 * What a creature can do for the player. Shared by the browser and the multiplayer room, so keep
 * it free of Three.js, DOM and Svelte imports.
 *
 * Plan: docs/2026/11-04/range-weapons (Q2, Q29). v1 has one ability: small quadrupeds are carried
 * under the left arm and fire seed pellets from their mouths.
 */
import type { CreatureDefinition } from './CreatureTypes';
import { creatureDimensions } from './creatureDimensions';

/** Kill switch: false hides every carry prompt, button and HUD and makes nothing carryable. */
export const RANGED_WEAPONS_ENABLED = true;

/** Tallest creature (standing height, metres) that can be tucked under an arm (Q2). */
export const CARRY_MAX_HEIGHT = 0.9;
/** How far from the eye a creature's body may be and still be picked up, metres. */
export const CARRY_REACH = 2;

export type CreatureAbilityId = 'mouth-projectile';

export interface CreatureAbility {
	id: CreatureAbilityId;
	/** How the creature is held: always under the left arm, scaled to fit. */
	carry: { side: 'left' };
}

const MOUTH_PROJECTILE: CreatureAbility = { id: 'mouth-projectile', carry: { side: 'left' } };

/** The creature's standing height at its individual size. */
export function creatureHeight(definition: CreatureDefinition): number {
	return creatureDimensions(definition.species, definition.individual.sizeFactor).height;
}

/** The creature's ability, or null when it can't be carried. */
export function abilityFor(definition: CreatureDefinition): CreatureAbility | null {
	if (!RANGED_WEAPONS_ENABLED) return null;
	if (definition.species.bodyPlan.id !== 'quadruped') return null;
	const height = creatureHeight(definition);
	return Number.isFinite(height) && height <= CARRY_MAX_HEIGHT ? MOUTH_PROJECTILE : null;
}
