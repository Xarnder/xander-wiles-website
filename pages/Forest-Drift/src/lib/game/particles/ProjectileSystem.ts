import * as THREE from 'three';
import {
	PROJECTILE_RADIUS,
	projectileLifetimeMs,
	sweepBody,
	projectilePositionAt,
	type Vec3Like
} from '../player/creatureProjectile';
import { createParticleBurst, type ParticleEffectManager } from './ParticleEffectManager';
import { CREATURE_PELLET_PUFF, CREATURE_PELLET_PUFF_ID } from './effects/creaturePellet';

/** Most pellets in flight at once; more are refused (never allocated). */
export const MAX_PROJECTILES = 64;

/** What a pellet ran into: the world, another player (local shots only), or nothing. */
export type ProjectileImpact =
	| { kind: 'world' | 'expired'; point: Vec3Like }
	/** Someone else's pellet reaching a body as this client draws it (visual only, never reported). */
	| { kind: 'body'; point: Vec3Like }
	| { kind: 'player'; point: Vec3Like; slot: number; shot: number; flightMs: number };

/** Another player a local pellet can hit: their feet position as this client draws them. */
export interface ProjectileTarget {
	slot: number;
	x: number;
	y: number;
	z: number;
}

export interface ProjectileWorld {
	/**
	 * First solid thing on the straight segment from `from` to `to` (terrain, building, wall,
	 * furniture), as a point on the segment, or null when it's clear.
	 */
	collide(from: Vec3Like, to: Vec3Like): Vec3Like | null;
}

interface Pellet {
	active: boolean;
	origin: THREE.Vector3;
	dir: THREE.Vector3;
	firedAt: number;
	/** Flight time already checked for collisions, ms. */
	checkedMs: number;
	colour: THREE.Color;
	/** This player's shot id (online), when hits on other players should be reported. */
	shot: number | null;
}

/**
 * Seed pellets in flight: pooled, drawn as one instanced mesh, moved along the closed-form arc in
 * `creatureProjectile.ts` and stopped by the world. Purely visual on remote shots; local shots
 * report impacts through `onImpact`.
 */
export class ProjectileSystem {
	readonly group = new THREE.Group();
	private readonly mesh: THREE.InstancedMesh;
	private readonly pellets: Pellet[];
	private readonly burst = createParticleBurst();
	private readonly from = new THREE.Vector3();
	private readonly to = new THREE.Vector3();
	private readonly matrix = new THREE.Matrix4();
	private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
	private seed = 1;
	/** Pellets launched since the scene started (diagnostics and tests). */
	launched = 0;
	/** Pellets stopped by the world since the scene started. */
	worldHits = 0;
	onImpact: ((impact: ProjectileImpact) => void) | null = null;
	/** Online: other players this client's own pellets can hit. */
	targets: (() => ProjectileTarget[]) | null = null;
	/**
	 * Online: every body other players' pellets should visibly stop at (the other players and this
	 * one), so a target sees the pellet land on them. Visual only.
	 */
	bodies: (() => ProjectileTarget[]) | null = null;
	/** Pellets that met another player (local shots). */
	playerHits = 0;

	constructor(
		private readonly world: ProjectileWorld,
		private readonly particles: ParticleEffectManager | null,
		registerMaterial: (m: THREE.Material) => void
	) {
		this.group.name = 'creature-pellets';
		const geometry = new THREE.IcosahedronGeometry(PROJECTILE_RADIUS * 0.75, 1);
		const material = new THREE.MeshStandardMaterial({
			roughness: 0.45,
			metalness: 0,
			// A light rim keeps pellets readable against any ground (accessibility).
			emissive: new THREE.Color(0xffffff),
			emissiveIntensity: 0.18
		});
		registerMaterial(material);
		this.mesh = new THREE.InstancedMesh(geometry, material, MAX_PROJECTILES);
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.pellets = Array.from({ length: MAX_PROJECTILES }, (_, i) => {
			this.mesh.setMatrixAt(i, this.hidden);
			this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
			return {
				active: false,
				origin: new THREE.Vector3(),
				dir: new THREE.Vector3(),
				firedAt: 0,
				checkedMs: 0,
				colour: new THREE.Color(),
				shot: null
			};
		});
		this.mesh.count = MAX_PROJECTILES;
		this.group.add(this.mesh);
		particles?.register(CREATURE_PELLET_PUFF);
	}

	get activeCount(): number {
		let n = 0;
		for (const p of this.pellets) if (p.active) n++;
		return n;
	}

	/** Launches a pellet. Returns false when the pool is full. `dir` is normalised here. */
	spawn(
		origin: Vec3Like,
		dir: Vec3Like,
		colour: string,
		nowMs: number,
		shot: number | null = null
	): boolean {
		let index = this.pellets.findIndex((p) => !p.active);
		// Full: this player's own shot takes the slot of the oldest pellet someone else fired, so a
		// busy room can't stop it from being drawn (and from hitting anyone).
		if (index < 0 && shot !== null) {
			let oldest = -1;
			for (let i = 0; i < this.pellets.length; i++) {
				const p = this.pellets[i];
				if (p.shot === null && (oldest < 0 || p.firedAt < this.pellets[oldest].firedAt)) oldest = i;
			}
			index = oldest;
		}
		if (index < 0) return false;
		const p = this.pellets[index];
		p.active = true;
		p.origin.set(origin.x, origin.y, origin.z);
		p.dir.set(dir.x, dir.y, dir.z).normalize();
		p.firedAt = nowMs;
		p.checkedMs = 0;
		p.shot = shot;
		p.colour.set(colour);
		this.mesh.setColorAt(index, p.colour);
		if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
		this.puff(origin, p.dir, 0.35);
		this.launched++;
		return true;
	}

	update(nowMs: number): void {
		const lifetime = projectileLifetimeMs();
		let dirty = false;
		let targets: ProjectileTarget[] | null = null;
		let bodies: ProjectileTarget[] | null = null;
		for (let i = 0; i < this.pellets.length; i++) {
			const p = this.pellets[i];
			if (!p.active) continue;
			dirty = true;
			const age = Math.min(lifetime, nowMs - p.firedAt);
			projectilePositionAt(p.origin, p.dir, p.checkedMs, this.from);
			// Local shots: the first player the pellet meets this step, if any (Q13: the shooter's
			// browser decides, the room checks).
			let met: { slot: number; at: number } | null = null;
			const list =
				p.shot !== null ? (targets ??= this.targets?.() ?? []) : (bodies ??= this.bodies?.() ?? []);
			if (age > p.checkedMs && list.length > 0) {
				for (const target of list) {
					const at = sweepBody(p.origin, p.dir, p.checkedMs, age, target);
					if (at !== null && (!met || at < met.at)) met = { slot: target.slot, at };
				}
			}
			projectilePositionAt(p.origin, p.dir, met ? met.at : age, this.to);
			// The world still wins when it's in the way first (walls, terrain).
			const hit = age > p.checkedMs ? this.world.collide(this.from, this.to) : null;
			p.checkedMs = age;
			if (met && !hit && p.shot === null) {
				this.stop(i, { kind: 'body', point: { x: this.to.x, y: this.to.y, z: this.to.z } });
				continue;
			}
			if (met && !hit) {
				this.playerHits++;
				this.stop(i, {
					kind: 'player',
					point: { x: this.to.x, y: this.to.y, z: this.to.z },
					slot: met.slot,
					shot: p.shot!,
					flightMs: met.at
				});
				continue;
			}
			if (met) projectilePositionAt(p.origin, p.dir, age, this.to);
			if (hit) {
				this.stop(i, { point: hit, kind: 'world' });
				continue;
			}
			if (age >= lifetime) {
				this.stop(i, { point: { x: this.to.x, y: this.to.y, z: this.to.z }, kind: 'expired' });
				continue;
			}
			this.matrix.makeTranslation(this.to.x, this.to.y, this.to.z);
			this.mesh.setMatrixAt(i, this.matrix);
		}
		if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
	}

	/** Removes this player's pellet `shot` (the room refused it, so nobody else sees it). */
	cancelShot(shot: number): boolean {
		const index = this.pellets.findIndex((p) => p.active && p.shot === shot);
		if (index < 0) return false;
		this.pellets[index].active = false;
		this.mesh.setMatrixAt(index, this.hidden);
		this.mesh.instanceMatrix.needsUpdate = true;
		return true;
	}

	/** Removes every pellet (world switch). */
	clear(): void {
		for (let i = 0; i < this.pellets.length; i++)
			if (this.pellets[i].active) {
				this.pellets[i].active = false;
				this.mesh.setMatrixAt(i, this.hidden);
			}
		this.mesh.instanceMatrix.needsUpdate = true;
	}

	private stop(index: number, impact: ProjectileImpact): void {
		const p = this.pellets[index];
		p.active = false;
		this.mesh.setMatrixAt(index, this.hidden);
		this.mesh.instanceMatrix.needsUpdate = true;
		if (impact.kind !== 'expired') {
			if (impact.kind === 'world') this.worldHits++;
			this.puff(impact.point, p.dir, 1);
		}
		this.onImpact?.(impact);
	}

	private puff(at: Vec3Like, dir: Vec3Like, strength: number): void {
		if (!this.particles) return;
		const b = this.burst;
		b.x = at.x;
		b.y = at.y;
		b.z = at.z;
		b.dirX = -dir.x || 1;
		b.dirZ = -dir.z;
		b.strength = strength;
		b.seed = this.seed++;
		b.countScale = strength < 1 ? 0.4 : 1;
		this.particles.emitBurst(CREATURE_PELLET_PUFF_ID, b);
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		(this.mesh.material as THREE.Material).dispose();
		this.mesh.dispose();
		this.group.removeFromParent();
	}
}
