/**
 * Public waypoints in online worlds: the rules, shared by the room (`RoomCore`) and the browser.
 *
 * A waypoint is **private** (kept only in its creator's browser, never sent anywhere) or **public**
 * (kept by the room, saved with the world, and seen by every player, including people who join
 * later). Seeing and controlling are separate: a public waypoint's creator decides whether other
 * players may also **control** it — turn it on or off for everyone and rename it. Only its creator
 * (and the world's owner, to tidy up) can change who sees or controls it, or remove it.
 *
 * Free of DOM, Three.js and Cloudflare APIs, like `protocol.ts`.
 */

import type { PlayerRole } from './protocol';

/** Public waypoints one player may keep in a world (the same cap as private ones). */
export const MAX_PUBLIC_WAYPOINTS_PER_PLAYER = 20;
/** Public waypoints a world keeps in all. */
export const MAX_PUBLIC_WAYPOINTS_PER_WORLD = 60;
export const MAX_WAYPOINT_NAME = 24;
/** A new public waypoint must be within this many metres of its creator's last known position. */
export const WAYPOINT_MAX_DISTANCE = 2000;
const COORD_LIMIT = 5_000_000;

/** A public waypoint as the room keeps it and every player sees it. */
export interface SharedWaypoint {
	id: string;
	name: string;
	/** `#rrggbb`, chosen by its creator. */
	colour: string;
	/** Feet position. */
	x: number;
	y: number;
	z: number;
	/** On for everyone (beacon and locator bar), or off. */
	on: boolean;
	/** Whether players other than its creator may turn it on and off and rename it. */
	othersCanControl: boolean;
	/** The creator's player id, stamped by the room. */
	owner: string;
	/** The creator's name when it was made, stamped by the room. */
	ownerName: string;
	/** Who last turned it on/off or renamed it, when that wasn't its creator. */
	changedBy?: string;
}

/** What a creator sends to make a waypoint public, or to change its settings. */
export type WaypointDraft = Omit<SharedWaypoint, 'owner' | 'ownerName' | 'changedBy'>;

export type ClientWaypointMessage =
	/** Publish (new id) or, for its creator or the world's owner, change everything but the owner. */
	| { t: 'waypoint'; op: 'put'; waypoint: WaypointDraft }
	/** Turn on or off for everyone, or rename: anyone who may control it. */
	| { t: 'waypoint'; op: 'set'; id: string; on?: boolean; name?: string }
	/** Take it out of the world (its creator going private, or removing it). */
	| { t: 'waypoint'; op: 'remove'; id: string };

export type WaypointRefusal = 'rights' | 'limit' | 'invalid' | 'gone';

/**
 * Changes, sent to everyone. A refusal goes to the sender only, with the waypoint as the room
 * holds it (or its removal), so their copy snaps back.
 */
export interface ServerWaypointsMessage {
	t: 'waypoints';
	put?: SharedWaypoint[];
	remove?: string[];
	refused?: { id: string; reason: WaypointRefusal };
}

/** May change who sees and controls it, move it or remove it: its creator, or the world's owner. */
export function canManageWaypoint(
	waypoint: Pick<SharedWaypoint, 'owner'>,
	playerId: string,
	role: PlayerRole
): boolean {
	return waypoint.owner === playerId || role === 'owner';
}

/** May turn it on and off for everyone and rename it. */
export function canControlWaypoint(
	waypoint: Pick<SharedWaypoint, 'owner' | 'othersCanControl'>,
	playerId: string,
	role: PlayerRole
): boolean {
	return waypoint.othersCanControl || canManageWaypoint(waypoint, playerId, role);
}

/** Tabs and line breaks become spaces, other control characters go, spaces squash, 24 at most. */
export function cleanWaypointName(raw: string, fallback: string): string {
	const printable = [...raw]
		.map((c) => (c === '\t' || c === '\n' || c === '\r' ? ' ' : c))
		.filter((c) => {
			const code = c.charCodeAt(0);
			return code >= 32 && code !== 127;
		});
	const name = printable.join('').replace(/\s+/g, ' ').trim();
	return [...(name || fallback)].slice(0, MAX_WAYPOINT_NAME).join('');
}

const ID = /^[A-Za-z0-9-]{4,48}$/;
const COLOUR = /^#[0-9a-f]{6}$/i;

function finiteCoord(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= COORD_LIMIT;
}

/** A client's `waypoint` message, checked field by field; null when anything is off. */
export function parseWaypointMessage(
	message: Record<string, unknown>
): ClientWaypointMessage | null {
	if (message.t !== 'waypoint') return null;
	if (message.op === 'put') {
		const w = message.waypoint as Record<string, unknown> | null;
		if (!w || typeof w !== 'object') return null;
		if (typeof w.id !== 'string' || !ID.test(w.id)) return null;
		if (typeof w.name !== 'string' || w.name.length > 200) return null;
		const name = cleanWaypointName(w.name, '');
		if (!name) return null;
		if (typeof w.colour !== 'string' || !COLOUR.test(w.colour)) return null;
		if (!finiteCoord(w.x) || !finiteCoord(w.y) || !finiteCoord(w.z)) return null;
		return {
			t: 'waypoint',
			op: 'put',
			waypoint: {
				id: w.id,
				name,
				colour: w.colour.toLowerCase(),
				x: w.x,
				y: w.y,
				z: w.z,
				on: w.on === true,
				othersCanControl: w.othersCanControl === true
			}
		};
	}
	if (typeof message.id !== 'string' || !ID.test(message.id)) return null;
	if (message.op === 'remove') return { t: 'waypoint', op: 'remove', id: message.id };
	if (message.op === 'set') {
		const out: ClientWaypointMessage = { t: 'waypoint', op: 'set', id: message.id };
		if (typeof message.on === 'boolean') out.on = message.on;
		if (message.name !== undefined) {
			if (typeof message.name !== 'string' || message.name.length > 200) return null;
			const name = cleanWaypointName(message.name, '');
			if (!name) return null;
			out.name = name;
		}
		if (out.on === undefined && out.name === undefined) return null;
		return out;
	}
	return null;
}

/** One player acting on the board: who they are, and where the room last saw them (feet). */
export interface WaypointActor {
	playerId: string;
	name: string;
	role: PlayerRole;
	position: { x: number; y: number; z: number } | null;
}

export type WaypointOutcome =
	| { put: SharedWaypoint }
	| { remove: string }
	| { refused: WaypointRefusal; current: SharedWaypoint | null; id: string }
	/** Nothing changed (a repeat of the current state): nobody needs telling. */
	| { unchanged: true };

/**
 * The room's public waypoints: applies players' messages under the rules above, and round-trips
 * through one JSON string for storage. Pure, so the rules are tested without a room.
 */
export class WaypointBoard {
	private readonly items = new Map<string, SharedWaypoint>();

	constructor(savedJson?: string | null) {
		if (!savedJson) return;
		try {
			const saved = JSON.parse(savedJson) as unknown;
			if (!Array.isArray(saved)) return;
			for (const raw of saved.slice(0, MAX_PUBLIC_WAYPOINTS_PER_WORLD)) {
				const parsed = parseWaypointMessage({ t: 'waypoint', op: 'put', waypoint: raw });
				const r = raw as Record<string, unknown>;
				if (
					parsed?.op !== 'put' ||
					typeof r.owner !== 'string' ||
					!r.owner ||
					typeof r.ownerName !== 'string'
				)
					continue;
				this.items.set(parsed.waypoint.id, {
					...parsed.waypoint,
					owner: r.owner,
					ownerName: r.ownerName.slice(0, 40),
					...(typeof r.changedBy === 'string' ? { changedBy: r.changedBy.slice(0, 40) } : {})
				});
			}
		} catch {
			// A damaged record: start with none rather than refuse to open the world.
		}
	}

	get size(): number {
		return this.items.size;
	}

	list(): SharedWaypoint[] {
		return [...this.items.values()].map((w) => ({ ...w }));
	}

	toJson(): string {
		return JSON.stringify([...this.items.values()]);
	}

	apply(message: ClientWaypointMessage, actor: WaypointActor): WaypointOutcome {
		const id = message.op === 'put' ? message.waypoint.id : message.id;
		const current = this.items.get(id) ?? null;
		const refuse = (refused: WaypointRefusal): WaypointOutcome => ({
			refused,
			current: current ? { ...current } : null,
			id
		});

		if (message.op === 'remove') {
			// Already gone: tell the sender so their copy goes too.
			if (!current) return { remove: id };
			if (!canManageWaypoint(current, actor.playerId, actor.role)) return refuse('rights');
			this.items.delete(id);
			return { remove: id };
		}

		if (message.op === 'set') {
			if (!current) return refuse('gone');
			if (!canControlWaypoint(current, actor.playerId, actor.role)) return refuse('rights');
			const next: SharedWaypoint = {
				...current,
				...(message.on !== undefined ? { on: message.on } : {}),
				...(message.name !== undefined ? { name: message.name } : {})
			};
			if (next.on === current.on && next.name === current.name) return { unchanged: true };
			if (actor.playerId === current.owner) delete next.changedBy;
			else next.changedBy = actor.name;
			this.items.set(id, next);
			return { put: { ...next } };
		}

		const draft = message.waypoint;
		if (current) {
			if (!canManageWaypoint(current, actor.playerId, actor.role)) return refuse('rights');
			if (!this.near(draft, actor)) return refuse('invalid');
			const next: SharedWaypoint = {
				...draft,
				owner: current.owner,
				ownerName: current.ownerName,
				...(actor.playerId !== current.owner ? { changedBy: actor.name } : {})
			};
			if (JSON.stringify(next) === JSON.stringify(current)) return { unchanged: true };
			this.items.set(id, next);
			return { put: { ...next } };
		}
		if (!this.near(draft, actor)) return refuse('invalid');
		let mine = 0;
		for (const w of this.items.values()) if (w.owner === actor.playerId) mine++;
		if (
			mine >= MAX_PUBLIC_WAYPOINTS_PER_PLAYER ||
			this.items.size >= MAX_PUBLIC_WAYPOINTS_PER_WORLD
		)
			return refuse('limit');
		const created: SharedWaypoint = {
			...draft,
			owner: actor.playerId,
			ownerName: actor.name.slice(0, 40)
		};
		this.items.set(id, created);
		return { put: { ...created } };
	}

	/** Dropped far from where the room last saw its creator: refused (no planting markers anywhere). */
	private near(draft: WaypointDraft, actor: WaypointActor): boolean {
		const p = actor.position;
		if (!p) return true;
		return Math.hypot(draft.x - p.x, draft.z - p.z) <= WAYPOINT_MAX_DISTANCE;
	}
}
