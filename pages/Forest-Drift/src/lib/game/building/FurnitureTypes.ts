/**
 * Placeable furniture / items (hotbar 8). v1 is torches only; `kind` is the extension point for
 * later chairs, tables, etc. Positions are world-space so a torch can sit on terrain or a wall
 * without requiring a foundation. `foundationId` is recorded when the mount is on a building so
 * cascade-delete can clear them with the pad.
 */
export type FurnitureKind = 'torch';

export interface FurnitureDefinition {
	id: string;
	kind: FurnitureKind;
	foundationId: string | null;
	x: number;
	y: number;
	z: number;
	/** Outward unit normal of the surface the item is mounted on. */
	nx: number;
	ny: number;
	nz: number;
}

export const FURNITURE_KINDS: readonly FurnitureKind[] = ['torch'];

export const MAX_FURNITURE_ITEMS = 8_000;

export function isFurnitureKind(value: unknown): value is FurnitureKind {
	return value === 'torch';
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/**
 * Structural check for the world `furniture` array. Missing is treated as empty by the caller.
 * A non-null `foundationId` must name a foundation that exists in the same save.
 */
export function validateFurniture(
	value: unknown,
	foundationIds: ReadonlySet<string>
): string | null {
	if (value === undefined) return null;
	if (!Array.isArray(value)) return 'World furniture must be an array';
	if (value.length > MAX_FURNITURE_ITEMS) return 'Too many furniture items';

	const ids = new Set<string>();
	for (const raw of value) {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Invalid furniture item';
		const item = raw as Record<string, unknown>;
		if (!isNonEmptyString(item.id)) return 'Furniture id missing';
		if (ids.has(item.id)) return `Duplicate furniture id: ${item.id}`;
		ids.add(item.id);
		if (!isFurnitureKind(item.kind)) return `Unknown furniture kind: ${String(item.kind)}`;
		if (
			!isFiniteNumber(item.x) ||
			!isFiniteNumber(item.y) ||
			!isFiniteNumber(item.z) ||
			!isFiniteNumber(item.nx) ||
			!isFiniteNumber(item.ny) ||
			!isFiniteNumber(item.nz)
		) {
			return `Furniture ${item.id} must have finite position and normal`;
		}
		if (item.nx ** 2 + item.ny ** 2 + item.nz ** 2 < 1e-8) {
			return `Furniture ${item.id} has a zero mount normal`;
		}
		if (item.foundationId !== null && item.foundationId !== undefined) {
			if (!isNonEmptyString(item.foundationId)) {
				return `Furniture ${item.id} foundationId must be a string or null`;
			}
			if (!foundationIds.has(item.foundationId)) {
				return `Furniture ${item.id} references unknown foundation: ${item.foundationId}`;
			}
		}
	}
	return null;
}
