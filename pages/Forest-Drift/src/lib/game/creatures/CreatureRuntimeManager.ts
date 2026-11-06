import * as THREE from 'three';
import { CreatureSpatialIndex } from './CreatureSpatialIndex';
import { CreatureEventBus } from './CreatureEventBus';
import { compileCreature, type CompiledCreature } from './CreatureCompiler';
import { animateCreature } from './CreatureAnimationSystem';
import {
	CreatureGroundingController,
	groundingStats,
	orientationFromUp
} from './CreatureGrounding';
import { createDefaultCreatureState, validateCreatureWorldState } from './CreaturePersistence';
import {
	generatePopulationCell,
	CREATURE_CELL_SIZE,
	generateCreatureDemo,
	selectVisibleCreatures
} from './CreaturePopulationSystem';
import {
	createCreatureState,
	decideCreature,
	advanceCreature,
	turnCreature
} from './CreatureBehaviourSystem';
import type {
	CreatureDefinition,
	CreatureLod,
	CreatureRuntimeDefinition,
	CreatureSpawnDefinition,
	CreatureWorldAccess,
	CreatureWorldState,
	PersistentCreatureDefinition,
	Vec3
} from './CreatureTypes';
import { CREATURE_GRAPHICS_BUDGETS, type GraphicsQuality } from '../graphics/GraphicsTypes';
import { abilityFor } from './creatureAbilities';

interface LiveCreature {
	compiled: CompiledCreature;
	lod: CreatureLod;
	lastAnimation: number;
	born: number;
	debug?: THREE.SkeletonHelper;
	label?: THREE.Sprite;
	targetLine?: THREE.Line;
}
/** A creature taken out of the herd and held by a player: this one, or (online) another's slot. */
export interface CarriedCreature {
	by: 'local' | number;
	runtime: CreatureRuntimeDefinition;
	/**
	 * Built from the id because this client never had the creature in its herd (someone else picked
	 * it up out of sight). Its herd's home is unknown, so it adopts wherever it is put down.
	 */
	synthetic?: boolean;
}

/** What `pickCarryable` found under the crosshair. */
export interface CarryCandidate {
	id: string;
	definition: CreatureDefinition;
	/** Distance along the look ray, metres. */
	distance: number;
}

/** Bounded runtime window over an infinite deterministic ecology. Ambient state is never serialized. */
export class CreatureRuntimeManager {
	readonly group = new THREE.Group();
	readonly events = new CreatureEventBus();
	private spatial = new CreatureSpatialIndex<CreatureRuntimeDefinition>();
	readonly logical = new Map<string, CreatureRuntimeDefinition>();
	readonly live = new Map<string, LiveCreature>();
	/** Terrain conformation state per live creature; survives LOD recompiles (same skeleton). */
	readonly grounding = new Map<string, CreatureGroundingController>();
	/**
	 * Creatures out of the herd because a player is carrying them. They are not in `logical`, so
	 * behaviour, grounding, culling, collision and cell unloading all skip them, and a reloading
	 * cell never spawns a second copy.
	 */
	readonly carried = new Map<string, CarriedCreature>();
	state: CreatureWorldState;
	revision = 0;
	/**
	 * Bumps only when placed creatures are added, moved (put down) or removed: what online worlds
	 * share (ranged weapons F2). `revision` also ticks while they wander, for single-player saves.
	 */
	placedRevision = 0;
	private cells = new Map<string, CreatureSpawnDefinition[]>();
	private scanAt = -1;
	private scanCell = '';
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
		lod2: 0,
		culled: 0,
		groundingUpdates: 0,
		surfaceSamples: 0,
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
			if (this.carried.has(p.id)) continue;
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
		this.grounding.clear();
		this.logical.clear();
		// A new seed or new creature settings: whatever was carried no longer belongs to this world.
		this.carried.clear();
		this.cells.clear();
		this.scanAt = -1;
		this.restorePersistent();
	}
	private unload(id: string) {
		const r = this.live.get(id);
		r?.debug?.dispose();
		r?.debug?.removeFromParent();
		if (r?.label) {
			r.label.material.map?.dispose();
			r.label.material.dispose();
			r.label.removeFromParent();
		}
		if (r?.targetLine) {
			r.targetLine.geometry.dispose();
			(r.targetLine.material as THREE.Material).dispose();
			r.targetLine.removeFromParent();
		}
		r?.compiled.dispose();
		this.live.delete(id);
		this.spatial.remove(id);
		if (r) this.events.emit({ type: 'despawn', id, position: { ...r.compiled.object.position } });
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
						if (!this.logical.has(spawn.id) && !this.carried.has(spawn.id))
							this.logical.set(spawn.id, createCreatureState(spawn));
				}
		for (const [key] of this.cells) if (!keep.has(key)) this.cells.delete(key);
		for (const [id, r] of this.logical)
			if (!r.spawn.persistent && !this.demo && !keep.has(`${r.spawn.cellX},${r.spawn.cellZ}`)) {
				this.unload(id);
				this.logical.delete(id);
			}
	}
	update(player: Vec3, delta: number, quality: GraphicsQuality) {
		const frameDt = Math.min(delta, 0.1);
		this.time += frameDt;
		if (!this.state.settings.enabled) {
			for (const id of [...this.live.keys()]) this.unload(id);
			this.carried.clear();
			return;
		}
		const budget = CREATURE_GRAPHICS_BUDGETS[quality];
		const cellKey = `${Math.floor(player.x / CREATURE_CELL_SIZE)},${Math.floor(player.z / CREATURE_CELL_SIZE)}:${quality}`;
		if (this.time >= this.scanAt || cellKey !== this.scanCell) {
			this.scanCell = cellKey;
			this.scan(player, quality);
			this.scanAt = this.time + 0.8;
		}
		const visible: { id: string; distance: number; lod: CreatureLod; height: number }[] = [];
		// Same anatomy at every level; only tessellation and sub-silhouette detail drop with distance.
		const lodFor = (distance: number): CreatureLod =>
			distance < budget.nearDistance && quality !== 'low'
				? 0
				: distance < budget.nearDistance * (quality === 'low' ? 1.6 : 2.4)
					? 1
					: 2;
		for (const [id, r] of this.logical) {
			const p = r.spawn.species.proportions,
				size =
					(p.legLength + p.bodyDepth + p.headSize + p.neckLength) * r.spawn.individual.sizeFactor;
			const distance = Math.hypot(player.x - r.position.x, player.z - r.position.z);
			const far = Math.min(
				budget.populationRadius,
				Math.max(budget.smallRenderDistance, size * 24)
			);
			if (distance <= far) visible.push({ id, distance, lod: lodFor(distance), height: size });
		}
		const selected = selectVisibleCreatures(
			visible,
			Math.min(this.state.settings.maxActiveCreatures, budget.maxActive)
		);
		const ids = new Set(selected.map((p) => p.id));
		for (const id of this.live.keys())
			if (!ids.has(id)) {
				this.unload(id);
				this.grounding.delete(id);
			}
		const samplesBefore = groundingStats.surfaceCalls,
			updatesBefore = groundingStats.updates;
		let compiledThisFrame = false;
		this.stats.skeletonUpdates = 0;
		this.stats.behaviourUpdates = 0;
		this.stats.animationMs = 0;
		this.stats.behaviourMs = 0;
		const moving = this.time - this.movementAt >= 0.05,
			step = Math.min(0.15, this.time - this.movementAt);
		if (moving) this.movementAt = this.time;
		this.spatial.clear();
		for (const item of selected) this.spatial.set(item.id, this.logical.get(item.id)!);
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
					this.events.emit({ type: 'spawn', id: item.id, position: { ...r.position } });
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
				const oldState = r.state;
				decideCreature(
					r,
					player,
					this.spatial.query(r.position, Math.max(24, r.spawn.species.behaviour.awarenessRadius)),
					this.time,
					this.access
				);
				if (r.state !== oldState)
					this.events.emit({ type: 'state', id: r.spawn.id, state: r.state });
				r.nextDecision = Math.max(r.nextDecision, this.time + (item.distance > 160 ? 1.5 : 0.3));
				this.stats.behaviourUpdates++;
			}
			// Position stays on the physics tick. Facing is integrated every rendered frame so a
			// correction is not a single 50 ms snap.
			if (moving) advanceCreature(r, step, this.access, false);
			turnCreature(r, frameDt);
			this.stats.behaviourMs += performance.now() - behaviourStart;
			const c = live.compiled;
			c.object.position.copy(r.position);
			const interval = item.distance < budget.nearDistance ? 0 : item.distance < 160 ? 0.1 : 0.4;
			const animateNow = this.time - live.lastAnimation >= interval;
			const held = this.grounding.get(item.id);
			const serpent = r.spawn.species.bodyPlan.id === 'serpentine';
			if (!animateNow && held) {
				// Full poses are throttled with distance. Setting euler yaw here used to replace the
				// grounded orientation on the skipped frames, so the body turned and then snapped back.
				// A serpent's spine is posed in that orientation; yawing the root alone would spin the trail.
				if (!serpent) {
					orientationFromUp(held.up, r.heading, held.quaternion);
					c.object.quaternion.copy(held.quaternion);
				}
				c.object.position.y = held.position.y;
			} else if (!animateNow && !serpent) {
				c.object.rotation.set(0, r.heading, 0);
			}
			if (animateNow) {
				const start = performance.now();
				let grounding = this.grounding.get(item.id);
				if (!grounding) {
					grounding = new CreatureGroundingController(c.compilation);
					this.grounding.set(item.id, grounding);
				}
				// Grounding detail follows the animation cadence: full planting/IK near, simplified
				// stepping at medium range, body-only slope alignment far away.
				animateCreature(
					c,
					{ ...r.intent, heading: r.heading },
					this.time,
					Math.min(0.4, this.time - live.lastAnimation),
					this.access.surface,
					{
						grounding,
						lod: item.distance < budget.nearDistance ? 0 : item.distance < 160 ? 1 : 2,
						standable: this.access.standable
					}
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
			this.updateDebug(live, r);
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
		this.stats.lod2 = 0;
		for (const r of this.live.values()) {
			this.stats.triangles += r.compiled.compilation.geometry.indices.length / 3;
			this.stats[`lod${r.lod}`]++;
		}
		this.stats.drawCalls = this.live.size;
		this.stats.groundingUpdates = groundingStats.updates - updatesBefore;
		this.stats.surfaceSamples = groundingStats.surfaceCalls - samplesBefore;
		if (this.time - this.persistenceAt > 5) {
			this.persistenceAt = this.time;
			if (this.state.individuals.length) this.revision++;
		}
	}
	private updateDebug(live: LiveCreature, r: CreatureRuntimeDefinition) {
		const text = [
			this.debug.showSpeciesId ? r.spawn.species.name + ' ' + r.spawn.species.id : '',
			this.debug.showIndividualId ? r.spawn.individual.id : '',
			this.debug.showBehaviourState ? r.state : '',
			this.debug.showLOD ? `LOD${live.lod}` : ''
		]
			.filter(Boolean)
			.join(' · ');
		if (text) {
			if (!live.label || live.label.userData.text !== text) {
				if (live.label) {
					live.label.material.map?.dispose();
					live.label.material.dispose();
					live.label.removeFromParent();
				}
				const canvas = document.createElement('canvas');
				canvas.width = 1024;
				canvas.height = 64;
				const ctx = canvas.getContext('2d')!;
				ctx.fillStyle = '#183327dc';
				ctx.fillRect(0, 0, 1024, 64);
				ctx.font = '22px system-ui';
				ctx.fillStyle = '#f0ffe8';
				ctx.fillText(text, 14, 42, 995);
				const material = new THREE.SpriteMaterial({
					map: new THREE.CanvasTexture(canvas),
					depthTest: false
				});
				live.label = new THREE.Sprite(material);
				live.label.userData.text = text;
				this.group.add(live.label);
			}
			live.label.position.set(
				r.position.x,
				r.position.y + live.compiled.compilation.bounds.height + 0.4,
				r.position.z
			);
			const width = Math.max(4, Math.min(20, live.compiled.compilation.bounds.height * 2));
			live.label.scale.set(width, width / 16, 1);
		} else if (live.label) {
			live.label.material.map?.dispose();
			live.label.material.dispose();
			live.label.removeFromParent();
			live.label = undefined;
		}
		if (this.debug.showTarget) {
			if (!live.targetLine) {
				live.targetLine = new THREE.Line(
					new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
					new THREE.LineBasicMaterial({ color: 0xffcc66, depthTest: false })
				);
				this.group.add(live.targetLine);
			}
			const pos = live.targetLine.geometry.getAttribute('position');
			pos.setXYZ(0, r.position.x, r.position.y + 0.15, r.position.z);
			pos.setXYZ(1, r.target.x, r.target.y + 0.15, r.target.z);
			pos.needsUpdate = true;
			live.targetLine.geometry.computeBoundingSphere();
		} else if (live.targetLine) {
			live.targetLine.geometry.dispose();
			(live.targetLine.material as THREE.Material).dispose();
			live.targetLine.removeFromParent();
			live.targetLine = undefined;
		}
	}

	/**
	 * The nearest carryable creature the look ray passes through, within `reach` metres of `eye`
	 * (ray against each live creature's coarse collision cylinder). `dir` must be unit length.
	 */
	pickCarryable(eye: Vec3, dir: Vec3, reach: number): CarryCandidate | null {
		let best: CarryCandidate | null = null;
		for (const [id, live] of this.live) {
			const r = this.logical.get(id);
			if (!r) continue;
			const p = live.compiled.object.position;
			const radius = live.compiled.compilation.collision.radius + 0.1;
			const height = live.compiled.compilation.collision.height;
			// Cheap reject: the cylinder's closest point is beyond reach.
			if (Math.hypot(p.x - eye.x, p.z - eye.z) - radius > reach) continue;
			const definition = { species: r.spawn.species, individual: r.spawn.individual };
			for (let t = 0; t <= reach; t += 0.05) {
				const x = eye.x + dir.x * t,
					y = eye.y + dir.y * t,
					z = eye.z + dir.z * t;
				if (y < p.y - 0.05 || y > p.y + height + 0.05) continue;
				if (Math.hypot(x - p.x, z - p.z) > radius) continue;
				if ((!best || t < best.distance) && abilityFor(definition))
					best = { id, definition, distance: t };
				break;
			}
		}
		return best;
	}

	/** Whether a creature in the herd can be picked up (cached per spawn: recipes never change). */
	isCarryable(id: string): boolean {
		const r = this.logical.get(id);
		if (!r) return false;
		let carryable = this.carryableCache.get(r.spawn);
		if (carryable === undefined) {
			carryable = abilityFor({ species: r.spawn.species, individual: r.spawn.individual }) !== null;
			this.carryableCache.set(r.spawn, carryable);
		}
		return carryable;
	}
	private readonly carryableCache = new WeakMap<CreatureSpawnDefinition, boolean>();

	/**
	 * The nearest creature in the herd that can be picked up (not carried by anyone), within
	 * `maxDistance` metres horizontally of `from`, or null. Its position is where it's drawn when it
	 * has a mesh, so a waypoint sits on the animal rather than a step behind it.
	 */
	nearestCarryable(
		from: Vec3,
		maxDistance = Number.POSITIVE_INFINITY
	): { id: string; name: string; x: number; y: number; z: number } | null {
		let best: CreatureRuntimeDefinition | null = null;
		let bestDistance = maxDistance;
		for (const [id, r] of this.logical) {
			const d = Math.hypot(r.position.x - from.x, r.position.z - from.z);
			if (d >= bestDistance || !this.isCarryable(id)) continue;
			best = r;
			bestDistance = d;
		}
		if (!best) return null;
		const at = this.creaturePosition(best.spawn.id)!;
		return { id: best.spawn.id, name: best.spawn.species.name, ...at };
	}

	/** Where a creature in the herd is now (its mesh when drawn), or null when it isn't in the herd. */
	creaturePosition(id: string): { x: number; y: number; z: number } | null {
		const live = this.live.get(id);
		if (live) {
			const p = live.compiled.object.position;
			return { x: p.x, y: p.y, z: p.z };
		}
		const r = this.logical.get(id);
		return r ? { x: r.position.x, y: r.position.y, z: r.position.z } : null;
	}

	isCarried(id: string): boolean {
		return this.carried.has(id);
	}

	/**
	 * Takes a creature out of the herd to be carried. Returns its recipe, or null when it isn't
	 * here or can't be carried.
	 */
	carry(id: string, fallback?: CreatureDefinition): CreatureDefinition | null {
		if (this.carried.get(id)?.by === 'local') return null;
		const r = this.logical.get(id);
		const definition = r ? { species: r.spawn.species, individual: r.spawn.individual } : fallback;
		if (!definition || !abilityFor(definition)) return null;
		// Online, the room may have granted a creature this herd no longer has (it wandered out of
		// range, or someone else held it a moment ago): carry it from its recipe.
		this.takeFromHerd(id, 'local', definition);
		return definition;
	}

	/**
	 * Online: another player (`slot`) is carrying this creature. It leaves this client's herd (or is
	 * kept out of it when its cell loads), so nobody sees it in two places.
	 */
	holdRemote(id: string, slot: number, definition: CreatureDefinition): void {
		this.takeFromHerd(id, slot, definition);
	}

	/**
	 * Lets go of a creature without putting it anywhere (its carrier left and nobody knows where):
	 * it reappears with its herd the next time its cell is scanned.
	 */
	forget(id: string): void {
		this.carried.delete(id);
		this.scanAt = -1;
	}

	/** Who holds `id`: 'local', a remote slot, or null. */
	carrierOf(id: string): 'local' | number | null {
		return this.carried.get(id)?.by ?? null;
	}

	private takeFromHerd(id: string, by: 'local' | number, definition: CreatureDefinition): void {
		const existing = this.carried.get(id);
		const r = this.logical.get(id) ?? existing?.runtime;
		if (r) {
			this.unload(id);
			this.grounding.delete(id);
			this.logical.delete(id);
			this.carried.set(id, { by, runtime: r, synthetic: existing?.synthetic });
			return;
		}
		const spawn: CreatureSpawnDefinition = {
			id,
			species: definition.species,
			individual: definition.individual,
			position: { x: 0, y: 0, z: 0 },
			heading: 0,
			groupId: id.replace(/:\d+$/, ''),
			groupCentre: { x: 0, y: 0, z: 0 },
			cellX: 0,
			cellZ: 0,
			persistent: false
		};
		this.carried.set(id, { by, runtime: createCreatureState(spawn), synthetic: true });
	}

	/**
	 * Puts a carried creature down at `position` facing `heading`, standing still. An ambient
	 * creature now belongs to the cell it was put down in (so it isn't unloaded at once when that's
	 * far from home); its herd's home is unchanged, so it can wander back. A placed creature's saved
	 * position moves there too (ranged weapons Q4).
	 */
	release(id: string, position: Vec3, heading: number, options: { save?: boolean } = {}): boolean {
		const carried = this.carried.get(id);
		if (!carried) return false;
		this.carried.delete(id);
		const r = carried.runtime;
		const ground = this.access.surface(position.x, position.z);
		const at = {
			x: position.x,
			y: Number.isFinite(ground) ? ground : position.y,
			z: position.z
		};
		r.position = { ...at };
		r.heading = heading;
		r.state = 'IDLE';
		r.intent = {
			velocity: { x: 0, y: 0, z: 0 },
			heading,
			angularVelocity: 0,
			gait: 'idle'
		};
		r.target = { ...at };
		r.nextDecision = this.time + 1;
		if (carried.synthetic) r.spawn = { ...r.spawn, groupCentre: { ...at } };
		// Online, only the carrier saves a placed creature's new spot (as a world edit); everyone else
		// just shows it there until that edit arrives.
		if (r.spawn.persistent && options.save !== false) {
			this.state = {
				...this.state,
				individuals: this.state.individuals.map((p) =>
					p.id === id ? { ...p, position: { ...at }, heading, state: 'IDLE' } : p
				)
			};
			this.revision++;
			this.placedRevision++;
		} else if (!r.spawn.persistent) {
			r.spawn = {
				...r.spawn,
				cellX: Math.floor(at.x / CREATURE_CELL_SIZE),
				cellZ: Math.floor(at.z / CREATURE_CELL_SIZE)
			};
		}
		if (this.state.settings.enabled) this.logical.set(id, r);
		this.scanAt = -1;
		return true;
	}

	/** Placed creatures as shared online: their recipes at their saved spots (not mid-wander). */
	sharedPlacedCreatures(): PersistentCreatureDefinition[] {
		return structuredClone(this.state.individuals);
	}

	/**
	 * Online: other players added, moved or removed placed creatures (`ids`; `list` is the new set).
	 * A creature being carried keeps being carried; its new spot applies when it's put down.
	 */
	applyPlaced(list: readonly PersistentCreatureDefinition[], ids: ReadonlySet<string>): void {
		if (ids.size === 0) return;
		const next = new Map(list.map((p) => [p.id, p] as const));
		const individuals = this.state.individuals.filter((p) => !ids.has(p.id) || next.has(p.id));
		for (const id of ids) {
			const definition = next.get(id);
			if (!definition) continue;
			const index = individuals.findIndex((p) => p.id === id);
			if (index >= 0) individuals[index] = structuredClone(definition);
			else individuals.push(structuredClone(definition));
		}
		this.state = { ...this.state, individuals };
		for (const id of ids) {
			const definition = next.get(id);
			if (!definition) {
				this.unload(id);
				this.grounding.delete(id);
				this.logical.delete(id);
				this.carried.delete(id);
				continue;
			}
			if (this.carried.has(id)) continue;
			const existing = this.logical.get(id);
			if (existing) {
				existing.position = { ...definition.position };
				existing.target = { ...definition.position };
				existing.heading = definition.heading;
				existing.spawn = { ...existing.spawn, groupCentre: { ...definition.position } };
			} else {
				const r = createCreatureState({
					id,
					species: definition.species,
					individual: definition.individual,
					position: { ...definition.position },
					heading: definition.heading,
					groupId: id,
					groupCentre: { ...definition.position },
					cellX: Math.floor(definition.position.x / CREATURE_CELL_SIZE),
					cellZ: Math.floor(definition.position.z / CREATURE_CELL_SIZE),
					persistent: true
				});
				r.state = definition.state;
				if (this.state.settings.enabled) this.logical.set(id, r);
			}
		}
		this.placedRevision++;
		this.revision++;
		this.scanAt = -1;
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
		let id: string;
		do {
			id = `placed_${definition.individual.id}_${++this.placedIndex}`;
		} while (this.state.individuals.some((p) => p.id === id));
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
		this.placedRevision++;
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
		this.grounding.clear();
		this.logical.clear();
		this.cells.clear();
		this.group.removeFromParent();
		this.spatial.clear();
		this.events.clear();
	}
}
