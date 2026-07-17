import { Vector3 } from 'three';
import type { TargetType } from '../types';
import type { EnemyBase } from '../world/EnemyBase';
import type { Terrain } from '../world/Terrain';
import { Target, type TargetDefinition } from './Target';

export type DamageSource = 'player' | 'squadron';

export interface TargetDamageResult {
	hit: boolean;
	destroyed: boolean;
	target: Target;
	source: DamageSource;
}

interface TargetLayout {
	id: string;
	name: string;
	type: TargetType;
	x: number;
	z: number;
	yOffset: number;
	health: number;
	radius: number;
	score: number;
	final: boolean;
}

const LAYOUT: readonly TargetLayout[] = [
	{
		id: 'radar-array',
		name: 'Early Warning Radar',
		type: 'radar',
		x: -360,
		z: -3650,
		yOffset: 20,
		health: 80,
		radius: 22,
		score: 1000,
		final: false
	},
	{
		id: 'sam-west',
		name: 'SAM Battery West',
		type: 'sam',
		x: -610,
		z: -3370,
		yOffset: 10,
		health: 90,
		radius: 18,
		score: 1100,
		final: false
	},
	{
		id: 'sam-east',
		name: 'SAM Battery East',
		type: 'sam',
		x: 640,
		z: -3520,
		yOffset: 10,
		health: 90,
		radius: 18,
		score: 1100,
		final: false
	},
	{
		id: 'fuel-depot',
		name: 'Fuel Depot',
		type: 'fuel',
		x: 420,
		z: -3980,
		yOffset: 10,
		health: 75,
		radius: 25,
		score: 1250,
		final: false
	},
	{
		id: 'munitions-fuel',
		name: 'Munitions Storage',
		type: 'fuel',
		x: -490,
		z: -4170,
		yOffset: 10,
		health: 75,
		radius: 24,
		score: 1250,
		final: false
	},
	{
		id: 'hangar',
		name: 'Hardened Hangar',
		type: 'hangar',
		x: 40,
		z: -3160,
		yOffset: 9,
		health: 120,
		radius: 31,
		score: 1400,
		final: false
	},
	{
		id: 'command-centre',
		name: 'Command Centre',
		type: 'command',
		x: 40,
		z: -3710,
		yOffset: 12,
		health: 180,
		radius: 34,
		score: 5000,
		final: true
	},
	{
		id: 'command-weak-point',
		name: 'Command Vent',
		type: 'weak-point',
		x: 40,
		z: -3710,
		yOffset: 48,
		health: 55,
		radius: 10,
		score: 1800,
		final: true
	}
];

export class TargetManager {
	readonly targets: readonly Target[];
	private regularDestroyed = 0;
	private playerRegularDestroyed = 0;
	private finalUnlocked = false;

	constructor(
		private readonly base: EnemyBase,
		terrain: Terrain
	) {
		this.targets = LAYOUT.map((layout) => {
			const definition: TargetDefinition = {
				id: layout.id,
				name: layout.name,
				type: layout.type,
				maxHealth: layout.health,
				hitRadius: layout.radius,
				isFinal: layout.final,
				scoreValue: layout.score,
				position: new Vector3(
					layout.x,
					terrain.terrainHeightAt(layout.x, layout.z) + layout.yOffset,
					layout.z
				)
			};
			const visual = base.createTargetVisual(layout.id, layout.type);
			return new Target(definition, visual, !layout.final);
		});
	}

	get activeTargets(): readonly Target[] {
		return this.targets;
	}

	get regularTargetsDestroyed(): number {
		return this.regularDestroyed;
	}

	get playerDestroyedMajority(): boolean {
		return this.playerRegularDestroyed >= 3;
	}

	get finalTargetDestroyed(): boolean {
		return Boolean(this.targets.find((target) => target.type === 'weak-point')?.destroyed);
	}

	find(id: string): Target | null {
		return this.targets.find((target) => target.id === id) ?? null;
	}

	unlockFinalTargets(): void {
		if (this.finalUnlocked) return;
		this.finalUnlocked = true;
		for (const target of this.targets) {
			if (target.isFinal) target.setEnabled(true);
		}
	}

	applyDamage(target: Target, damage: number, source: DamageSource): TargetDamageResult {
		if (!target.enabled || target.destroyed)
			return { hit: false, destroyed: false, target, source };
		const destroyed = target.applyDamage(damage);
		if (destroyed) {
			if (!target.isFinal) {
				this.regularDestroyed += 1;
				if (source === 'player') this.playerRegularDestroyed += 1;
			}
			this.base.markDestroyed(target.id, target.position, target.type);
		}
		return { hit: true, destroyed, target, source };
	}

	reset(): void {
		this.regularDestroyed = 0;
		this.playerRegularDestroyed = 0;
		this.finalUnlocked = false;
		for (const target of this.targets) target.reset(!target.isFinal);
	}
}
