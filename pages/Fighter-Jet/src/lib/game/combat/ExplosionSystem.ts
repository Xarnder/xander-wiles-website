import {
	BoxGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	PointLight,
	RingGeometry,
	SphereGeometry,
	Vector3
} from 'three';
import { ObjectPool } from '../utils/objectPool';
import { clamp } from '../utils/math';

export type ExplosionKind = 'normal' | 'fuel' | 'final';

interface Particle {
	mesh: Mesh;
	velocity: Vector3;
}

interface StagedBlast {
	delay: number;
	position: Vector3;
	intensity: number;
}

class ExplosionEffect extends Group {
	active = false;
	age = 0;
	duration = 2.8;
	intensity = 1;
	private readonly flash: Mesh;
	private readonly fireball: Mesh;
	private readonly shockwave: Mesh;
	private readonly scorch: Mesh;
	private readonly light: PointLight;
	private readonly sparks: Particle[] = [];
	private readonly debris: Particle[] = [];
	private readonly smoke: Particle[] = [];

	constructor() {
		super();
		this.visible = false;
		this.flash = new Mesh(
			new SphereGeometry(1, 10, 8),
			new MeshBasicMaterial({ color: 0xfff3be, transparent: true, opacity: 1, depthWrite: false })
		);
		this.fireball = new Mesh(
			new SphereGeometry(1, 12, 9),
			new MeshBasicMaterial({
				color: 0xff5b18,
				transparent: true,
				opacity: 0.84,
				depthWrite: false
			})
		);
		this.shockwave = new Mesh(
			new RingGeometry(0.75, 1, 28),
			new MeshBasicMaterial({
				color: 0xffd28a,
				transparent: true,
				opacity: 0.65,
				depthWrite: false,
				side: 2
			})
		);
		this.shockwave.rotation.x = -Math.PI / 2;
		this.scorch = new Mesh(
			new RingGeometry(0.1, 1, 24),
			new MeshBasicMaterial({
				color: 0x1d130e,
				transparent: true,
				opacity: 0.72,
				depthWrite: false
			})
		);
		this.scorch.rotation.x = -Math.PI / 2;
		this.scorch.position.y = 0.2;
		this.light = new PointLight(0xff6b24, 0, 260, 2);
		this.add(this.scorch, this.shockwave, this.fireball, this.flash, this.light);
		this.createParticles();
	}

	begin(position: Vector3, intensity: number): void {
		this.active = true;
		this.visible = true;
		this.age = 0;
		this.intensity = intensity;
		this.duration = 2.3 + intensity * 0.55;
		this.position.copy(position);
		this.flash.scale.setScalar(1);
		this.fireball.scale.setScalar(1);
		this.shockwave.scale.setScalar(1);
		this.scorch.scale.setScalar(7 * intensity);
		for (let index = 0; index < this.sparks.length; index += 1) {
			const particle = this.sparks[index];
			const angle = index * 2.399;
			particle.mesh.position.set(0, 2, 0);
			particle.velocity.set(
				Math.cos(angle) * (36 + (index % 3) * 14),
				28 + (index % 5) * 13,
				Math.sin(angle) * (36 + (index % 4) * 10)
			);
		}
		for (let index = 0; index < this.debris.length; index += 1) {
			const particle = this.debris[index];
			const angle = index * 1.77;
			particle.mesh.position.set(0, 3, 0);
			particle.velocity.set(
				Math.cos(angle) * (18 + index * 3),
				34 + (index % 3) * 14,
				Math.sin(angle) * (22 + index * 2)
			);
		}
		for (let index = 0; index < this.smoke.length; index += 1) {
			const particle = this.smoke[index];
			particle.mesh.position.set((index - 3) * 1.2, 2, ((index * 3) % 5) - 2);
			particle.velocity.set((index - 3) * 0.7, 12 + index * 1.5, ((index * 2) % 4) - 1.5);
		}
	}

	update(delta: number): boolean {
		this.age += delta;
		const normalized = this.age / this.duration;
		const intensity = this.intensity;
		this.flash.scale.setScalar((2 + this.age * 68) * intensity);
		(this.flash.material as MeshBasicMaterial).opacity = Math.max(0, 1 - this.age * 4.4);
		this.fireball.scale.setScalar((3 + Math.sqrt(this.age) * 34) * intensity);
		(this.fireball.material as MeshBasicMaterial).opacity = Math.max(0, 0.88 - normalized * 1.05);
		this.shockwave.scale.setScalar((5 + this.age * 82) * intensity);
		(this.shockwave.material as MeshBasicMaterial).opacity = Math.max(0, 0.7 - this.age * 1.35);
		(this.scorch.material as MeshBasicMaterial).opacity = Math.max(0, 0.72 - normalized * 0.24);
		this.light.intensity = Math.max(0, (1 - this.age * 2.4) * 55 * intensity);
		this.updateParticles(this.sparks, delta, 32, normalized, 0.8);
		this.updateParticles(this.debris, delta, 24, normalized, 0.95);
		for (const particle of this.smoke) {
			particle.velocity.y += delta * 2;
			particle.mesh.position.addScaledVector(particle.velocity, delta);
			particle.mesh.scale.setScalar((1.4 + this.age * 5.5) * intensity);
			(particle.mesh.material as MeshBasicMaterial).opacity =
				Math.sin(clamp(normalized, 0, 1) * Math.PI) * 0.24;
		}
		return this.age >= this.duration;
	}

	reset(): void {
		this.active = false;
		this.visible = false;
		this.age = 0;
	}

	private createParticles(): void {
		for (let index = 0; index < 14; index += 1) {
			const mesh = new Mesh(
				new BoxGeometry(0.32, 0.32, 2.8),
				new MeshBasicMaterial({ color: 0xffb339, transparent: true, opacity: 0.9 })
			);
			this.sparks.push({ mesh, velocity: new Vector3() });
			this.add(mesh);
		}
		for (let index = 0; index < 8; index += 1) {
			const mesh = new Mesh(
				new BoxGeometry(1.2, 0.8, 1.6),
				new MeshBasicMaterial({ color: 0x2d2924, transparent: true, opacity: 0.9 })
			);
			this.debris.push({ mesh, velocity: new Vector3() });
			this.add(mesh);
		}
		for (let index = 0; index < 7; index += 1) {
			const mesh = new Mesh(
				new SphereGeometry(1, 6, 5),
				new MeshBasicMaterial({
					color: 0x4b4641,
					transparent: true,
					opacity: 0,
					depthWrite: false
				})
			);
			this.smoke.push({ mesh, velocity: new Vector3() });
			this.add(mesh);
		}
	}

	private updateParticles(
		particles: readonly Particle[],
		delta: number,
		gravity: number,
		normalized: number,
		startingOpacity: number
	): void {
		for (const particle of particles) {
			particle.velocity.y -= gravity * delta;
			particle.mesh.position.addScaledVector(particle.velocity, delta);
			particle.mesh.rotation.x += delta * 6;
			particle.mesh.rotation.z += delta * 4;
			(particle.mesh.material as MeshBasicMaterial).opacity = Math.max(
				0,
				startingOpacity * (1 - normalized)
			);
		}
	}
}

export class ExplosionSystem extends Group {
	private readonly pool: ObjectPool<ExplosionEffect>;
	private readonly staged: StagedBlast[] = [];

	constructor(private readonly onBlast?: (intensity: number) => void) {
		super();
		this.name = 'ExplosionSystem';
		this.pool = new ObjectPool<ExplosionEffect>({
			create: () => {
				const effect = new ExplosionEffect();
				this.add(effect);
				return effect;
			},
			reset: (effect) => effect.reset(),
			initialSize: 6,
			maxSize: 16
		});
	}

	spawn(position: Vector3, kind: ExplosionKind = 'normal'): void {
		const intensity = kind === 'final' ? 2.6 : kind === 'fuel' ? 1.45 : 1;
		this.spawnSingle(position, intensity);
		if (kind === 'fuel') {
			for (let index = 0; index < 2; index += 1) {
				this.staged.push({
					delay: 0.18 + index * 0.24,
					position: position.clone().add(new Vector3(index === 0 ? -18 : 17, 8, index * 12 - 6)),
					intensity: 0.9
				});
			}
		} else if (kind === 'final') {
			for (let index = 0; index < 6; index += 1) {
				const angle = index * 2.399;
				this.staged.push({
					delay: 0.14 + index * 0.18,
					position: position
						.clone()
						.add(
							new Vector3(Math.cos(angle) * (18 + index * 5), 6 + index * 4, Math.sin(angle) * 25)
						),
					intensity: 1.1 + index * 0.12
				});
			}
		}
	}

	update(delta: number): void {
		this.pool.forEachActive((effect) => {
			if (effect.update(delta)) this.pool.release(effect);
		});
		for (let index = this.staged.length - 1; index >= 0; index -= 1) {
			const blast = this.staged[index];
			blast.delay -= delta;
			if (blast.delay <= 0) {
				this.spawnSingle(blast.position, blast.intensity);
				this.staged.splice(index, 1);
			}
		}
	}

	reset(): void {
		this.pool.releaseAll();
		this.staged.length = 0;
	}

	private spawnSingle(position: Vector3, intensity: number): void {
		const effect = this.pool.acquire();
		if (!effect) return;
		effect.begin(position, intensity);
		this.onBlast?.(intensity);
	}
}
