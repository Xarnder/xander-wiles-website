/**
 * Basements: storeys below a foundation's top (Basements and Joined Foundations, 2026-11-18).
 * Plain, serializable data and the fixed sizes every basement uses. Three.js-free.
 *
 * A basement is a field on the foundation, never a separate thing: the stone walls round it and
 * the footing under it are derived from this definition, and only the floor over it (the deck) and
 * the floors between its storeys are stored, as ordinary slabs with a `role`.
 */

export interface BasementDefinition {
	/** Levels −1 … −storeys: Basement, Lower Basement, Deep Basement. */
	storeys: number;
	/** Metres per storey, the same for each one. */
	storeyHeight: number;
}

/** The slab role a basement creates: the deck over it, and the floors between its storeys. */
export type BasementSlabRole = 'deck' | 'basement-floor';

export const MAX_BASEMENT_STOREYS = 3;
export const MIN_BASEMENT_STOREY_HEIGHT = 2.5;
export const MAX_BASEMENT_STOREY_HEIGHT = 4.5;
export const DEFAULT_BASEMENT_STOREY_HEIGHT = 3;

/** The floor over a basement: its top is the foundation top (local Y = 0). */
export const DECK_THICKNESS = 0.25;
/** The stone walls round a basement, inside the footprint so their outer face is flush with it. */
export const RETAINING_WALL_THICKNESS = 0.3;
/** How far the footing reaches below the lowest floor. */
export const FOOTING_DEPTH = 0.5;

export function isValidBasement(value: unknown): value is BasementDefinition {
	if (!value || typeof value !== 'object') return false;
	const b = value as Record<string, unknown>;
	return (
		typeof b.storeys === 'number' &&
		Number.isInteger(b.storeys) &&
		b.storeys >= 1 &&
		b.storeys <= MAX_BASEMENT_STOREYS &&
		typeof b.storeyHeight === 'number' &&
		Number.isFinite(b.storeyHeight) &&
		b.storeyHeight >= MIN_BASEMENT_STOREY_HEIGHT - 1e-9 &&
		b.storeyHeight <= MAX_BASEMENT_STOREY_HEIGHT + 1e-9
	);
}
