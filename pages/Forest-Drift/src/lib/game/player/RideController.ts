/**
 * Riding a biped: climbing on and off, steering every frame, the online claim, and what the HUD
 * shows. The scene supplies the world through `RideHost`, so this has no Three.js or DOM
 * dependencies. Carrying runs alongside it (`CarryController`); the scene decides which one `K`
 * goes to (`creatureKeyRouting.ts`).
 *
 * Plan: docs/2026/11-07/bipedal-speed-creature/feature-plan/02-technical-plan.md §3.3, §4.6.
 */
import {
	CREATURE_RIDING_ENABLED,
	RIDE_REACH,
	type RideProfile,
	type RideSeatKind
} from '../creatures/creatureRiding';
import { NO_RIDE_INPUT, type RideInput } from '../creatures/CreatureRideMotion';
import type { CreatureDefinition } from '../creatures/CreatureTypes';
import type { Vec3Like } from './creatureProjectile';

/** "Can't go that way" is said at most this often, seconds. */
const BLOCKED_NOTICE_INTERVAL = 3;
/** How often the creature under the crosshair is looked for, seconds. */
const TARGET_INTERVAL = 0.1;

export interface RideCandidate {
	id: string;
	definition: CreatureDefinition;
	/** Distance along the look ray, metres. */
	distance: number;
}

export interface RideClaimResult {
	ok: boolean;
	/** Why the room said no ('taken', 'far', 'ineligible', 'role', 'state', 'timeout'). */
	reason?: string;
}

export interface RideHost {
	/** Eye position and unit look direction (the crosshair ray). */
	eye(): Vec3Like;
	aim(): Vec3Like;
	/** The player is playing (pointer locked, no menu or overlay open). */
	inputAllowed(): boolean;
	/** Climbing on isn't possible right now (flying, seated, knocked out). */
	cannotMount(): boolean;
	pick(eye: Vec3Like, dir: Vec3Like, reach: number): RideCandidate | null;
	/** Online only: asks the room for the creature first. Absent in single player. */
	claim?(id: string): Promise<RideClaimResult>;
	/** Hands the creature to the rider and starts the climb on; null when it can't be ridden now. */
	mount(id: string): RideProfile | null;
	/** Whether the player is still on (or climbing onto) the mount. */
	seated(): boolean;
	isRidden(id: string): boolean;
	/** Camera-relative steering this frame. */
	input(): RideInput;
	/** Moves the mount for this frame; `blocked` when it couldn't go where it was steered. */
	steer(input: RideInput, dt: number): { blocked: boolean };
	/** Climbs off onto safe ground (`instant`: no blend, e.g. knocked out) and lets the mount go. */
	dismount(id: string, instant: boolean): void;
	/** The ride ended without climbing off (teleported, world replaced): let the mount go as it is. */
	abandon(id: string): void;
}

/** What the HUD shows. */
export interface RideState {
	riding: boolean;
	species: string | null;
	seat: RideSeatKind | null;
}

export interface RideEvents {
	change(state: RideState): void;
	mounted(species: string): void;
	dismounted(species: string): void;
	/** The room refused a climb on (online). */
	refused?(reason: string): void;
	/** Steered into something the mount can't cross (said at most every few seconds). */
	blocked?(): void;
}

const NOT_RIDING: RideState = { riding: false, species: null, seat: null };

export class RideController {
	private ridden: { id: string; definition: CreatureDefinition; profile: RideProfile } | null =
		null;
	/** Online: a climb on waiting for the room's answer. */
	private claiming: RideCandidate | null = null;
	private candidate: RideCandidate | null = null;
	private targetElapsed = Infinity;
	private time = 0;
	private lastBlockedNotice = -Infinity;
	private lastState: RideState = NOT_RIDING;

	constructor(
		private readonly host: RideHost,
		private readonly events: RideEvents
	) {}

	get riding(): boolean {
		return !!this.ridden;
	}

	get riddenId(): string | null {
		return this.ridden?.id ?? null;
	}

	/** True while an online climb on waits for the room. */
	get pending(): boolean {
		return !!this.claiming;
	}

	/** Species waiting for the room's answer, for the prompt. */
	get pendingSpecies(): string | null {
		return this.claiming?.definition.species.name ?? null;
	}

	/** The rideable creature under the crosshair (refreshed ten times a second). */
	get target(): RideCandidate | null {
		return this.candidate;
	}

	state(): RideState {
		const ridden = this.ridden;
		return ridden
			? { riding: true, species: ridden.definition.species.name, seat: ridden.profile.seat }
			: NOT_RIDING;
	}

	/** Climbs onto the creature under the crosshair. Returns whether the key was used. */
	mount(): boolean {
		if (!CREATURE_RIDING_ENABLED || this.ridden || !this.host.inputAllowed()) return false;
		// Waiting for the room: swallow repeated presses.
		if (this.claiming) return true;
		if (this.host.cannotMount()) return false;
		const target = this.findTarget();
		if (!target) return false;
		if (!this.host.claim) return this.finishMount(target);
		this.claiming = target;
		this.candidate = null;
		void this.host.claim(target.id).then((result) => {
			if (this.claiming !== target) return;
			this.claiming = null;
			if (result.ok) this.finishMount(target);
			else this.events.refused?.(result.reason ?? 'refused');
			this.publish();
		});
		this.publish();
		return true;
	}

	private finishMount(target: RideCandidate): boolean {
		const profile = this.host.mount(target.id);
		if (!profile) {
			// Granted by the room, but it isn't here to climb onto after all: hand it straight back.
			if (this.host.claim) this.host.abandon(target.id);
			return false;
		}
		this.ridden = { id: target.id, definition: target.definition, profile };
		this.candidate = null;
		this.events.mounted(target.definition.species.name);
		this.publish();
		return true;
	}

	/** Gets off onto safe ground beside the mount. `instant` skips the climb down. */
	dismount(instant = false): void {
		const ridden = this.ridden;
		if (!ridden) return;
		this.ridden = null;
		this.host.dismount(ridden.id, instant);
		this.events.dismounted(ridden.definition.species.name);
		this.publish();
	}

	/** Online: the room ended this player's ride on `id` (e.g. knocked out). */
	forceDismount(id: string): void {
		if (this.ridden?.id === id) this.dismount();
	}

	/** Forgets the ride without climbing off (the world itself was replaced). */
	drop(): void {
		if (!this.ridden) return;
		this.ridden = null;
		this.claiming = null;
		this.publish();
	}

	update(dt: number): void {
		if (!CREATURE_RIDING_ENABLED) return;
		this.time += Math.max(0, dt);
		const ridden = this.ridden;
		if (ridden) {
			if (!this.host.isRidden(ridden.id) || !this.host.seated()) {
				// Teleported, respawned, or the mount vanished with its world.
				this.ridden = null;
				this.host.abandon(ridden.id);
				this.events.dismounted(ridden.definition.species.name);
			} else {
				const input = this.host.inputAllowed() ? this.host.input() : NO_RIDE_INPUT;
				const { blocked } = this.host.steer(input, dt);
				if (blocked && this.time - this.lastBlockedNotice >= BLOCKED_NOTICE_INTERVAL) {
					this.lastBlockedNotice = this.time;
					this.events.blocked?.();
				}
			}
		}
		this.targetElapsed += dt;
		if (this.targetElapsed >= TARGET_INTERVAL) {
			this.targetElapsed = 0;
			this.candidate =
				!this.ridden && !this.claiming && this.host.inputAllowed() && !this.host.cannotMount()
					? this.findTarget()
					: null;
		}
		this.publish();
	}

	private findTarget(): RideCandidate | null {
		return this.host.pick(this.host.eye(), this.host.aim(), RIDE_REACH);
	}

	private publish(): void {
		const next = this.state();
		const last = this.lastState;
		if (next.riding === last.riding && next.species === last.species && next.seat === last.seat)
			return;
		this.lastState = next;
		this.events.change(next);
	}
}
