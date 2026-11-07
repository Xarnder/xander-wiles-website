/**
 * Carrying a small creature and firing pellets from its mouth (ranged weapons, Phase 1: single
 * player). Owns the carry state, the charge budget, the input rules and the prompt; the scene
 * supplies the world through `CarryHost`, so this has no Three.js or DOM dependencies.
 *
 * Plan: docs/2026/11-04/range-weapons/feature-plan/02-technical-plan.md §3.3, §4.4.
 */
import { CARRY_REACH, RANGED_WEAPONS_ENABLED } from '../creatures/creatureAbilities';
import type { CreatureDefinition } from '../creatures/CreatureTypes';
import {
	CHARGES_MAX,
	canSpendCharge,
	chargesAt,
	createChargeState,
	spendCharge,
	type ChargeState,
	type Vec3Like
} from './creatureProjectile';

/** Distance along the crosshair the pellet's path converges on, metres. */
export const AIM_CONVERGENCE = 20;

export interface CarryCandidateLike {
	id: string;
	definition: CreatureDefinition;
	/** Distance along the look ray, metres (lets the scene pick the nearer of two creatures). */
	distance?: number;
}

export interface CarryHost {
	/** Clock for charges and fire timing, ms. */
	now(): number;
	/** Eye position and unit look direction (the crosshair ray). */
	eye(): Vec3Like;
	aim(): Vec3Like;
	/** Feet position and facing yaw, for putting the creature down. */
	feet(): Vec3Like;
	yaw(): number;
	/** The player is playing (pointer locked, no menu or overlay open). */
	inputAllowed(): boolean;
	/** Carrying is kept but firing isn't allowed (build or global mode, flying, underwater; Q19). */
	stowed(): boolean;
	/** The creature must be put down now (seated or lying, knocked out; Q19). */
	mustRelease(): boolean;
	/** A seat or door is under the crosshair: `K` belongs to it, not to picking up. */
	otherInteractionTargeted(): boolean;
	pick(eye: Vec3Like, dir: Vec3Like, reach: number): CarryCandidateLike | null;
	/**
	 * Online only: asks the room for the creature first (ranged weapons Phase 2). Absent in single
	 * player, where picking up is immediate.
	 */
	claim?(id: string): Promise<CarryClaimResult>;
	/** Takes the creature out of the herd; `fallback` is its recipe if this herd no longer has it. */
	carry(id: string, fallback?: CreatureDefinition): CreatureDefinition | null;
	release(id: string, at: Vec3Like, heading: number): void;
	isCarried(id: string): boolean;
	/** Show the creature in hand / remove it. */
	attach(definition: CreatureDefinition): void;
	detach(): void;
	/** Where pellets leave the mouth this frame, or null while it isn't drawn. */
	muzzle(): Vec3Like | null;
	/** Launches a pellet (visual plus world collision) and plays the shot's feedback. */
	launch(origin: Vec3Like, dir: Vec3Like, colour: string): void;
	/** A fire attempt with no charge ready. */
	dryFire(): void;
}

export interface CarryClaimResult {
	ok: boolean;
	/** Why the room said no ('taken', 'far', 'ineligible', 'rule', 'role', 'state', 'timeout'). */
	reason?: string;
}

/** What the HUD shows. */
export interface CarryState {
	carrying: boolean;
	species: string | null;
	/** `#rrggbb`: the pellets' colour (the creature's accent colour). */
	colour: string | null;
	charges: number;
	maxCharges: number;
	/** Carried, but firing isn't possible right now. */
	stowed: boolean;
}

export interface CarryPrompt {
	label: string;
	carrying: boolean;
}

export interface CarryEvents {
	change(state: CarryState): void;
	/** Carry-only prompt. The game scene composes its own with riding (`creatureKeyRouting.ts`). */
	prompt?(prompt: CarryPrompt | null): void;
	pickedUp(species: string): void;
	putDown(species: string): void;
	/** The room refused a pick-up (online). */
	refused?(reason: string): void;
}

const EMPTY: CarryState = {
	carrying: false,
	species: null,
	colour: null,
	charges: 0,
	maxCharges: CHARGES_MAX,
	stowed: false
};

export class CarryController {
	private carried: { id: string; definition: CreatureDefinition } | null = null;
	/** Online: a pick-up waiting for the room's answer. */
	private claiming: CarryCandidateLike | null = null;
	private charges: ChargeState = createChargeState(0);
	private candidate: CarryCandidateLike | null = null;
	private triggerHeld = false;
	private promptElapsed = Infinity;
	private lastState: CarryState = EMPTY;
	private lastPrompt = '';

	constructor(
		private readonly host: CarryHost,
		private readonly events: CarryEvents
	) {}

	get carrying(): boolean {
		return !!this.carried;
	}

	get carriedId(): string | null {
		return this.carried?.id ?? null;
	}

	/** The creature under the crosshair that K would pick up (refreshed ten times a second). */
	get targetId(): string | null {
		return this.candidate?.id ?? null;
	}

	get target(): CarryCandidateLike | null {
		return this.candidate;
	}

	/** Species waiting for the room's answer (online), for the prompt. */
	get pendingSpecies(): string | null {
		return this.claiming?.definition.species.name ?? null;
	}

	state(): CarryState {
		const carried = this.carried;
		if (!carried) return EMPTY;
		return {
			carrying: true,
			species: carried.definition.species.name,
			colour: carried.definition.species.appearance.palette.accent,
			charges: chargesAt(this.charges, this.host.now()),
			maxCharges: CHARGES_MAX,
			stowed: this.host.stowed()
		};
	}

	/** Whether left click should fire rather than punch. */
	get wantsClick(): boolean {
		return !!this.carried && RANGED_WEAPONS_ENABLED;
	}

	/**
	 * `K` (or the touch button): put down while carrying, otherwise pick up the creature under the
	 * crosshair. A seat or door under the crosshair wins over a creature. Returns whether the key
	 * was used.
	 */
	toggle(): boolean {
		if (!RANGED_WEAPONS_ENABLED || !this.host.inputAllowed()) return false;
		if (this.carried) {
			this.putDown();
			return true;
		}
		// Waiting for the room: swallow repeated presses.
		if (this.claiming) return true;
		if (this.host.otherInteractionTargeted()) return false;
		const target = this.findTarget();
		if (!target) return false;
		if (!this.host.claim) return this.finishPickUp(target);
		this.claiming = target;
		this.candidate = null;
		this.updatePrompt();
		void this.host.claim(target.id).then((result) => {
			if (this.claiming !== target) return;
			this.claiming = null;
			if (result.ok) this.finishPickUp(target);
			else {
				this.events.refused?.(result.reason ?? 'refused');
				this.updatePrompt();
			}
		});
		return true;
	}

	/** True while an online pick-up waits for the room. */
	get pending(): boolean {
		return !!this.claiming;
	}

	private finishPickUp(target: CarryCandidateLike): boolean {
		const definition = this.host.carry(target.id, target.definition);
		if (!definition) {
			// Granted by the room, but this world can't hold it after all: hand it straight back.
			if (this.host.claim) this.host.release(target.id, this.host.feet(), this.host.yaw());
			return false;
		}
		this.carried = { id: target.id, definition };
		this.charges = createChargeState(this.host.now());
		this.host.attach(definition);
		this.candidate = null;
		this.events.pickedUp(definition.species.name);
		this.publish(true);
		return true;
	}

	/**
	 * Online: the room put this player's creature down (knocked out, sat down, rule switched off)
	 * at `at` (or at the feet when it didn't say).
	 */
	forceRelease(id: string, at: Vec3Like | null, heading: number | null): void {
		const carried = this.carried;
		if (!carried || carried.id !== id) return;
		this.carried = null;
		this.triggerHeld = false;
		this.host.detach();
		this.host.release(id, at ?? this.host.feet(), heading ?? this.host.yaw());
		this.events.putDown(carried.definition.species.name);
		this.publish(true);
	}

	/** Left click / Fire button pressed or released. Holding repeats whenever a charge is ready. */
	setTrigger(held: boolean): void {
		this.triggerHeld = held && !!this.carried;
		if (held) this.fire();
	}

	/** Fires one pellet if allowed. Returns whether one left the mouth. */
	fire(): boolean {
		const carried = this.carried;
		if (!carried || !this.host.inputAllowed() || this.host.stowed()) return false;
		const now = this.host.now();
		if (!canSpendCharge(this.charges, now)) {
			if (chargesAt(this.charges, now) < 1) this.host.dryFire();
			return false;
		}
		const origin = this.host.muzzle();
		if (!origin) return false;
		const eye = this.host.eye();
		const aim = this.host.aim();
		const target = {
			x: eye.x + aim.x * AIM_CONVERGENCE,
			y: eye.y + aim.y * AIM_CONVERGENCE,
			z: eye.z + aim.z * AIM_CONVERGENCE
		};
		const dx = target.x - origin.x,
			dy = target.y - origin.y,
			dz = target.z - origin.z;
		const length = Math.hypot(dx, dy, dz) || 1;
		this.charges = spendCharge(this.charges, now)!;
		this.host.launch(
			origin,
			{ x: dx / length, y: dy / length, z: dz / length },
			carried.definition.species.appearance.palette.accent
		);
		this.publish(true);
		return true;
	}

	/** Puts the creature down at the player's feet. */
	putDown(): void {
		const carried = this.carried;
		if (!carried) return;
		this.carried = null;
		this.triggerHeld = false;
		this.host.detach();
		if (this.host.isCarried(carried.id))
			this.host.release(carried.id, this.host.feet(), this.host.yaw());
		this.events.putDown(carried.definition.species.name);
		this.publish(true);
	}

	/** Online: the room refused a shot and says how many charges are really left. */
	resyncCharges(charges: number): void {
		if (!this.carried) return;
		const now = this.host.now();
		this.charges = {
			base: Math.max(0, Math.min(CHARGES_MAX, Math.floor(charges))),
			at: now,
			lastShotAt: this.charges.lastShotAt
		};
		this.publish(true);
	}

	/** Forgets the carry without putting anything down (the world itself was replaced). */
	drop(): void {
		if (!this.carried) return;
		this.carried = null;
		this.triggerHeld = false;
		this.host.detach();
		this.publish(true);
	}

	update(dt: number): void {
		if (!RANGED_WEAPONS_ENABLED) return;
		// Losing pointer lock or opening a menu ends a held trigger.
		if (!this.host.inputAllowed()) this.triggerHeld = false;
		if (this.carried) {
			if (!this.host.isCarried(this.carried.id)) this.drop();
			else if (this.host.mustRelease()) this.putDown();
			else if (this.triggerHeld) this.fire();
		}
		this.promptElapsed += dt;
		if (this.promptElapsed >= 0.1) {
			this.promptElapsed = 0;
			this.candidate =
				!this.carried && this.host.inputAllowed() && !this.host.otherInteractionTargeted()
					? this.findTarget()
					: null;
			this.updatePrompt();
		}
		this.publish(false);
	}

	private findTarget(): CarryCandidateLike | null {
		if (this.host.stowed() || this.host.mustRelease()) return null;
		return this.host.pick(this.host.eye(), this.host.aim(), CARRY_REACH);
	}

	private updatePrompt(): void {
		const prompt: CarryPrompt | null = this.claiming
			? { label: `Picking up ${this.claiming.definition.species.name}…`, carrying: false }
			: this.carried
				? this.host.inputAllowed()
					? { label: 'Put down', carrying: true }
					: null
				: this.candidate
					? { label: `Pick up ${this.candidate.definition.species.name}`, carrying: false }
					: null;
		const key = prompt ? `${prompt.carrying}:${prompt.label}` : '';
		if (key === this.lastPrompt) return;
		this.lastPrompt = key;
		this.events.prompt?.(prompt);
	}

	private publish(force: boolean): void {
		const next = this.state();
		const last = this.lastState;
		if (
			!force &&
			next.carrying === last.carrying &&
			next.charges === last.charges &&
			next.stowed === last.stowed &&
			next.species === last.species
		)
			return;
		this.lastState = next;
		this.events.change(next);
		if (force) this.updatePrompt();
	}
}
