import { fallDamageSegments } from './fallDamage';
import {
	canRespawn,
	damageHealth,
	healthAt,
	healthSnapshot,
	respawnWaitMs,
	restoreHealth,
	reviveHealth,
	sameHealthSnapshot,
	type DamageSource,
	type HealthSnapshot,
	type HealthState
} from './PlayerHealth';

export interface HealthEvents {
	/** The displayed value, dead flag or low flag changed. */
	change(snapshot: HealthSnapshot): void;
	/** Points were actually taken. */
	damaged(amount: number, source: DamageSource): void;
	/** Health reached zero. `source` is the hit that did it. */
	death(source: DamageSource | null): void;
}

/**
 * Who decides the player's health. Single player decides locally and saves it in the world; an
 * online world asks the room, which owns the real value (see RoomHealthAuthority).
 */
export interface HealthAuthority {
	snapshot(): HealthSnapshot;
	/** A non-immune landing the scene has already checked against water and the world's rule. */
	reportFall(distance: number): void;
	/** Only while dead and past the respawn delay. Returns whether the player is coming back. */
	requestRespawn(): boolean;
	/** Milliseconds left before `requestRespawn` will work, on this authority's own clock. */
	respawnWaitMs(): number;
	/** Called every frame; emits `change` only when the snapshot differs. */
	poll(): void;
	/** Whole points to write into the local world file, or undefined when this authority doesn't save there. */
	savedValue(): number | undefined;
	dispose(): void;
}

/**
 * Notifies `events` of snapshot changes and the transition into death. Shared by both authorities
 * so they report identically.
 */
export class HealthNotifier {
	private last: HealthSnapshot | null = null;
	private lastSource: DamageSource | null = null;

	constructor(private readonly events: HealthEvents) {}

	damaged(amount: number, source: DamageSource): void {
		this.lastSource = source;
		this.events.damaged(amount, source);
	}

	publish(snapshot: HealthSnapshot): void {
		const previous = this.last;
		if (previous && sameHealthSnapshot(previous, snapshot)) return;
		this.last = snapshot;
		this.events.change(snapshot);
		if (snapshot.dead && !previous?.dead) this.events.death(this.lastSource);
	}
}

/** Single player: health lives here and in the world save. `now` is the scene's simulation clock (ms). */
export class LocalHealthAuthority implements HealthAuthority {
	private state: HealthState;
	private readonly notifier: HealthNotifier;

	constructor(
		private readonly now: () => number,
		events: HealthEvents,
		saved?: unknown
	) {
		this.state = restoreHealth(saved, now());
		this.notifier = new HealthNotifier(events);
	}

	snapshot(): HealthSnapshot {
		return healthSnapshot(this.state, this.now());
	}

	reportFall(distance: number): void {
		const source: DamageSource = { kind: 'fall', distance };
		const result = damageHealth(this.state, fallDamageSegments(distance), this.now());
		this.state = result.state;
		if (result.applied > 0) this.notifier.damaged(result.applied, source);
		this.poll();
	}

	respawnWaitMs(): number {
		return respawnWaitMs(this.state, this.now());
	}

	requestRespawn(): boolean {
		if (!canRespawn(this.state, this.now())) return false;
		this.state = reviveHealth(this.now());
		this.poll();
		return true;
	}

	poll(): void {
		this.notifier.publish(this.snapshot());
	}

	savedValue(): number {
		// A save taken while dead stores full health; the scene respawns the player on that load.
		return this.state.dead ? healthAt(reviveHealth(0), 0) : healthAt(this.state, this.now());
	}

	dispose(): void {}
}
