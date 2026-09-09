/**
 * Placeable furniture / objects (hotbar 8). Positions are world-space so an item can sit on
 * terrain or (for torches) a wall without requiring a foundation. `foundationId` is recorded when
 * the mount is on a building so cascade-delete can clear them with the pad.
 *
 * Optional fields (`rotationY`, `dimensions`, materials, `parameters`) were added without a world
 * schema bump: older torch-only saves omit them and load with catalogue defaults.
 */
import { colorMaterialFromHex, type BuildingMaterialDefinition } from './MaterialTypes';

export const FURNITURE_KINDS = [
	'bed',
	'small-table',
	'wardrobe',
	'chair',
	'stool',
	'bench',
	'table',
	'workbench',
	'kitchen-counter',
	'kitchen-counter-sink',
	'furnace',
	'cupboard',
	'chest',
	'barrel',
	'shelf',
	'bookcase',
	'fireplace',
	'lantern',
	'torch'
] as const;

export type FurnitureKind = (typeof FURNITURE_KINDS)[number];

export interface FurnitureDimensions {
	width: number;
	depth: number;
	height: number;
}

export type FurnitureParameterValue = number | string | boolean;

export interface FurnitureDefinition {
	id: string;
	kind: FurnitureKind;
	foundationId: string | null;
	x: number;
	y: number;
	z: number;
	/** Outward unit normal of the surface the item is mounted on. Floor furniture uses (0, 1, 0). */
	nx: number;
	ny: number;
	nz: number;
	/** Yaw in radians. Snapped to 0/90/180/270 for floor furniture. Ignored for wall-mounted torches. */
	rotationY?: number;
	dimensions?: FurnitureDimensions;
	/** Primary (usually wood) colour. */
	material?: BuildingMaterialDefinition;
	/** Secondary (fabric, stone, metal trim, mattress) colour. */
	secondaryMaterial?: BuildingMaterialDefinition;
	/** Per-type options such as `backrest`, `headboard`, `shelfCount`. */
	parameters?: Record<string, FurnitureParameterValue>;
}

export const MAX_FURNITURE_ITEMS = 8_000;

const KIND_SET = new Set<string>(FURNITURE_KINDS);

export function isFurnitureKind(value: unknown): value is FurnitureKind {
	return typeof value === 'string' && KIND_SET.has(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function isValidColorString(value: unknown): value is string {
	return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function validateOptionalMaterial(
	value: unknown,
	id: string,
	field: string
): string | null {
	if (value === undefined) return null;
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return `Furniture ${id} ${field} must be an object`;
	}
	const material = value as Record<string, unknown>;
	if (material.type !== 'color') return `Furniture ${id} ${field} has an unknown material type`;
	if (!isValidColorString(material.color)) {
		return `Furniture ${id} ${field} has an invalid colour`;
	}
	return null;
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
		if (item.rotationY !== undefined && !isFiniteNumber(item.rotationY)) {
			return `Furniture ${item.id} rotationY must be a finite number`;
		}
		if (item.dimensions !== undefined) {
			if (!item.dimensions || typeof item.dimensions !== 'object' || Array.isArray(item.dimensions)) {
				return `Furniture ${item.id} dimensions must be an object`;
			}
			const dims = item.dimensions as Record<string, unknown>;
			if (
				!isFiniteNumber(dims.width) ||
				!isFiniteNumber(dims.depth) ||
				!isFiniteNumber(dims.height) ||
				dims.width <= 0 ||
				dims.depth <= 0 ||
				dims.height <= 0
			) {
				return `Furniture ${item.id} dimensions must be finite and positive`;
			}
		}
		const materialError = validateOptionalMaterial(item.material, item.id, 'material');
		if (materialError) return materialError;
		const secondaryError = validateOptionalMaterial(
			item.secondaryMaterial,
			item.id,
			'secondaryMaterial'
		);
		if (secondaryError) return secondaryError;
		if (item.parameters !== undefined) {
			if (!item.parameters || typeof item.parameters !== 'object' || Array.isArray(item.parameters)) {
				return `Furniture ${item.id} parameters must be an object`;
			}
			for (const [key, param] of Object.entries(item.parameters as Record<string, unknown>)) {
				if (key.length === 0) return `Furniture ${item.id} has an empty parameter key`;
				const ok =
					typeof param === 'boolean' ||
					typeof param === 'string' ||
					(typeof param === 'number' && Number.isFinite(param));
				if (!ok) return `Furniture ${item.id} parameter ${key} must be a number, string, or boolean`;
			}
		}
	}
	return null;
}

export function furnitureRotationYOf(item: Pick<FurnitureDefinition, 'rotationY'>): number {
	return item.rotationY ?? 0;
}

export function furnitureColorMaterial(
	hex: string | undefined,
	fallback: string
): BuildingMaterialDefinition {
	try {
		return colorMaterialFromHex(hex ?? fallback);
	} catch {
		return colorMaterialFromHex(fallback);
	}
}
