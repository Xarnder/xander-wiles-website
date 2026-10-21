import { PLAYER_BODY, PLAYER_INTERACTION_BODY as BODY } from '../player/PlayerBodyDimensions';
import {
	anchorGrid,
	gridToMeters,
	isSnapAngle,
	newId,
	transformLocalObb,
	type WorldObb
} from './miniBuildGrid';
import {
	MINI_BUILD_LIMITS,
	type GridVec3,
	type MiniBuildDefinition,
	type MiniBuildInstance,
	type MiniBuildInteractionLocation,
	type MiniBuildInteractionType
} from './MiniBuildTypes';

export const MINI_BUILD_INTERACTION_RANGE = 3;
const units = (meters: number) => Math.ceil(meters / MINI_BUILD_LIMITS.gridSize);
export function createInteraction(
	type: MiniBuildInteractionType,
	positionGrid: GridVec3
): MiniBuildInteractionLocation {
	const lying = type === 'lie';
	const heightUnits = units(lying ? BODY.lyingThickness : BODY.seatedHeight);
	const sizeGrid = {
		x: units(BODY.width),
		y: heightUnits + (lying ? heightUnits % 2 : 0),
		z: units(lying ? BODY.lyingLength : BODY.seatedDepth)
	};
	return {
		id: newId(),
		type,
		positionGrid: { ...positionGrid },
		rotationY: 0,
		enabled: true,
		collider: {
			type: 'box',
			sizeGrid,
			centerOffsetGrid: {
				x: 0,
				y: Math.floor(
					sizeGrid.y / 2 - (lying ? 0 : BODY.seatedBelowSupport / MINI_BUILD_LIMITS.gridSize)
				),
				z: lying
					? -units(PLAYER_BODY.standingHeight / 2 - PLAYER_BODY.pelvisHeight)
					: -Math.round(PLAYER_BODY.upperLegLength / 2 / MINI_BUILD_LIMITS.gridSize)
			}
		}
	};
}

export function validateInteractions(
	raw: unknown
): { ok: true; value: MiniBuildInteractionLocation[] } | { ok: false; error: string } {
	const fail = () => ({
		ok: false as const,
		error:
			'Invalid interaction locations: use at most 8 unique Sit/Lie anchors, finite integer grid positions, snapped yaw, and positive box sizes (maximum 4m).'
	});
	if (raw === undefined) return { ok: true, value: [] };
	if (!Array.isArray(raw) || raw.length > MINI_BUILD_LIMITS.maxInteractionLocations) return fail();
	const ids = new Set<string>();
	const record = (v: unknown): v is Record<string, unknown> =>
		!!v && typeof v === 'object' && !Array.isArray(v);
	const vector = (v: unknown, size = false): boolean =>
		record(v) &&
		['x', 'y', 'z'].every(
			(axis) =>
				typeof v[axis] === 'number' &&
				Number.isInteger(v[axis]) &&
				(size
					? (v[axis] as number) > 0 && (v[axis] as number) <= MINI_BUILD_LIMITS.maxBoundsGrid.x
					: Math.abs(v[axis] as number) <= MINI_BUILD_LIMITS.workspaceHalfGrid * 2)
		);
	for (const v of raw) {
		if (
			!record(v) ||
			typeof v.id !== 'string' ||
			!v.id.length ||
			v.id.length > 128 ||
			ids.has(v.id) ||
			!['sit', 'lie'].includes(v.type as string) ||
			!vector(v.positionGrid) ||
			!isSnapAngle(v.rotationY) ||
			typeof v.enabled !== 'boolean' ||
			!record(v.collider) ||
			v.collider.type !== 'box' ||
			!vector(v.collider.centerOffsetGrid) ||
			!vector(v.collider.sizeGrid, true)
		)
			return fail();
		ids.add(v.id);
	}
	return {
		ok: true,
		value: (raw as MiniBuildInteractionLocation[]).map((v) => ({
			id: v.id,
			type: v.type,
			positionGrid: { x: v.positionGrid.x, y: v.positionGrid.y, z: v.positionGrid.z },
			rotationY: v.rotationY,
			enabled: v.enabled,
			collider: {
				type: 'box',
				centerOffsetGrid: {
					x: v.collider.centerOffsetGrid.x,
					y: v.collider.centerOffsetGrid.y,
					z: v.collider.centerOffsetGrid.z
				},
				sizeGrid: { x: v.collider.sizeGrid.x, y: v.collider.sizeGrid.y, z: v.collider.sizeGrid.z }
			}
		}))
	};
}

export interface ResolvedMiniBuildInteraction {
	instanceId: string;
	designId: string;
	revision: number;
	locationId: string;
	type: MiniBuildInteractionType;
	position: GridVec3;
	yaw: number;
	box: WorldObb;
}
export function resolveMiniBuildInteraction(
	definition: MiniBuildDefinition,
	instance: MiniBuildInstance,
	location: MiniBuildInteractionLocation
): ResolvedMiniBuildInteraction {
	const anchor = anchorGrid(definition.bounds);
	const yaw = (instance.rotationY * Math.PI) / 180,
		c = Math.cos(yaw),
		s = Math.sin(yaw);
	const x = gridToMeters(location.positionGrid.x - anchor.x),
		z = gridToMeters(location.positionGrid.z - anchor.z);
	const position = {
		x: instance.position.x + c * x + s * z,
		y: instance.position.y + gridToMeters(location.positionGrid.y - anchor.y),
		z: instance.position.z - s * x + c * z
	};
	const box = location.collider;
	const local = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
	for (const axis of ['x', 'y', 'z'] as const) {
		local.min[axis] = gridToMeters(box.centerOffsetGrid[axis] - box.sizeGrid[axis] / 2);
		local.max[axis] = gridToMeters(box.centerOffsetGrid[axis] + box.sizeGrid[axis] / 2);
	}
	return {
		instanceId: instance.id,
		designId: definition.id,
		revision: definition.revision,
		locationId: location.id,
		type: location.type,
		position,
		yaw: ((instance.rotationY + location.rotationY) * Math.PI) / 180,
		box: transformLocalObb(local.min, local.max, position, instance.rotationY + location.rotationY)
	};
}
