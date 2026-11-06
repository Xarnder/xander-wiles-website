/**
 * Waypoints: places a player wants to find, shown as beacons in the world and on the locator bar
 * while they're turned on. Two kinds:
 *
 * - **Fixed** waypoints mark a spot ("Add here" in the pause menu).
 * - **Dynamic** waypoints follow something that moves. The first is "Nearest carryable creature":
 *   it keeps pointing at the closest small creature that can be picked up and used as a weapon.
 *
 * Who sees them (online worlds; see `net/sharedWaypoints.ts` for the room's side):
 *
 * - **Private** — only this player. Kept per world in this browser, never sent anywhere. Every
 *   waypoint starts private; the creature waypoint always is (creatures wander differently on each
 *   player's screen).
 * - **Public** — every player in the world, including people who join later. Kept by the room and
 *   saved with the world. Its creator chooses whether others may also **control** it (turn it on or
 *   off for everyone, rename it); seeing it and controlling it are separate. Only its creator (or
 *   the world's owner) can change that, make it private again, or remove it.
 *
 * This follows the marker model in docs/2026/10-22/Multiplayer/multiplayer-social-features.plan.md
 * (§3). No Three.js or DOM: the scene supplies the world through `WaypointHost`, and the room
 * through `WaypointLink`.
 */

import {
	canControlWaypoint,
	canManageWaypoint,
	cleanWaypointName as cleanName,
	MAX_WAYPOINT_NAME as SHARED_NAME_LIMIT,
	type ClientWaypointMessage,
	type ServerWaypointsMessage,
	type SharedWaypoint,
	type WaypointRefusal
} from '../net/sharedWaypoints';
import type { PlayerRole } from '../net/protocol';

export interface WaypointPoint {
	x: number;
	y: number;
	z: number;
}

/** Something a dynamic waypoint can follow. */
export interface WaypointTarget extends WaypointPoint {
	id: string;
	/** Shown in the menu ("Moon Ribbon"). */
	name: string;
}

export interface WaypointHost {
	/** The player's feet position. */
	player(): WaypointPoint;
	/** The nearest small creature that can be carried, or null when none is around. */
	nearestCarryable(from: WaypointPoint): WaypointTarget | null;
	/** Where a creature is now, or null when it's gone (unloaded, picked up). */
	creaturePosition(id: string): WaypointPoint | null;
	/** Whether this player is already carrying a creature. */
	carrying(): boolean;
}

/** Key/value storage (localStorage in the browser). Every access may throw. */
export interface WaypointStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** The online world's room, for public waypoints. */
export interface WaypointLink {
	/** This player's id and role in the world. */
	playerId: string;
	role: PlayerRole;
	/** Sends to the room; false when it can't right now (offline). */
	send(message: ClientWaypointMessage): boolean;
}

export const NEAREST_CARRYABLE_ID = 'nearest-carryable';
/** Most private waypoints per world. */
export const MAX_PERSONAL_WAYPOINTS = 20;
/** Waypoint names are trimmed to this many characters (the plan's limit). */
export const MAX_WAYPOINT_NAME = SHARED_NAME_LIMIT;
/** The dynamic waypoint re-checks which creature is nearest this often, ms. */
const RETARGET_MS = 500;
/** A different creature must be this much closer (m) to take over, so the target doesn't flicker. */
const RETARGET_HYSTERESIS = 3;
const STORAGE_PREFIX = 'forest-drift.waypoints.v1:';
const HINTS_KEY = 'forest-drift.carry-hints.v1';

/** Fills for waypoints, in order of creation (each is legible with dark or white ink). */
const PERSONAL_COLOURS = ['#4fb3ff', '#ff7aa8', '#7ddc6f', '#c792ff', '#ffb35c', '#5ce1d6'];
const NEAREST_CARRYABLE_COLOUR = '#f2c14e';
/** Icons: one character each, drawn on the locator bar and the beacon. */
const PERSONAL_ICON = '⚑';
const CREATURE_ICON = '🐾';

export type WaypointStatus =
	/** On, and it has somewhere to point. */
	| 'active'
	/** Off. */
	| 'off'
	/** Dynamic, on, but nothing to follow right now. */
	| 'none'
	/** The creature waypoint while this player already carries one. */
	| 'carrying';

export type WaypointVisibility = 'private' | 'public';

/** One row of the pause menu's waypoint list. */
export interface WaypointView {
	id: string;
	name: string;
	icon: string;
	colour: string;
	enabled: boolean;
	dynamic: boolean;
	status: WaypointStatus;
	/** Horizontal distance from the player, metres (null with nowhere to point). */
	distance: number | null;
	/** What a dynamic waypoint is following ("Moon Ribbon"), or null. */
	detail: string | null;
	visibility: WaypointVisibility;
	/** Public: whether other players may turn it on/off and rename it. */
	othersCanControl: boolean;
	/** Made by this player. */
	mine: boolean;
	/** Someone else's public waypoint: their name. */
	ownerName: string | null;
	/** Who last turned it on/off or renamed it, when that wasn't its creator. */
	changedBy: string | null;
	/** What this player may do with it. */
	canToggle: boolean;
	canRename: boolean;
	canRemove: boolean;
	/** Switch between private and public (own fixed waypoints, online only). */
	canShare: boolean;
	/** Choose whether others may control it (public, and its creator or the world's owner). */
	canSetControl: boolean;
	/** A change this player made is on its way to the room. */
	pending: boolean;
}

/** A waypoint to draw this frame (beacon and locator). Reused objects: read, don't keep. */
export interface ActiveWaypoint extends WaypointPoint {
	id: string;
	name: string;
	/** What the locator bar and beacon say: the name, or what a dynamic waypoint follows. */
	label: string;
	icon: string;
	colour: string;
}

interface WaypointRecord extends ActiveWaypoint {
	dynamic: boolean;
	enabled: boolean;
	/** Whether `x/y/z` currently mean anything (always for fixed waypoints). */
	located: boolean;
	/** Dynamic only: the creature being followed. */
	targetId: string | null;
	targetName: string | null;
	visibility: WaypointVisibility;
	othersCanControl: boolean;
	/** Public: the creator's player id and name. */
	owner: string;
	ownerName: string;
	changedBy: string | null;
	pending: boolean;
}

interface Saved {
	version: 1;
	nearestCarryable: boolean;
	personal: {
		id: string;
		name: string;
		x: number;
		y: number;
		z: number;
		colour: string;
		enabled: boolean;
	}[];
}

function finite(...values: unknown[]): boolean {
	return values.every((v) => typeof v === 'number' && Number.isFinite(v));
}

/** Tabs and line breaks become spaces, other control characters go, spaces squash, 24 at most. */
export function cleanWaypointName(raw: string, fallback: string): string {
	return cleanName(raw, fallback);
}

function fixedRecord(
	fields: Pick<WaypointRecord, 'id' | 'name' | 'colour' | 'x' | 'y' | 'z' | 'enabled'>
): WaypointRecord {
	return {
		...fields,
		label: fields.name,
		icon: PERSONAL_ICON,
		dynamic: false,
		located: true,
		targetId: null,
		targetName: null,
		visibility: 'private',
		othersCanControl: false,
		owner: '',
		ownerName: '',
		changedBy: null,
		pending: false
	};
}

function publicRecord(w: SharedWaypoint): WaypointRecord {
	return {
		...fixedRecord({ ...w, enabled: w.on }),
		visibility: 'public',
		othersCanControl: w.othersCanControl,
		owner: w.owner,
		ownerName: w.ownerName,
		changedBy: w.changedBy ?? null
	};
}

export class WaypointSystem {
	/** The creature waypoint, then this player's private waypoints. */
	private readonly records: WaypointRecord[] = [];
	/** Public waypoints, as the room holds them (with this player's changes on their way). */
	private readonly shared: WaypointRecord[] = [];
	/** Private waypoints being made public: kept to put back if the room says no. */
	private readonly publishing = new Map<string, WaypointRecord>();
	private readonly nearest: WaypointRecord;
	private link: WaypointLink | null = null;
	private storageKey: string | null = null;
	private retargetAt = Number.NEGATIVE_INFINITY;
	private hints = true;
	/** Bumps whenever something the menu shows changes (not distances). */
	revision = 0;
	/** The last thing that didn't work ("Couldn't make Camp public…"), for the menu; null if none. */
	notice: string | null = null;

	constructor(
		private readonly host: WaypointHost,
		private readonly storage: WaypointStorage | null = null
	) {
		this.nearest = {
			...fixedRecord({
				id: NEAREST_CARRYABLE_ID,
				name: 'Nearest carryable creature',
				colour: NEAREST_CARRYABLE_COLOUR,
				x: 0,
				y: 0,
				z: 0,
				enabled: false
			}),
			label: 'Carryable creature',
			icon: CREATURE_ICON,
			dynamic: true,
			located: false
		};
		this.records.push(this.nearest);
		try {
			const raw = storage?.getItem(HINTS_KEY);
			if (raw === 'off') this.hints = false;
		} catch {
			// Storage blocked: hints stay on.
		}
	}

	/**
	 * Loads the waypoints saved for one world (`key`: a local world id, or `online:<id>`), or none
	 * (null). Waypoints belong to a world; switching worlds replaces them.
	 */
	setWorld(key: string | null): void {
		if (key === this.storageKey) return;
		this.storageKey = key;
		this.records.length = 1;
		this.shared.length = 0;
		this.publishing.clear();
		this.notice = null;
		this.nearest.enabled = false;
		this.clearTarget();
		const saved = this.read();
		if (saved) {
			this.nearest.enabled = saved.nearestCarryable === true;
			for (const p of saved.personal.slice(0, MAX_PERSONAL_WAYPOINTS)) {
				if (typeof p?.id !== 'string' || !finite(p.x, p.y, p.z)) continue;
				const name = cleanWaypointName(String(p.name ?? ''), 'Waypoint');
				this.records.push(
					fixedRecord({
						id: p.id,
						name,
						colour: /^#[0-9a-f]{6}$/i.test(p.colour) ? p.colour : PERSONAL_COLOURS[0]!,
						x: p.x,
						y: p.y,
						z: p.z,
						enabled: p.enabled === true
					})
				);
			}
		}
		this.retargetAt = Number.NEGATIVE_INFINITY;
		this.revision++;
	}

	/**
	 * The online world's room (null in single player). Without one there are no public waypoints and
	 * nothing can be shared.
	 */
	setLink(link: WaypointLink | null): void {
		this.link = link;
		if (!link) {
			this.shared.length = 0;
			this.publishing.clear();
		}
		this.revision++;
	}

	/** Everything the room holds, on joining or rejoining: replaces the public list. */
	setShared(list: readonly SharedWaypoint[]): void {
		this.shared.length = 0;
		for (const w of list) this.shared.push(publicRecord(w));
		// Being published when the connection dropped: the room never got it, so ask again.
		for (const [id, original] of this.publishing) {
			if (list.some((w) => w.id === id)) this.publishing.delete(id);
			else if (!this.sendPut(original, original.enabled, false)) this.restorePrivate(id);
			else this.shared.push(this.pendingPublic(original));
		}
		this.revision++;
	}

	/** A change from the room: someone (perhaps this player) changed public waypoints. */
	applyShared(message: ServerWaypointsMessage): void {
		for (const w of message.put ?? []) {
			const index = this.shared.findIndex((r) => r.id === w.id);
			const record = publicRecord(w);
			if (index >= 0) this.shared[index] = record;
			else this.shared.push(record);
			this.publishing.delete(w.id);
		}
		for (const id of message.remove ?? []) {
			const index = this.shared.findIndex((r) => r.id === id);
			if (index >= 0) this.shared.splice(index, 1);
			// Refused while being made public: it stays private.
			if (message.refused?.id === id && this.publishing.has(id)) this.restorePrivate(id);
		}
		if (message.refused) this.refusedNotice(message.refused.id, message.refused.reason);
		this.revision++;
	}

	/** Whether small creatures that can be carried get a floating badge. A per-player preference. */
	get carryHints(): boolean {
		return this.hints;
	}

	setCarryHints(on: boolean): void {
		if (on === this.hints) return;
		this.hints = on;
		try {
			this.storage?.setItem(HINTS_KEY, on ? 'on' : 'off');
		} catch {
			// Not saved; still applies for this session.
		}
		this.revision++;
	}

	/**
	 * Turns a waypoint on or off. Turning on the creature waypoint picks a target at once; a public
	 * one turns on or off for everyone (when this player may control it).
	 */
	setEnabled(id: string, on: boolean): void {
		const shared = this.findShared(id);
		if (shared) {
			if (shared.enabled === on || !this.may('control', shared)) return;
			this.sendShared(shared, { t: 'waypoint', op: 'set', id, on }, () => (shared.enabled = on));
			return;
		}
		const record = this.records.find((r) => r.id === id);
		if (!record || record.enabled === on) return;
		record.enabled = on;
		if (record.dynamic) {
			this.clearTarget();
			this.retargetAt = Number.NEGATIVE_INFINITY;
		}
		this.save();
		this.revision++;
	}

	/** Renames a waypoint (a public one for everyone, when this player may control it). */
	rename(id: string, name: string): boolean {
		const shared = this.findShared(id);
		const record = shared ?? this.records.find((r) => r.id === id && !r.dynamic);
		if (!record) return false;
		const clean = cleanWaypointName(name, '');
		if (!clean || clean === record.name) return false;
		if (shared) {
			if (!this.may('control', shared)) return false;
			return this.sendShared(shared, { t: 'waypoint', op: 'set', id, name: clean }, () => {
				shared.name = clean;
				shared.label = clean;
			});
		}
		record.name = clean;
		record.label = clean;
		this.save();
		this.revision++;
		return true;
	}

	/**
	 * Private ↔ public for this player's own fixed waypoints, online. Public: everyone in the world
	 * sees it; private again: it leaves the room and everyone else's screen.
	 */
	setVisibility(id: string, visibility: WaypointVisibility): boolean {
		const link = this.link;
		if (!link) return false;
		if (visibility === 'public') {
			const index = this.records.findIndex((r) => r.id === id && !r.dynamic);
			if (index < 0) return false;
			const original = this.records[index]!;
			if (!this.sendPut(original, original.enabled, false)) return false;
			this.records.splice(index, 1);
			this.publishing.set(id, original);
			this.shared.push(this.pendingPublic(original));
			this.save();
			this.revision++;
			return true;
		}
		const shared = this.findShared(id);
		if (!shared || shared.owner !== link.playerId) return false;
		if (this.records.length - 1 >= MAX_PERSONAL_WAYPOINTS) {
			this.notice = `You already have ${MAX_PERSONAL_WAYPOINTS} private waypoints here.`;
			this.revision++;
			return false;
		}
		if (!link.send({ t: 'waypoint', op: 'remove', id })) return this.offline();
		this.shared.splice(this.shared.indexOf(shared), 1);
		this.records.push(fixedRecord(shared));
		this.save();
		this.notice = null;
		this.revision++;
		return true;
	}

	/** Whether other players may turn a public waypoint on/off and rename it. */
	setOthersCanControl(id: string, allowed: boolean): boolean {
		const shared = this.findShared(id);
		if (!shared || shared.othersCanControl === allowed || !this.may('manage', shared)) return false;
		return this.sendShared(
			shared,
			{
				t: 'waypoint',
				op: 'put',
				waypoint: {
					id,
					name: shared.name,
					colour: shared.colour,
					x: shared.x,
					y: shared.y,
					z: shared.z,
					on: shared.enabled,
					othersCanControl: allowed
				}
			},
			() => (shared.othersCanControl = allowed)
		);
	}

	/** Adds a private waypoint where the player stands (turned on). Returns its id, or null when full. */
	addHere(name: string): string | null {
		const count = this.records.length - 1;
		if (count >= MAX_PERSONAL_WAYPOINTS) return null;
		const at = this.host.player();
		if (!finite(at.x, at.y, at.z)) return null;
		const id = `wp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
		this.records.push(
			fixedRecord({
				id,
				name: cleanWaypointName(name, `Waypoint ${count + 1}`),
				colour: PERSONAL_COLOURS[(count + this.ownShared()) % PERSONAL_COLOURS.length]!,
				x: at.x,
				y: at.y,
				z: at.z,
				enabled: true
			})
		);
		this.save();
		this.revision++;
		return id;
	}

	/** Removes a waypoint: a private one, or a public one this player may manage (for everyone). */
	remove(id: string): boolean {
		const shared = this.findShared(id);
		if (shared) {
			if (!this.may('manage', shared)) return false;
			if (!this.link!.send({ t: 'waypoint', op: 'remove', id })) return this.offline();
			this.shared.splice(this.shared.indexOf(shared), 1);
			this.notice = null;
			this.revision++;
			return true;
		}
		const index = this.records.findIndex((r) => r.id === id && !r.dynamic);
		if (index < 0) return false;
		this.records.splice(index, 1);
		this.save();
		this.revision++;
		return true;
	}

	/** Moves dynamic waypoints to what they follow. Call every frame; retargeting is throttled. */
	update(nowMs: number): void {
		const record = this.nearest;
		if (!record.enabled || this.host.carrying()) {
			if (record.located) this.clearTarget();
			return;
		}
		// Follow the current creature as it moves.
		if (record.targetId) {
			const at = this.host.creaturePosition(record.targetId);
			if (at) {
				record.x = at.x;
				record.y = at.y;
				record.z = at.z;
			} else {
				this.clearTarget();
				this.retargetAt = Number.NEGATIVE_INFINITY;
			}
		}
		if (nowMs < this.retargetAt) return;
		this.retargetAt = nowMs + RETARGET_MS;
		const player = this.host.player();
		const found = this.host.nearestCarryable(player);
		if (!found) {
			if (record.located) this.clearTarget();
			return;
		}
		if (record.targetId && record.targetId !== found.id) {
			const current = Math.hypot(record.x - player.x, record.z - player.z);
			const next = Math.hypot(found.x - player.x, found.z - player.z);
			if (next > current - RETARGET_HYSTERESIS) return;
		}
		if (record.targetId !== found.id) this.revision++;
		record.targetId = found.id;
		record.targetName = found.name;
		record.label = found.name;
		record.x = found.x;
		record.y = found.y;
		record.z = found.z;
		record.located = true;
	}

	/** Whether any waypoint is on and has somewhere to point. */
	get anyActive(): boolean {
		for (const r of this.records) if (r.enabled && r.located) return true;
		for (const r of this.shared) if (r.enabled) return true;
		return false;
	}

	/** Calls `fn` for each waypoint to draw this frame. Allocation-free. */
	forEachActive(fn: (waypoint: ActiveWaypoint) => void): void {
		for (const r of this.records) if (r.enabled && r.located) fn(r);
		for (const r of this.shared) if (r.enabled) fn(r);
	}

	/** The id of the creature the dynamic waypoint follows (for the carry badge), or null. */
	get followedCreature(): string | null {
		return this.nearest.enabled ? this.nearest.targetId : null;
	}

	/**
	 * The pause menu's list: the creature waypoint, this player's own (private, then public), then
	 * other players' public ones.
	 */
	list(): WaypointView[] {
		const player = this.host.player();
		const carrying = this.host.carrying();
		const me = this.link?.playerId ?? null;
		const own = this.shared.filter((r) => r.owner === me);
		const others = this.shared.filter((r) => r.owner !== me);
		return [...this.records, ...own, ...others].map((r) => {
			const status: WaypointStatus = !r.enabled
				? 'off'
				: r.dynamic && carrying
					? 'carrying'
					: r.located
						? 'active'
						: 'none';
			const isPublic = r.visibility === 'public';
			const mine = !isPublic || r.owner === me;
			const control = !isPublic || this.may('control', r);
			const manage = !isPublic || this.may('manage', r);
			return {
				id: r.id,
				name: r.name,
				icon: r.icon,
				colour: r.colour,
				enabled: r.enabled,
				dynamic: r.dynamic,
				status,
				distance:
					status === 'active' || (!r.dynamic && r.located)
						? Math.hypot(r.x - player.x, r.z - player.z)
						: null,
				detail: r.dynamic ? r.targetName : null,
				visibility: r.visibility,
				othersCanControl: r.othersCanControl,
				mine,
				ownerName: mine ? null : r.ownerName,
				changedBy: r.changedBy,
				canToggle: control,
				canRename: !r.dynamic && control,
				canRemove: !r.dynamic && manage,
				canShare: !!this.link && !r.dynamic && mine,
				canSetControl: isPublic && manage,
				pending: r.pending
			};
		});
	}

	private may(what: 'control' | 'manage', record: WaypointRecord): boolean {
		const link = this.link;
		if (!link) return false;
		return what === 'control'
			? canControlWaypoint(record, link.playerId, link.role)
			: canManageWaypoint(record, link.playerId, link.role);
	}

	private findShared(id: string): WaypointRecord | undefined {
		return this.shared.find((r) => r.id === id);
	}

	private ownShared(): number {
		const me = this.link?.playerId;
		return me ? this.shared.filter((r) => r.owner === me).length : 0;
	}

	/** Applies a change to a public waypoint straight away and sends it; undone if offline. */
	private sendShared(
		record: WaypointRecord,
		message: ClientWaypointMessage,
		apply: () => void
	): boolean {
		if (!this.link?.send(message)) return this.offline();
		apply();
		record.pending = true;
		this.notice = null;
		this.revision++;
		return true;
	}

	private sendPut(record: WaypointRecord, on: boolean, othersCanControl: boolean): boolean {
		const sent = !!this.link?.send({
			t: 'waypoint',
			op: 'put',
			waypoint: {
				id: record.id,
				name: record.name,
				colour: record.colour,
				x: record.x,
				y: record.y,
				z: record.z,
				on,
				othersCanControl
			}
		});
		if (!sent) this.offline();
		return sent;
	}

	private pendingPublic(original: WaypointRecord): WaypointRecord {
		return {
			...original,
			visibility: 'public',
			othersCanControl: false,
			owner: this.link?.playerId ?? '',
			ownerName: '',
			changedBy: null,
			pending: true
		};
	}

	private restorePrivate(id: string): void {
		const original = this.publishing.get(id);
		this.publishing.delete(id);
		const index = this.shared.findIndex((r) => r.id === id);
		if (index >= 0) this.shared.splice(index, 1);
		if (!original || this.records.some((r) => r.id === id)) return;
		this.records.push({ ...original, pending: false });
		this.save();
	}

	private offline(): false {
		this.notice = 'Not connected to the world right now: try again in a moment.';
		this.revision++;
		return false;
	}

	private refusedNotice(id: string, reason: WaypointRefusal): void {
		const name =
			this.findShared(id)?.name ?? this.records.find((r) => r.id === id)?.name ?? 'That waypoint';
		this.notice =
			reason === 'limit'
				? `Couldn't make “${name}” public: a player can share 20 waypoints, and a world 60.`
				: reason === 'rights'
					? `You can't change “${name}”: its creator controls it.`
					: reason === 'gone'
						? `“${name}” was removed.`
						: `Couldn't share “${name}” from here.`;
	}

	private clearTarget(): void {
		this.nearest.targetId = null;
		this.nearest.targetName = null;
		this.nearest.located = false;
	}

	private read(): Saved | null {
		if (!this.storageKey || !this.storage) return null;
		try {
			const raw = this.storage.getItem(STORAGE_PREFIX + this.storageKey);
			if (!raw) return null;
			const value = JSON.parse(raw) as Saved;
			return value && value.version === 1 && Array.isArray(value.personal) ? value : null;
		} catch {
			return null;
		}
	}

	/** Private waypoints only: public ones are kept by the room. */
	private save(): void {
		if (!this.storageKey || !this.storage) return;
		const saved: Saved = {
			version: 1,
			nearestCarryable: this.nearest.enabled,
			personal: this.records
				.filter((r) => !r.dynamic)
				.map((r) => ({
					id: r.id,
					name: r.name,
					x: r.x,
					y: r.y,
					z: r.z,
					colour: r.colour,
					enabled: r.enabled
				}))
		};
		try {
			this.storage.setItem(STORAGE_PREFIX + this.storageKey, JSON.stringify(saved));
		} catch {
			// Storage full or blocked: the waypoints still work until the page closes.
		}
	}
}
