import { BALANCE } from '../config/balance';
import { clamp } from '../utils/math';

export interface DamageEvent {
	amount: number;
	health: number;
	critical: boolean;
	destroyed: boolean;
}

export class DamageSystem {
	private healthValue: number = BALANCE.player.maxHealth;
	private warningCooldown = 0;
	private incomingDistance = Number.POSITIVE_INFINITY;
	private incomingBearing = 0;

	constructor(private readonly onDamage?: (event: DamageEvent) => void) {}

	get health(): number {
		return this.healthValue;
	}

	get healthRatio(): number {
		return this.healthValue / BALANCE.player.maxHealth;
	}

	get destroyed(): boolean {
		return this.healthValue <= 0;
	}

	update(delta: number): void {
		this.warningCooldown = Math.max(0, this.warningCooldown - delta);
		if (this.incomingDistance < 900) this.warningCooldown = Math.max(this.warningCooldown, 0.15);
		this.incomingDistance = Number.POSITIVE_INFINITY;
	}

	applyDamage(amount: number): DamageEvent {
		const applied = Math.max(0, amount);
		this.healthValue = clamp(this.healthValue - applied, 0, BALANCE.player.maxHealth);
		const event: DamageEvent = {
			amount: applied,
			health: this.healthValue,
			critical: this.healthValue <= BALANCE.player.warningHealth,
			destroyed: this.healthValue <= 0
		};
		this.onDamage?.(event);
		return event;
	}

	setIncomingThreat(distance: number, bearing: number): void {
		if (distance < this.incomingDistance) {
			this.incomingDistance = distance;
			this.incomingBearing = bearing;
		}
	}

	missileWarning(): { active: boolean; bearing: number; distance: number } {
		return {
			active: this.warningCooldown > 0 || this.incomingDistance < 900,
			bearing: this.incomingBearing,
			distance: Number.isFinite(this.incomingDistance) ? this.incomingDistance : 0
		};
	}

	reset(): void {
		this.healthValue = BALANCE.player.maxHealth;
		this.warningCooldown = 0;
		this.incomingDistance = Number.POSITIVE_INFINITY;
		this.incomingBearing = 0;
	}
}
