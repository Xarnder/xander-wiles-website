/**
 * Waypoints: places a player wants to find, shown as beacons in the world and on the locator bar
 * while they're turned on. Two kinds:
 *
 * - **Personal** waypoints mark a fixed spot ("Add waypoint here" in the pause menu).
 * - **Dynamic** waypoints follow something that moves. The first is "Nearest carryable creature":
 *   it keeps pointing at the closest small creature that can be picked up and used as a weapon.
 *
 * This follows the marker model in docs/2026/10-22/Multiplayer/multiplayer-social-features.plan.md
 * (§3: a marker is a position plus an icon, a colour and a lifetime, drawn on the locator bar and
 * as a beacon). Waypoints here are the plan's "just me" audience: kept per world in this browser,
 * never sent to the room. Shared waypoints can build on the same records later.
 *
 * No Three.js or DOM: the scene supplies the world through `WaypointHost`.
 */

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

export const NEAREST_CARRYABLE_ID = 'nearest-carryable';
/** Most personal waypoints per world. */
export const MAX_PERSONAL_WAYPOINTS = 20;
/** Waypoint names are trimmed to this many characters (the plan's limit). */
export const MAX_WAYPOINT_NAME = 24;
/** The dynamic waypoint re-checks which creature is nearest this often, ms. */
const RETARGET_MS = 500;
/** A different creature must be this much closer (m) to take over, so the target doesn't flicker. */
const RETARGET_HYSTERESIS = 3;
const STORAGE_PREFIX = 'forest-drift.waypoints.v1:';
const HINTS_KEY = 'forest-drift.carry-hints.v1';

/** Fills for personal waypoints, in order of creation (each is legible with dark or white ink). */
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
	/** Whether `x/y/z` currently mean anything (always for personal waypoints). */
	located: boolean;
	/** Dynamic only: the creature being followed. */
	targetId: string | null;
	targetName: string | null;
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

export function cleanWaypointName(raw: string, fallback: string): string {
	// Control characters out (no regex: keeps the linter's no-control-regex rule happy).
	// Tabs and line breaks become spaces; other control characters are dropped.
	const printable = [...raw]
		.map((c) => (c === '\t' || c === '\n' || c === '\r' ? ' ' : c))
		.filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127);
	const name = printable.join('').replace(/\s+/g, ' ').trim();
	return (name || fallback).slice(0, MAX_WAYPOINT_NAME);
}

export class WaypointSystem {
	private readonly records: WaypointRecord[] = [];
	private readonly nearest: WaypointRecord;
	private storageKey: string | null = null;
	private retargetAt = Number.NEGATIVE_INFINITY;
	private hints = true;
	/** Bumps whenever something the menu shows changes (not distances). */
	revision = 0;

	constructor(
		private readonly host: WaypointHost,
		private readonly storage: WaypointStorage | null = null
	) {
		this.nearest = {
			id: NEAREST_CARRYABLE_ID,
			name: 'Nearest carryable creature',
			label: 'Carryable creature',
			icon: CREATURE_ICON,
			colour: NEAREST_CARRYABLE_COLOUR,
			x: 0,
			y: 0,
			z: 0,
			dynamic: true,
			enabled: false,
			located: false,
			targetId: null,
			targetName: null
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
	 * (null). Personal waypoints belong to a world; switching worlds replaces them.
	 */
	setWorld(key: string | null): void {
		if (key === this.storageKey) return;
		this.storageKey = key;
		this.records.length = 1;
		this.nearest.enabled = false;
		this.clearTarget();
		const saved = this.read();
		if (saved) {
			this.nearest.enabled = saved.nearestCarryable === true;
			for (const p of saved.personal.slice(0, MAX_PERSONAL_WAYPOINTS)) {
				if (typeof p?.id !== 'string' || !finite(p.x, p.y, p.z)) continue;
				this.records.push({
					id: p.id,
					name: cleanWaypointName(String(p.name ?? ''), 'Waypoint'),
					label: cleanWaypointName(String(p.name ?? ''), 'Waypoint'),
					icon: PERSONAL_ICON,
					colour: /^#[0-9a-f]{6}$/i.test(p.colour) ? p.colour : PERSONAL_COLOURS[0]!,
					x: p.x,
					y: p.y,
					z: p.z,
					dynamic: false,
					enabled: p.enabled === true,
					located: true,
					targetId: null,
					targetName: null
				});
			}
		}
		this.retargetAt = Number.NEGATIVE_INFINITY;
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

	/** Turns a waypoint on or off. Turning on the creature waypoint picks a target at once. */
	setEnabled(id: string, on: boolean): void {
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

	/** Adds a personal waypoint where the player stands (turned on). Returns its id, or null when full. */
	addHere(name: string): string | null {
		const personal = this.records.length - 1;
		if (personal >= MAX_PERSONAL_WAYPOINTS) return null;
		const at = this.host.player();
		if (!finite(at.x, at.y, at.z)) return null;
		const id = `wp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
		const clean = cleanWaypointName(name, `Waypoint ${personal + 1}`);
		this.records.push({
			id,
			name: clean,
			label: clean,
			icon: PERSONAL_ICON,
			colour: PERSONAL_COLOURS[personal % PERSONAL_COLOURS.length]!,
			x: at.x,
			y: at.y,
			z: at.z,
			dynamic: false,
			enabled: true,
			located: true,
			targetId: null,
			targetName: null
		});
		this.save();
		this.revision++;
		return id;
	}

	/** Removes a personal waypoint (built-in ones can only be turned off). */
	remove(id: string): boolean {
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
		return false;
	}

	/** Calls `fn` for each waypoint to draw this frame. Allocation-free. */
	forEachActive(fn: (waypoint: ActiveWaypoint) => void): void {
		for (const r of this.records) if (r.enabled && r.located) fn(r);
	}

	/** The id of the creature the dynamic waypoint follows (for the carry badge), or null. */
	get followedCreature(): string | null {
		return this.nearest.enabled ? this.nearest.targetId : null;
	}

	/** The pause menu's list: the creature waypoint first, then personal ones in creation order. */
	list(): WaypointView[] {
		const player = this.host.player();
		const carrying = this.host.carrying();
		return this.records.map((r) => {
			const status: WaypointStatus = !r.enabled
				? 'off'
				: r.dynamic && carrying
					? 'carrying'
					: r.located
						? 'active'
						: 'none';
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
				detail: r.dynamic ? r.targetName : null
			};
		});
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
