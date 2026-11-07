/**
 * Riding two-legged creatures: which ones can be ridden, where the rider sits and how fast they go.
 * Shared by the browser and the multiplayer room, so keep it free of Three.js, DOM and Svelte.
 *
 * Plan: docs/2026/11-07/bipedal-speed-creature (Q3 B, Q4, Q5, Q6).
 */
import type { CreatureDefinition } from './CreatureTypes';
import { creatureDimensions } from './creatureDimensions';

/** Kill switch: false hides every ride prompt, badge, waypoint and HUD and makes nothing rideable. */
export const CREATURE_RIDING_ENABLED = true;

/**
 * Standing height (metres) from which the rider sits on one shoulder; anything shorter carries the
 * rider astride its neck, a leg over each shoulder (Q4).
 */
export const RIDE_SHOULDER_HEIGHT = 3.5;
/** How far from the eye a creature's body may be and still be climbed onto, metres. */
export const RIDE_REACH = 3;

/** Heights the speed and turn scales span: the smallest and the largest regional bipeds. */
const SMALLEST = 1.2;
const LARGEST = 26;
/** Sprint as a multiple of the world's run speed, smallest to largest (Q3 B: bigger is faster). */
export const RIDE_SPRINT_MIN = 1.2;
export const RIDE_SPRINT_MAX = 1.5;
/** Cruising (no Shift) as a fraction of sprinting. */
export const RIDE_CRUISE_FRACTION = 0.85;
/** Never slower than this, even in a world whose run speed is set very low, m/s. */
export const RIDE_MIN_SPEED = 3;
/** Turn rates (rad/s): small creatures turn sharply, giants in wide arcs. */
const TURN_RATE_SMALL = 2.6;
const TURN_RATE_LARGE = 1;
/** Footfall cadence cap (Hz) while ridden, so a small creature at speed doesn't blur (Q21). */
const MIN_CADENCE_CAP = 5;
const CADENCE_CAP_FACTOR = 2.2;

/** `neck`: astride the neck (small bipeds). `right-shoulder`: on the right shoulder (Q5). */
export type RideSeatKind = 'neck' | 'right-shoulder';

/** How a rideable creature carries its rider. */
export interface RideProfile {
	seat: RideSeatKind;
	/** Standing height at its individual size, metres. */
	height: number;
	/** Speeds as multiples of the world's run speed. */
	sprint: number;
	cruise: number;
	/** Fastest turn, rad/s. */
	turnRate: number;
	/** Fastest footfall cycle while ridden, Hz. */
	maxCadence: number;
}

/** 0 for the smallest biped, 1 for the largest, on a log scale so every height band gets a step. */
function sizeScale(height: number): number {
	const t = (Math.log(height) - Math.log(SMALLEST)) / (Math.log(LARGEST) - Math.log(SMALLEST));
	return Math.max(0, Math.min(1, t));
}

/** Sprint speed as a multiple of the run speed for a creature this tall (Q3 B). */
export function rideSprintMultiplier(height: number): number {
	return RIDE_SPRINT_MIN + (RIDE_SPRINT_MAX - RIDE_SPRINT_MIN) * sizeScale(height);
}

/** Fastest turn for a creature this tall, rad/s. */
export function rideTurnRate(height: number): number {
	return TURN_RATE_SMALL + (TURN_RATE_LARGE - TURN_RATE_SMALL) * sizeScale(height);
}

/** The seat for a creature this tall (Q4, Q5). */
export function rideSeatFor(height: number): RideSeatKind {
	return height >= RIDE_SHOULDER_HEIGHT ? 'right-shoulder' : 'neck';
}

/** How `definition` carries a rider, or null when it can't be ridden (every biped can, Q6). */
export function rideFor(definition: CreatureDefinition): RideProfile | null {
	if (!CREATURE_RIDING_ENABLED || definition.species.bodyPlan.id !== 'biped') return null;
	const height = creatureDimensions(definition.species, definition.individual.sizeFactor).height;
	if (!Number.isFinite(height) || height <= 0) return null;
	const sprint = rideSprintMultiplier(height);
	const runFrequency = definition.species.locomotion.gait.runFrequency;
	return {
		seat: rideSeatFor(height),
		height,
		sprint,
		cruise: sprint * RIDE_CRUISE_FRACTION,
		turnRate: rideTurnRate(height),
		maxCadence: Math.max(MIN_CADENCE_CAP, runFrequency * CADENCE_CAP_FACTOR)
	};
}

/** Top speed (m/s) in a world whose players run at `runSpeed`, cruising or sprinting. */
export function rideTopSpeed(profile: RideProfile, runSpeed: number, sprint: boolean): number {
	const run = Number.isFinite(runSpeed) && runSpeed > 0 ? runSpeed : 0;
	return Math.max(RIDE_MIN_SPEED, run * (sprint ? profile.sprint : profile.cruise));
}

/**
 * How far (horizontally) a player may plausibly be from where an ambient creature's herd lives and
 * still be climbing onto it: from the herd's cell centre, the cell's half-diagonal, plus how far the
 * herd wanders, plus reach and slack. The multiplayer room checks ride claims against this.
 */
export function rideClaimRadius(definition: CreatureDefinition, cellSize: number): number {
	const wander = Math.max(6, definition.species.behaviour.wanderRadius);
	return (cellSize * Math.SQRT2) / 2 + wander * 1.05 + RIDE_REACH + 10;
}
