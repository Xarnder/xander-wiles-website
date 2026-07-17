import {
	AdditiveBlending,
	ConeGeometry,
	CylinderGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Object3D,
	PointLight,
	SphereGeometry,
	TorusGeometry,
	Vector3
} from 'three';
import { BALANCE } from '../config/balance';
import { solveInterceptPoint, steerDirection } from '../utils/math';
import type { Target } from './Target';
import type { DamageSource } from './TargetManager';

const _desiredPoint = new Vector3();
const _desiredDirection = new Vector3();
const _steeredDirection = new Vector3();
const _forward = new Vector3(0, 0, -1);

export type MissileEndReason = 'impact' | 'expired';

export class Missile extends Group {
	active = false;
	target: Target | null = null;
	source: DamageSource = 'player';
	canDamage = true;
	readonly velocity = new Vector3();
	age = 0;
	speed = 0;
	ignited = false;
	private readonly visual = new Group();
	private readonly exhaust: Mesh;
	private readonly light: PointLight;
	private readonly smoke: Mesh[] = [];
	private readonly ignitionRings: Mesh[] = [];
	private loadedModel = false;

	constructor() {
		super();
		this.visible = false;
		this.name = 'PooledMissile';
		this.add(this.visual);
		this.visual.add(this.createFallbackVisual());
		this.visual.scale.setScalar(2.35);
		this.exhaust = new Mesh(
			new ConeGeometry(0.62, 8.5, 10, 1, true),
			new MeshBasicMaterial({
				color: 0xffb45f,
				transparent: true,
				opacity: 0.9,
				depthWrite: false,
				blending: AdditiveBlending
			})
		);
		this.exhaust.rotation.x = Math.PI / 2;
		this.exhaust.position.z = 6.2;
		this.light = new PointLight(0xff8a3c, 9, 75, 2);
		this.light.position.z = 2.5;
		this.add(this.exhaust, this.light);
		for (let index = 0; index < 9; index += 1) {
			const smoke = new Mesh(
				new SphereGeometry(0.72, 7, 5),
				new MeshBasicMaterial({
					color: index < 2 ? 0xffc27a : 0xd6d9d5,
					transparent: true,
					opacity: index < 2 ? 0.42 : 0.25,
					depthWrite: false
				})
			);
			smoke.position.z = 4.2 + index * 2.25;
			this.smoke.push(smoke);
			this.add(smoke);
		}
		for (let index = 0; index < 2; index += 1) {
			const ring = new Mesh(
				new TorusGeometry(0.85, 0.1, 6, 16),
				new MeshBasicMaterial({
					color: index === 0 ? 0xfff0bd : 0xff7838,
					transparent: true,
					opacity: 0.65,
					depthWrite: false,
					blending: AdditiveBlending
				})
			);
			ring.position.z = 3.4 + index * 2.4;
			this.ignitionRings.push(ring);
			this.add(ring);
		}
	}

	ensureModel(template: Object3D | null): void {
		if (!template || this.loadedModel) return;
		this.visual.clear();
		this.visual.add(template.clone(true));
		this.loadedModel = true;
	}

	launch(
		position: Vector3,
		direction: Vector3,
		initialVelocity: Vector3,
		target: Target,
		source: DamageSource,
		canDamage: boolean
	): void {
		this.active = true;
		this.visible = true;
		this.position.copy(position);
		this.target = target;
		this.source = source;
		this.canDamage = canDamage;
		this.age = 0;
		this.speed = BALANCE.missile.ignitionSpeed * 0.48;
		this.ignited = false;
		this.velocity.copy(direction).multiplyScalar(this.speed).add(initialVelocity);
		this.setDirection(direction);
		this.updateEffects();
	}

	update(delta: number): MissileEndReason | null {
		if (!this.active) return null;
		this.age += delta;
		if (this.age >= BALANCE.missile.lifetimeSeconds) return 'expired';
		if (!this.target || this.target.destroyed || !this.target.enabled) {
			this.position.addScaledVector(this.velocity, delta);
			return null;
		}

		if (this.age < BALANCE.missile.separationSeconds) {
			this.velocity.y -= 18 * delta;
			this.position.addScaledVector(this.velocity, delta);
			this.setDirection(_desiredDirection.copy(this.velocity).normalize());
			return null;
		}

		this.ignited = true;
		this.speed = Math.min(
			BALANCE.missile.maxSpeed,
			this.speed + BALANCE.missile.acceleration * delta
		);
		solveInterceptPoint(
			this.position,
			this.target.position,
			this.target.velocity,
			this.speed,
			_desiredPoint
		);
		_desiredDirection.copy(_desiredPoint).sub(this.position).normalize();
		if (this.velocity.lengthSq() > 0.001) {
			_steeredDirection.copy(this.velocity).normalize();
		} else {
			_steeredDirection.copy(_desiredDirection);
		}
		steerDirection(
			_steeredDirection,
			_desiredDirection,
			BALANCE.missile.maxTurnRate * delta,
			_steeredDirection
		);
		this.velocity.copy(_steeredDirection).multiplyScalar(this.speed);
		this.position.addScaledVector(this.velocity, delta);
		this.setDirection(_steeredDirection);
		this.updateEffects();
		const hitDistance = this.target.hitRadius + BALANCE.missile.hitRadius;
		return this.position.distanceToSquared(this.target.position) <= hitDistance * hitDistance
			? 'impact'
			: null;
	}

	reset(): void {
		this.active = false;
		this.visible = false;
		this.target = null;
		this.velocity.set(0, 0, 0);
		this.age = 0;
		this.speed = 0;
		this.ignited = false;
	}

	private setDirection(direction: Vector3): void {
		this.quaternion.setFromUnitVectors(_forward, direction);
	}

	private updateEffects(): void {
		this.exhaust.visible = this.ignited;
		this.light.visible = this.ignited;
		const pulse = 0.88 + Math.sin(this.age * 42) * 0.12;
		this.exhaust.scale.set(pulse, 0.82 + pulse * 0.25, pulse);
		this.light.intensity = 7.5 + pulse * 3.5;
		for (let index = 0; index < this.smoke.length; index += 1) {
			const smoke = this.smoke[index];
			smoke.visible = this.ignited;
			const ripple = 0.9 + ((this.age * 10 + index * 0.7) % 3.5) * 0.28;
			smoke.scale.set(ripple * (1 + index * 0.08), ripple * 0.72, ripple * 1.35);
			(smoke.material as MeshBasicMaterial).opacity =
				(index < 2 ? 0.44 : 0.28) * (1 - index / (this.smoke.length + 2));
		}
		for (let index = 0; index < this.ignitionRings.length; index += 1) {
			const ring = this.ignitionRings[index];
			ring.visible = this.ignited;
			const phase = (this.age * 4.8 + index * 0.5) % 1;
			ring.scale.setScalar(0.75 + phase * 2.4);
			(ring.material as MeshBasicMaterial).opacity = (1 - phase) * 0.62;
		}
	}

	private createFallbackVisual(): Group {
		const group = new Group();
		const body = new Mesh(
			new CylinderGeometry(0.18, 0.23, 2.6, 8),
			new MeshStandardMaterial({ color: 0xd7d9d3, metalness: 0.55, roughness: 0.34 })
		);
		body.rotation.x = Math.PI / 2;
		const nose = new Mesh(
			new ConeGeometry(0.18, 0.65, 8),
			new MeshStandardMaterial({ color: 0xb8392d, roughness: 0.48 })
		);
		nose.rotation.x = -Math.PI / 2;
		nose.position.z = -1.62;
		group.add(body, nose);
		return group;
	}
}
