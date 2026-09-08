import * as THREE from 'three';
import { compileCreature, type CompiledCreature } from './CreatureCompiler';
import { animateCreature } from './CreatureAnimationSystem';
import { createDefaultCreatureState, validateCreatureWorldState } from './CreaturePersistence';
import {
	generatePopulationCell,
	CREATURE_CELL_SIZE,
	generateCreatureDemo
} from './CreaturePopulationSystem';
import { createCreatureState, decideCreature, advanceCreature } from './CreatureBehaviourSystem';
import type {
	CreatureDefinition,
	CreatureRuntimeDefinition,
	CreatureSpawnDefinition,
	CreatureWorldAccess,
	CreatureWorldState,
	Vec3
} from './CreatureTypes';
import { CREATURE_GRAPHICS_BUDGETS, type GraphicsQuality } from '../graphics/GraphicsTypes';

interface LiveCreature {
	compiled: CompiledCreature;
	lod: 0 | 1;
	lastAnimation: number;
	born: number;
	debug?: THREE.SkeletonHelper;
}
/** Bounded runtime window over an infinite deterministic ecology. Ambient state is never serialized. */
export class CreatureRuntimeManager {
	readonly group = new THREE.Group();
	readonly logical = new Map<string, CreatureRuntimeDefinition>();
	readonly live = new Map<string, LiveCreature>();
	state: CreatureWorldState;
	revision = 0;
	private cells = new Map<string, CreatureSpawnDefinition[]>();
	private scanAt = -1;
	private movementAt = 0;
	private persistenceAt = 0;
	private time = 0;
	private placedIndex = 0;
	private demo = false;
	private materialRegistered = new WeakSet<THREE.Material>();
	readonly debug = {
		showSkeleton: false,
		showBehaviourState: false,
		showTarget: false,
		showSpeciesId: false,
		showIndividualId: false,
		showLOD: false
	};
	readonly stats = {
		active: 0,
		rendered: 0,
		sleeping: 0,
		triangles: 0,
		drawCalls: 0,
		skeletonUpdates: 0,
		behaviourUpdates: 0,
		compileCount: 0,
		averageCompileMs: 0,
		maxCompileMs: 0,
		animationMs: 0,
		behaviourMs: 0,
		lod0: 0,
		lod1: 0,
		culled: 0,
		failures: 0
	};
	constructor(
		private worldSeed: string,
		private access: CreatureWorldAccess,
		state: CreatureWorldState | undefined,
		private registerMaterial: (m: THREE.Material) => void = () => {}
	) {
		this.state = structuredClone(state ?? createDefaultCreatureState());
		this.restorePersistent();
	}
	private restorePersistent() {
		for (const p of this.state.individuals) {
			const spawn: CreatureSpawnDefinition = {
				id: p.id,
				species: p.species,
				individual: p.individual,
				position: { ...p.position },
				heading: p.heading,
				groupId: p.id,
				groupCentre: { ...p.position },
				cellX: Math.floor(p.position.x / CREATURE_CELL_SIZE),
				cellZ: Math.floor(p.position.z / CREATURE_CELL_SIZE),
				persistent: true
			};
			const r = createCreatureState(spawn);
			r.state = p.state;
			this.logical.set(p.id, r);
		}
	}
	setSeed(seed: string) {
		if (seed === this.worldSeed) return;
		this.worldSeed = seed;
		this.reset();
	}
	settingsChanged() {
		this.revision++;
		this.reset();
	}
	private reset() {
		for (const id of [...this.live.keys()]) this.unload(id);
		this.logical.clear();
		this.cells.clear();
		this.scanAt = -1;
		this.restorePersistent();
	}
	private unload(id: string) {
		const r = this.live.get(id);
		r?.debug?.dispose();
		r?.debug?.removeFromParent();
		r?.compiled.dispose();
		this.live.delete(id);
	}
	private scan(player: Vec3, quality: GraphicsQuality) {
		const range = CREATURE_GRAPHICS_BUDGETS[quality].populationRadius;
		const cellRadius = Math.ceil(range / CREATURE_CELL_SIZE),
			cx = Math.floor(player.x / CREATURE_CELL_SIZE),
			cz = Math.floor(player.z / CREATURE_CELL_SIZE);
		const keep = new Set<string>();
		if (!this.demo)
			for (let dx = -cellRadius; dx <= cellRadius; dx++)
				for (let dz = -cellRadius; dz <= cellRadius; dz++) {
					const x = cx + dx,
						z = cz + dz,
						key = `${x},${z}`;
					keep.add(key);
					let spawns = this.cells.get(key);
					if (!spawns) {
						spawns = generatePopulationCell(
							this.worldSeed,
							x,
							z,
							this.state.settings.creatureDensity,
							this.access
						);
						this.cells.set(key, spawns);
					}
					for (const spawn of spawns)
						if (!this.logical.has(spawn.id)) this.logical.set(spawn.id, createCreatureState(spawn));
				}
		for (const [key] of this.cells) if (!keep.has(key)) this.cells.delete(key);
		for (const [id, r] of this.logical)
			if (!r.spawn.persistent && !this.demo && !keep.has(`${r.spawn.cellX},${r.spawn.cellZ}`)) {
				this.unload(id);
				this.logical.delete(id);
			}
	}
	update(player: Vec3, delta: number, quality: GraphicsQuality) {
		this.time += Math.min(delta, 0.1);
		if (!this.state.settings.enabled) {
			for (const id of [...this.live.keys()]) this.unload(id);
			return;
		}
		const budget = CREATURE_GRAPHICS_BUDGETS[quality];
		if (this.time >= this.scanAt) {
			this.scan(player, quality);
			this.scanAt = this.time + 0.8;
		}
		const visible: { id: string; distance: number; lod: 0 | 1 }[] = [];
		for (const [id, r] of this.logical) {
			const p = r.spawn.species.proportions,
				size =
					(p.legLength + p.bodyDepth + p.headSize + p.neckLength) * r.spawn.individual.sizeFactor;
			const distance = Math.hypot(player.x - r.position.x, player.z - r.position.z);
			const far = Math.min(
				budget.populationRadius,
				Math.max(budget.smallRenderDistance, size * 24)
			);
			if (distance <= far)
				visible.push({
					id,
					distance,
					lod: distance < budget.nearDistance && quality !== 'low' ? 0 : 1
				});
		}
		visible.sort((a, b) => a.distance - b.distance);
		const selected = visible.slice(
			0,
			Math.min(this.state.settings.maxActiveCreatures, budget.maxActive)
		);
		const ids = new Set(selected.map((p) => p.id));
		for (const id of this.live.keys()) if (!ids.has(id)) this.unload(id);
		let compiledThisFrame = false;
		this.stats.skeletonUpdates = 0;
		this.stats.behaviourUpdates = 0;
		this.stats.animationMs = 0;
		this.stats.behaviourMs = 0;
		const moving = this.time - this.movementAt >= 0.05,
			step = Math.min(0.15, this.time - this.movementAt);
		if (moving) this.movementAt = this.time;
		const nearStates = selected.map((p) => this.logical.get(p.id)!);
		for (const item of selected) {
			const r = this.logical.get(item.id)!;
			let live = this.live.get(item.id);
			if ((!live || live.lod !== item.lod) && !compiledThisFrame) {
				const start = performance.now();
				try {
					const compiled = compileCreature(
						{ species: r.spawn.species, individual: r.spawn.individual },
						item.lod
					);
					if (live) this.unload(item.id);
					live = { compiled, lod: item.lod, lastAnimation: -1, born: this.time };
					for (const mesh of compiled.skinnedMeshes) {
						for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
							if (!this.materialRegistered.has(m)) {
								this.registerMaterial(m);
								this.materialRegistered.add(m);
							}
					}
					this.group.add(compiled.object);
					this.live.set(item.id, live);
					const elapsed = performance.now() - start;
					this.stats.averageCompileMs =
						(this.stats.averageCompileMs * this.stats.compileCount + elapsed) /
						(this.stats.compileCount + 1);
					this.stats.compileCount++;
					this.stats.maxCompileMs = Math.max(this.stats.maxCompileMs, elapsed);
				} catch {
					this.stats.failures++;
					this.logical.delete(item.id);
				}
				compiledThisFrame = true;
			}
			if (!live) continue;
			const behaviourStart = performance.now();
			if (this.time >= r.nextDecision) {
				decideCreature(r, player, nearStates, this.time, this.access);
				r.nextDecision = Math.max(r.nextDecision, this.time + (item.distance > 160 ? 1.5 : 0.3));
				this.stats.behaviourUpdates++;
			}
			if (moving) advanceCreature(r, step, this.access);
			this.stats.behaviourMs += performance.now() - behaviourStart;
			const c = live.compiled;
			c.object.position.copy(r.position);
			c.object.rotation.y = r.heading;
			const interval = item.distance < budget.nearDistance ? 0 : item.distance < 160 ? 0.1 : 0.4;
			if (this.time - live.lastAnimation >= interval) {
				const start = performance.now();
				animateCreature(
					c,
					{ ...r.intent, heading: r.heading },
					this.time,
					Math.min(0.4, this.time - live.lastAnimation),
					item.distance < budget.nearDistance ? this.access.surface : undefined
				);
				live.lastAnimation = this.time;
				this.stats.animationMs += performance.now() - start;
				this.stats.skeletonUpdates++;
			}
			for (const mesh of c.skinnedMeshes) {
				mesh.castShadow = budget.shadows && item.distance < budget.nearDistance;
				mesh.receiveShadow = budget.shadows;
			}
			// Bounds already include articulation margin; grow-in is strictly a render effect.
			c.object.scale.setScalar(Math.min(1, Math.max(0.01, (this.time - live.born) / 0.35)));
			if (this.debug.showSkeleton && !live.debug) {
				live.debug = new THREE.SkeletonHelper(c.object);
				this.group.add(live.debug);
			} else if (!this.debug.showSkeleton && live.debug) {
				live.debug.dispose();
				live.debug.removeFromParent();
				live.debug = undefined;
			}
		}
		this.stats.active = selected.length;
		this.stats.rendered = this.live.size;
		this.stats.sleeping = this.logical.size - this.live.size;
		this.stats.culled = this.logical.size - visible.length;
		this.stats.triangles = 0;
		this.stats.lod0 = 0;
		this.stats.lod1 = 0;
		for (const r of this.live.values()) {
			this.stats.triangles += r.compiled.compilation.geometry.indices.length / 3;
			this.stats[r.lod === 0 ? 'lod0' : 'lod1']++;
		}
		this.stats.drawCalls = this.live.size;
		if (this.time - this.persistenceAt > 5) {
			this.persistenceAt = this.time;
			if (this.state.individuals.length) this.revision++;
		}
	}
	serialize(): CreatureWorldState {
		return {
			settings: { ...this.state.settings },
			individuals: this.state.individuals.map((p) => {
				const r = this.logical.get(p.id);
				return {
					...p,
					position: { ...(r?.position ?? p.position) },
					heading: r?.heading ?? p.heading,
					state: r?.state ?? p.state
				};
			})
		};
	}
	place(definition: CreatureDefinition, position: Vec3) {
		const id = `placed_${definition.individual.id}_${++this.placedIndex}`;
		const individual = { ...definition.individual, id };
		const recipe = {
			id,
			species: structuredClone(definition.species),
			individual,
			position: { x: position.x, y: this.access.surface(position.x, position.z), z: position.z },
			heading: 0,
			state: 'IDLE' as const
		};
		const size = definition.species.proportions.bodyWidth * individual.sizeFactor;
		if (
			this.access.blocked(
				position.x,
				position.z,
				size,
				definition.species.proportions.legLength + definition.species.proportions.bodyDepth
			)
		)
			throw Error('Choose open ground for this creature.');
		const next = {
			settings: this.state.settings,
			individuals: [...this.serialize().individuals, recipe]
		};
		const error = validateCreatureWorldState(next);
		if (error) throw Error(error);
		this.state = next;
		this.restorePersistent();
		this.revision++;
		this.scanAt = -1;
		return id;
	}
	showDemo(origin: Vec3) {
		this.reset();
		this.demo = true;
		for (const spawn of generateCreatureDemo(this.access, origin))
			this.logical.set(spawn.id, createCreatureState(spawn));
		this.scanAt = Infinity;
	}
	endDemo() {
		this.demo = false;
		this.reset();
	}
	resolvePlayer(x: number, z: number, feetY: number, headY: number) {
		for (const { compiled: c } of this.live.values()) {
			const p = c.object.position;
			const radius = c.compilation.collision.radius + 0.3;
			if (headY < p.y || feetY > p.y + c.compilation.collision.height) continue;
			const dx = x - p.x,
				dz = z - p.z,
				d = Math.hypot(dx, dz);
			if (d < radius) {
				const k = (radius - d) / Math.max(d, 1e-5);
				x += d < 1e-5 ? radius : dx * k;
				z += dz * k;
			}
		}
		return { x, z };
	}
	dispose() {
		for (const id of [...this.live.keys()]) this.unload(id);
		this.logical.clear();
		this.cells.clear();
		this.group.removeFromParent();
	}
}
