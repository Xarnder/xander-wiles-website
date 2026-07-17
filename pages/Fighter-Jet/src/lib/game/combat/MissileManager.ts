import { Group, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FlightController } from '../aircraft/FlightController';
import type { PlayerJet } from '../aircraft/PlayerJet';
import type { SquadronJet } from '../aircraft/SquadronJet';
import { ASSET_PATHS } from '../config/assetPaths';
import { BALANCE } from '../config/balance';
import type { TacticalEntitySnapshot } from '../types';
import { ObjectPool } from '../utils/objectPool';
import { Missile, type MissileEndReason } from './Missile';
import type { Target } from './Target';
import type { DamageSource } from './TargetManager';

const _launchPosition = new Vector3();
const _launchDirection = new Vector3();
const _zeroVelocity = new Vector3();

export type MissileImpactCallback = (
	missile: Missile,
	reason: MissileEndReason,
	target: Target | null
) => void;

export class MissileManager extends Group {
	private readonly pool: ObjectPool<Missile>;
	private modelTemplate: Object3D | null = null;
	private hardpointIndex = 0;
	private cooldownRemaining = 0;
	private ammoValue = BALANCE.missile.capacity;
	private infiniteAmmo = false;

	constructor(private readonly onEnd: MissileImpactCallback) {
		super();
		this.name = 'MissileManager';
		this.pool = new ObjectPool<Missile>({
			create: () => {
				const missile = new Missile();
				this.add(missile);
				return missile;
			},
			reset: (missile) => missile.reset(),
			initialSize: 8,
			maxSize: BALANCE.missile.poolSize
		});
	}

	async initialize(): Promise<boolean> {
		try {
			const gltf = await new GLTFLoader().loadAsync(ASSET_PATHS.missile);
			this.modelTemplate = gltf.scene;
			return true;
		} catch {
			this.modelTemplate = null;
			return false;
		}
	}

	get ammo(): number {
		return this.ammoValue;
	}

	get cooldown(): number {
		return this.cooldownRemaining;
	}

	get activeCount(): number {
		return this.pool.activeCount;
	}

	update(delta: number): void {
		this.cooldownRemaining = Math.max(0, this.cooldownRemaining - delta);
		this.pool.forEachActive((missile) => {
			const reason = missile.update(delta);
			if (reason) {
				const target = missile.target;
				this.onEnd(missile, reason, target);
				this.pool.release(missile);
			}
		});
	}

	launchFromPlayer(player: PlayerJet, flight: FlightController, target: Target): Missile | null {
		if ((!this.infiniteAmmo && this.ammoValue <= 0) || this.cooldownRemaining > 0) return null;
		player.getHardpointWorldPosition(this.hardpointIndex, _launchPosition);
		player.getForward(_launchDirection);
		this.hardpointIndex = (this.hardpointIndex + 1) % 2;
		const missile = this.launch(
			_launchPosition,
			_launchDirection,
			flight.velocity,
			target,
			'player',
			true
		);
		if (missile) {
			if (!this.infiniteAmmo) this.ammoValue -= 1;
			this.cooldownRemaining = BALANCE.missile.cooldownSeconds;
		}
		return missile;
	}

	setInfiniteAmmo(enabled: boolean): void {
		this.infiniteAmmo = enabled;
		if (enabled) this.ammoValue = BALANCE.missile.capacity;
	}

	launchFromSquadron(jet: SquadronJet, target: Target, canDamage: boolean): Missile | null {
		_launchPosition.copy(jet.position);
		_launchDirection.copy(target.position).sub(jet.position).normalize();
		return this.launch(
			_launchPosition,
			_launchDirection,
			jet.velocity.lengthSq() > 0 ? jet.velocity : _zeroVelocity,
			target,
			'squadron',
			canDamage
		);
	}

	launch(
		position: Vector3,
		direction: Vector3,
		initialVelocity: Vector3,
		target: Target,
		source: DamageSource,
		canDamage: boolean
	): Missile | null {
		const missile = this.pool.acquire();
		if (!missile) return null;
		missile.ensureModel(this.modelTemplate);
		missile.launch(position, direction, initialVelocity, target, source, canDamage);
		return missile;
	}

	firstActive(): Missile | null {
		let result: Missile | null = null;
		this.pool.forEachActive((missile) => {
			if (!result) result = missile;
		});
		return result;
	}

	tacticalSnapshot(): TacticalEntitySnapshot[] {
		const output: TacticalEntitySnapshot[] = [];
		let index = 0;
		this.pool.forEachActive((missile) => {
			output.push({
				id: `missile-${index}`,
				kind: 'missile',
				position: { x: missile.position.x, y: missile.position.y, z: missile.position.z },
				heading: Math.atan2(missile.velocity.x, -missile.velocity.z),
				hostile: missile.source !== 'player',
				active: true
			});
			index += 1;
		});
		return output;
	}

	reset(): void {
		this.pool.releaseAll();
		this.hardpointIndex = 0;
		this.cooldownRemaining = 0;
		this.ammoValue = BALANCE.missile.capacity;
	}
}
