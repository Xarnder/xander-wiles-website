import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { BALANCE } from '../config/balance';
import type { TacticalEntitySnapshot } from '../types';
import { ObjectPool } from '../utils/objectPool';
import type { Target } from './Target';

class Projectile {
	readonly mesh = new Mesh(
		new CylinderGeometry(0.12, 0.12, 7, 5),
		new MeshBasicMaterial({ color: 0xff6246 })
	);
	readonly velocity = new Vector3();
	age = 0;
	active = false;

	constructor() {
		this.mesh.rotation.x = Math.PI / 2;
		this.mesh.visible = false;
	}

	reset(): void {
		this.active = false;
		this.age = 0;
		this.velocity.set(0, 0, 0);
		this.mesh.visible = false;
	}
}

const _aim = new Vector3();
const _toPlayer = new Vector3();
const _up = new Vector3(0, 1, 0);

export class ProjectileManager extends Group {
	private readonly pool: ObjectPool<Projectile>;
	private fireCooldown = 1.2;
	private shotIndex = 0;
	private closestDistanceValue = Number.POSITIVE_INFINITY;

	constructor(
		private readonly targets: readonly Target[],
		private readonly onPlayerHit: (damage: number) => void
	) {
		super();
		this.name = 'EnemyProjectiles';
		this.pool = new ObjectPool<Projectile>({
			create: () => {
				const projectile = new Projectile();
				this.add(projectile.mesh);
				return projectile;
			},
			reset: (projectile) => projectile.reset(),
			initialSize: 12,
			maxSize: BALANCE.projectile.maxActive
		});
	}

	get closestDistance(): number {
		return this.closestDistanceValue;
	}

	update(delta: number, playerPosition: Vector3, playerVelocity: Vector3): void {
		this.closestDistanceValue = Number.POSITIVE_INFINITY;
		this.fireCooldown -= delta;
		if (this.fireCooldown <= 0) {
			this.fire(playerPosition, playerVelocity);
			this.fireCooldown = BALANCE.projectile.fireInterval + (this.shotIndex % 3) * 0.34;
		}
		this.pool.forEachActive((projectile) => {
			projectile.age += delta;
			projectile.mesh.position.addScaledVector(projectile.velocity, delta);
			const distance = projectile.mesh.position.distanceTo(playerPosition);
			this.closestDistanceValue = Math.min(this.closestDistanceValue, distance);
			if (distance < 9) {
				this.onPlayerHit(BALANCE.projectile.damage);
				this.pool.release(projectile);
			} else if (projectile.age >= BALANCE.projectile.lifetime) {
				this.pool.release(projectile);
			}
		});
	}

	tacticalSnapshot(): TacticalEntitySnapshot[] {
		const output: TacticalEntitySnapshot[] = [];
		let index = 0;
		this.pool.forEachActive((projectile) => {
			output.push({
				id: `tracer-${index}`,
				kind: 'projectile',
				position: {
					x: projectile.mesh.position.x,
					y: projectile.mesh.position.y,
					z: projectile.mesh.position.z
				},
				heading: Math.atan2(projectile.velocity.x, -projectile.velocity.z),
				hostile: true,
				active: true
			});
			index += 1;
		});
		return output;
	}

	reset(): void {
		this.pool.releaseAll();
		this.fireCooldown = 1.2;
		this.shotIndex = 0;
	}

	private fire(playerPosition: Vector3, playerVelocity: Vector3): void {
		const samTargets = this.targets.filter(
			(target) => target.type === 'sam' && target.enabled && !target.destroyed
		);
		if (samTargets.length === 0) return;
		const source = samTargets[this.shotIndex % samTargets.length];
		if (source.position.distanceToSquared(playerPosition) > 3000 * 3000) return;
		const projectile = this.pool.acquire();
		if (!projectile) return;
		projectile.active = true;
		projectile.mesh.visible = true;
		projectile.mesh.position.copy(source.position);
		_aim
			.copy(playerPosition)
			.addScaledVector(
				playerVelocity,
				source.position.distanceTo(playerPosition) / BALANCE.projectile.speed
			);
		// The repeating offset intentionally keeps incoming fire readable and forgiving.
		const miss = (this.shotIndex % 4) - 1.5;
		_aim.x += miss * 22;
		_aim.y += Math.abs(miss) * 10;
		projectile.velocity
			.copy(_aim)
			.sub(source.position)
			.normalize()
			.multiplyScalar(BALANCE.projectile.speed);
		_toPlayer.copy(projectile.velocity).normalize();
		projectile.mesh.quaternion.setFromUnitVectors(_up, _toPlayer);
		this.shotIndex += 1;
	}
}
