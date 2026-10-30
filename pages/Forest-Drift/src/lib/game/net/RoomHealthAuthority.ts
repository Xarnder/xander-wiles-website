import { fallDamageSegments } from '../player/fallDamage';
import { HealthNotifier, type HealthAuthority, type HealthEvents } from '../player/HealthAuthority';
import {
	canRespawn,
	createHealthState,
	damageHealth,
	healthAt,
	healthSnapshot,
	reviveHealth,
	type DamageSource,
	type HealthSnapshot,
	type HealthState
} from '../player/PlayerHealth';

/** What the online authority needs from the room connection. */
export interface RoomHealthPort {
	/** False while disconnected: reports would be lost, so falls then are forgiven. */
	connected(): boolean;
	/** The room clock (ms), NaN until the first welcome. */
	serverNow(): number;
	sendFall(id: number, distance: number, at: number): boolean;
	sendRespawn(): boolean;
}

/**
 * Online worlds (Q20, F1): the room owns the player's health. This side predicts each hit so the
 * bar drains at once, reports the fall, and then takes whatever the room sends back — the room's
 * value always wins. Regeneration is derived from the room's timestamps on the room's clock, so
 * both sides agree without any per-point traffic.
 */
export class RoomHealthAuthority implements HealthAuthority {
	private state: HealthState;
	private readonly notifier: HealthNotifier;
	private nextFallId = 1;
	/** Last finite room time seen, for the moments before the clock is seeded. */
	private lastNow = 0;

	constructor(
		private readonly port: RoomHealthPort,
		events: HealthEvents
	) {
		this.notifier = new HealthNotifier(events);
		this.state = createHealthState(0);
	}

	private now(): number {
		const now = this.port.serverNow();
		if (Number.isFinite(now)) this.lastNow = now;
		return this.lastNow;
	}

	snapshot(): HealthSnapshot {
		return healthSnapshot(this.state, this.now());
	}

	/**
	 * The room's answer: a `welcome` or a `health` message. A hit from someone else (`source`) is
	 * reported as damage, so it gets the same flash, sound and death cause as a fall.
	 */
	applyServer(state: HealthState, source?: DamageSource): void {
		const now = this.now();
		const before = healthAt(this.state, now);
		this.state = { ...state };
		const after = healthAt(this.state, now);
		if (source?.kind === 'player' && after < before) this.notifier.damaged(before - after, source);
		this.poll();
	}

	reportFall(distance: number): void {
		if (!this.port.connected()) return;
		const now = this.now();
		const result = damageHealth(this.state, fallDamageSegments(distance), now);
		if (result.applied === 0) return;
		const id = this.nextFallId++;
		if (!this.port.sendFall(id, distance, now)) return;
		this.state = result.state;
		const source: DamageSource = { kind: 'fall', distance };
		this.notifier.damaged(result.applied, source);
		this.poll();
	}

	requestRespawn(): boolean {
		if (!canRespawn(this.state, this.now())) return false;
		this.port.sendRespawn();
		// Close the death card straight away; the room's reply confirms it.
		this.state = reviveHealth(this.now());
		this.poll();
		return true;
	}

	poll(): void {
		this.notifier.publish(this.snapshot());
	}

	/** Online health lives in the room, never in the local world file. */
	savedValue(): undefined {
		return undefined;
	}

	dispose(): void {}
}
