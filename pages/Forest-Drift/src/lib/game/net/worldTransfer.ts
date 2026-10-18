import { migrateWorld } from '../world/WorldMigrationManager';
import { validateWorldDefinition } from '../world/WorldValidation';
import type { WorldDefinition } from '../world/WorldTypes';
import { CURRENT_WORLD_SCHEMA_VERSION } from '../world/WorldTypes';
import { GENERATOR_VERSION, MAX_WORLD_JSON_BYTES } from './protocol';
import type { ReplicaRow } from './WorldReplica';
import { unflattenWorld } from './worldEntities';

export type TransferResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface OnlineWorldManifest {
	worldId: string;
	name: string;
	schemaVersion: number;
	generatorVersion: number;
	publishedAt: string;
	byteLength: number;
}

/** Everything a replica needs to start: rows with their makers and revisions, and the version. */
export interface OnlineWorldSync {
	rows: ReplicaRow[];
	seq: number;
	epoch: number;
	checksum: string;
	/** Player id → name, for "Sam added this" notices. */
	names: Record<string, string>;
}

export interface OnlineWorld {
	manifest: OnlineWorldManifest;
	world: WorldDefinition;
	sync: OnlineWorldSync;
}

/** One invite token per role (Q3-A), returned once, to the publisher. */
export interface PublishedInvites {
	owner: string;
	editor: string;
	viewer: string;
}

/**
 * Publishes a local world as a separate online copy (locked decision Q1-A). The local world itself is
 * never touched. Only the admin can publish (Q2-A): the server checks `adminKey`.
 */
export async function publishWorld(
	serverUrl: string,
	adminKey: string,
	world: WorldDefinition
): Promise<TransferResult<{ worldId: string; name: string; invites: PublishedInvites }>> {
	// Same gate as importing a file: bring it to the current schema and validate it in full, so the
	// server only ever stores worlds every current client can open.
	const checked = checkWorld(world);
	if (!checked.ok) return checked;
	const body = JSON.stringify({ world: checked.value, generatorVersion: GENERATOR_VERSION });
	if (body.length > MAX_WORLD_JSON_BYTES) {
		return { ok: false, error: 'This world is too large to publish (10 MB limit).' };
	}
	try {
		const response = await fetch(`${serverUrl}/w`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminKey}` },
			body
		});
		const payload = (await response.json().catch(() => ({}))) as {
			worldId?: string;
			name?: string;
			invites?: PublishedInvites;
			error?: string;
		};
		if (!response.ok || !payload.worldId || !payload.invites) {
			return { ok: false, error: payload.error ?? `Publishing failed (${response.status}).` };
		}
		return {
			ok: true,
			value: {
				worldId: payload.worldId,
				name: payload.name ?? world.name,
				invites: payload.invites
			}
		};
	} catch {
		return { ok: false, error: "Couldn't reach the multiplayer server." };
	}
}

/**
 * Downloads a published world (invite-only, Q7) and runs it through the same migrate-and-validate
 * path as an import.
 */
export async function fetchOnlineWorld(
	serverUrl: string,
	worldId: string,
	invite: string
): Promise<TransferResult<OnlineWorld>> {
	let payload: {
		manifest?: OnlineWorldManifest;
		base?: Record<string, unknown>;
		rows?: ReplicaRow[];
		seq?: number;
		epoch?: number;
		checksum?: string;
		names?: Record<string, string>;
	};
	try {
		const response = await fetch(`${serverUrl}/w/${encodeURIComponent(worldId)}/snapshot`, {
			headers: { Authorization: `Bearer ${invite}` }
		});
		if (response.status === 404) {
			return { ok: false, error: "That online world doesn't exist (check the link)." };
		}
		if (response.status === 403) {
			return {
				ok: false,
				error: "This invite link isn't valid for that world. Ask the owner for a new one."
			};
		}
		if (!response.ok)
			return { ok: false, error: `The server couldn't load that world (${response.status}).` };
		const text = await response.text();
		if (text.length > MAX_WORLD_JSON_BYTES + 4096) {
			return { ok: false, error: 'That world is larger than the 10 MB limit.' };
		}
		payload = JSON.parse(text) as typeof payload;
	} catch {
		return { ok: false, error: "Couldn't reach the multiplayer server." };
	}

	const manifest = payload.manifest;
	if (!manifest) return { ok: false, error: 'The server sent an unreadable world.' };
	if (
		manifest.schemaVersion !== CURRENT_WORLD_SCHEMA_VERSION ||
		manifest.generatorVersion !== GENERATOR_VERSION
	) {
		return {
			ok: false,
			error:
				'This world was published with a different version of the game. Please refresh the page.'
		};
	}
	if (
		!payload.base ||
		!Array.isArray(payload.rows) ||
		typeof payload.seq !== 'number' ||
		typeof payload.epoch !== 'number'
	) {
		return { ok: false, error: 'The server sent an unreadable world.' };
	}
	// The world is the published base plus its rows, rebuilt into the shapes the game loads.
	const checked = checkWorld({ ...payload.base, ...unflattenWorld(payload.rows) });
	if (!checked.ok) return checked;
	return {
		ok: true,
		value: {
			manifest,
			world: checked.value,
			sync: {
				rows: payload.rows,
				seq: payload.seq,
				epoch: payload.epoch,
				checksum: payload.checksum ?? '',
				names: payload.names ?? {}
			}
		}
	};
}

function checkWorld(raw: unknown): TransferResult<WorldDefinition> {
	const migrated = migrateWorld(raw);
	if (!migrated.ok) return { ok: false, error: migrated.error };
	const validated = validateWorldDefinition(migrated.value);
	if (!validated.ok) return { ok: false, error: `World data is invalid: ${validated.error}` };
	return { ok: true, value: validated.value };
}

export interface RestorePoint {
	id: number;
	seq: number;
	createdAt: string;
	size: number;
}

/** Owner only: the live online world as one record, validated, ready to save as a local copy. */
export async function exportOnlineWorld(
	serverUrl: string,
	worldId: string,
	ownerToken: string
): Promise<TransferResult<WorldDefinition>> {
	try {
		const response = await fetch(`${serverUrl}/w/${encodeURIComponent(worldId)}/export`, {
			headers: { Authorization: `Bearer ${ownerToken}` }
		});
		if (!response.ok) return { ok: false, error: await errorText(response) };
		return checkWorld(await response.json());
	} catch {
		return { ok: false, error: "Couldn't reach the multiplayer server." };
	}
}

/** Owner only: the earlier versions the server keeps (hourly for two days, then daily for 30). */
export async function listRestorePoints(
	serverUrl: string,
	worldId: string,
	ownerToken: string
): Promise<TransferResult<RestorePoint[]>> {
	try {
		const response = await fetch(`${serverUrl}/w/${encodeURIComponent(worldId)}/restore-points`, {
			headers: { Authorization: `Bearer ${ownerToken}` }
		});
		if (!response.ok) return { ok: false, error: await errorText(response) };
		const payload = (await response.json()) as { points?: RestorePoint[] };
		return { ok: true, value: payload.points ?? [] };
	} catch {
		return { ok: false, error: "Couldn't reach the multiplayer server." };
	}
}

/** Owner only: puts the world back to a restore point. Everyone in it reconnects and catches up. */
export async function restoreOnlineWorld(
	serverUrl: string,
	worldId: string,
	ownerToken: string,
	pointId: number
): Promise<TransferResult<true>> {
	try {
		const response = await fetch(`${serverUrl}/w/${encodeURIComponent(worldId)}/restore`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ pointId })
		});
		if (!response.ok) return { ok: false, error: await errorText(response) };
		return { ok: true, value: true };
	} catch {
		return { ok: false, error: "Couldn't reach the multiplayer server." };
	}
}

async function errorText(response: Response): Promise<string> {
	const payload = (await response.json().catch(() => ({}))) as { error?: string };
	return payload.error ?? `The server said no (${response.status}).`;
}
