import { Object3D, Vector3 } from 'three';
import type { TargetType } from '../types';
import { clamp } from '../utils/math';

export interface TargetDefinition {
	id: string;
	name: string;
	type: TargetType;
	maxHealth: number;
	hitRadius: number;
	isFinal: boolean;
	scoreValue: number;
	position: Vector3;
}

export class Target {
	readonly id: string;
	readonly name: string;
	readonly type: TargetType;
	readonly maxHealth: number;
	readonly hitRadius: number;
	readonly isFinal: boolean;
	readonly scoreValue: number;
	readonly object: Object3D;
	readonly velocity = new Vector3();
	health: number;
	enabled: boolean;
	destroyed = false;

	constructor(definition: TargetDefinition, object: Object3D, enabled = true) {
		this.id = definition.id;
		this.name = definition.name;
		this.type = definition.type;
		this.maxHealth = definition.maxHealth;
		this.hitRadius = definition.hitRadius;
		this.isFinal = definition.isFinal;
		this.scoreValue = definition.scoreValue;
		this.object = object;
		this.object.position.copy(definition.position);
		this.health = definition.maxHealth;
		this.enabled = enabled;
		this.object.visible = enabled;
	}

	get position(): Vector3 {
		return this.object.position;
	}

	get healthRatio(): number {
		return this.health / this.maxHealth;
	}

	applyDamage(amount: number): boolean {
		if (!this.enabled || this.destroyed || amount <= 0) return false;
		this.health = clamp(this.health - amount, 0, this.maxHealth);
		if (this.health <= 0) {
			this.destroyed = true;
			return true;
		}
		return false;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled && !this.destroyed;
		this.object.visible = this.enabled;
	}

	reset(enabled = true): void {
		this.health = this.maxHealth;
		this.destroyed = false;
		this.enabled = enabled;
		this.object.visible = enabled;
	}
}
