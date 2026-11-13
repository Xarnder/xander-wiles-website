import * as THREE from 'three';
import { recipeForSave } from './biome/CreatureBiomeCoat';
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
import { rideFor, type RideProfile, type RideSeatKind } from './creatureRiding';
import { advanceRiddenCreature, type RideInput, type RideStepResult } from './CreatureRideMotion';
import {
	rideSeatAnchors,
	rideSeatLayout,
	type RideSeatAnchors,
	type RideSeatLayout
} from './RideSeat';
import { anchorToWorld, boneToWorld } from './boneAnchors';
import { creatureDimensions } from './creatureDimensions';
import { creatureHitbox, creatureRayHit, hitboxDistance } from './creatureHitbox';
import { restingRideJump, stepRideJump, type RideJumpState } from './rideJump';
import {
	CALM_STILL_FACTOR,
	calmEnded,
	calmFactor,
	startCalm,
	type CalmTimeline
} from './creatureCalm';

interface LiveCreature {
	compiled: CompiledCreature;
	lod: CreatureLod;
	lastAnimation: number;
	born: number;
	debug?: THREE.SkeletonHelper;
	label?: THREE.Sprite;
	targetLine?: THREE.Line;
	/** Debug: the box `K` aims at (`creatureHitbox.ts`). */
	hitbox?: THREE.LineSegments;
}

/** Debug hitbox outlines: one box edge set (half-size 1, scaled per creature) and a colour per use. */
const HITBOX_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2));
const hitboxMaterial = (color: number) =>
	new THREE.LineBasicMaterial({
		color,
		depthTest: false,
		transparent: true,
		opacity: 0.9,
		fog: false,
		toneMapped: false
	});
const HITBOX_MATERIALS = {
	carry: hitboxMaterial(0x7dff7a),
	ride: hitboxMaterial(0x5ad7ff),
	none: hitboxMaterial(0x9a9a9a)
};
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

/** What `pickCarryable` / `pickRideable` found under the crosshair. */
export interface CarryCandidate {
	id: string;
	definition: CreatureDefinition;
	/** Distance along the look ray, metres. */
	distance: number;
}

/** A creature eased to a stop by `K` (`creatureCalm.ts`), and the pace it chose for itself. */
interface CalmedCreature {
	timeline: CalmTimeline;
	velocity: Vec3;
	gait: CreatureRuntimeDefinition['intent']['gait'];
}

/** The creature this player is riding: still in the herd's maps, but steered, not simulated. */
interface LocalRide {
	id: string;
	profile: RideProfile;
	seat: RideSeatLayout;
	/** `seat`, pinned to the bones that carry it (so the rider moves with the body's sway). */
	anchors: RideSeatAnchors;
	/** The carried-creature clearance `seat` was laid out with. */
	carryClearance: number;
	/**
	 * The pelvis in its bone's space, eased toward `anchors.pelvis.offset` when the layout changes
	 * (picking a creature up mid-ride moves the seat out from the neck).
	 */
	pelvisOffset: THREE.Vector3;
	/** Height above the ground while jumping (`rideJump.ts`). */
	jump: RideJumpState;
}

/** Where the rider is this frame, in world space (riding plan §4.4). */
export interface RideFrame {
	kind: RideSeatKind;
	/** The pelvis support point. */
	anchor: THREE.Vector3;
	/** The creature's heading (`atan2(x, z)`). */
	heading: number;
	/** The top of the creature's head, world height. */
	headTop: number;
	/** Hand holds, or null for a hand resting on the thigh. */
	hands: { left: THREE.Vector3 | null; right: THREE.Vector3 | null };
	/**
	 * The anchor's height without the body's bob and sway (where it would be on a still body), so
	 * a reduced-motion camera can hold steady while the rider's body still moves with the mount.
	 */
	steadyY: number;
}

/** Where a ridden creature stands and how much room it takes. */
export interface RideFootprint {
	x: number;
	y: number;
	z: number;
	heading: number;
	/** Body (collision) radius, metres. */
	radius: number;
}

/** The nearest creature of some kind, where it's drawn. */
export interface NearestCreature {
	id: string;
	name: string;
	x: number;
	y: number;
	z: number;
}

/** How quickly the seat eases to a new layout (picking a creature up mid-ride), 1/s. */
const SEAT_EASE_RATE = 6;

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
	/**
	 * The creature this player rides. It stays in `logical` and `live` (it's still in the world and
	 * drawn), but `steerRide` moves and animates it instead of behaviour, it is never culled or
	 * unloaded, and the player isn't pushed out of it.
	 */
	private ride: LocalRide | null = null;
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
	/** Creatures `K` is holding still (`calmInReach`). */
	private readonly calmed = new Map<string, CalmedCreature>();
	readonly debug = {
		showSkeleton: false,
		showBehaviourState: false,
		showTarget: false,
		showHitboxes: false,
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
	/**
	 * The world as a creature a player rides it sees it, when that differs from a wild one's: it
	 * wades into and across rivers, however deep, where a wild creature turns back. Defaults to the
	 * wild rules.
	 */
	rideAccess: CreatureWorldAccess | null = null;

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
	/**
	 * Biome coats changed (biome settings, biomes switched): ambient herds respawn in their new
	 * colours. Carried, ridden and placed creatures keep theirs until they are put back.
	 */
	regenerateAmbient() {
		for (const [id, r] of [...this.logical]) {
			if (r.spawn.persistent || this.carried.has(id) || id === this.ride?.id) continue;
			if (this.live.has(id)) this.unload(id);
			this.grounding.delete(id);
			this.calmed.delete(id);
			this.logical.delete(id);
		}
		this.cells.clear();
		this.scanAt = -1;
	}
	private reset() {
		for (const id of [...this.live.keys()]) this.unload(id);
		this.grounding.clear();
		this.calmed.clear();
		this.logical.clear();
		// A new seed or new creature settings: whatever was carried or ridden no longer belongs here.
		this.carried.clear();
		this.ride = null;
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
		r?.hitbox?.removeFromParent();
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
			if (
				!r.spawn.persistent &&
				!this.demo &&
				id !== this.ride?.id &&
				!keep.has(`${r.spawn.cellX},${r.spawn.cellZ}`)
			) {
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
			this.ride = null;
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
		const rideId = this.ride && this.logical.has(this.ride.id) ? this.ride.id : null;
		// Carried off, unloaded or removed: nothing left to calm.
		for (const id of this.calmed.keys()) if (!this.logical.has(id)) this.calmed.delete(id);
		for (const [id, r] of this.logical) {
			if (id === rideId) continue;
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
		// The mount is always drawn, in full detail, whatever the cap.
		if (rideId)
			selected.push({ id: rideId, distance: 0, lod: lodFor(0), height: this.ride!.profile.height });
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
		// A creature a player rides is out of the herd's way: other creatures neither steer around
		// it nor gather to it (and it passes through them, see `steerRide`) until the rider gets off.
		for (const item of selected)
			if (item.id !== rideId) this.spatial.set(item.id, this.logical.get(item.id)!);
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
					// A mount gaining detail must not shrink away and grow back under its rider.
					const born = item.id === rideId ? -Infinity : this.time;
					live = { compiled, lod: item.lod, lastAnimation: -1, born };
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
			if (item.id === rideId) {
				// Moved and posed by `steerRide`, before the camera reads the seat.
				for (const mesh of live.compiled.skinnedMeshes) {
					mesh.castShadow = budget.shadows;
					mesh.receiveShadow = budget.shadows;
				}
				continue;
			}
			const behaviourStart = performance.now();
			const decided = this.time >= r.nextDecision;
			if (decided) {
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
			const calm = this.calmed.get(item.id);
			if (calm) this.applyCalm(item.id, r, calm, decided);
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
			// Grounding detail follows the animation cadence: full planting/IK near, simplified
			// stepping at medium range, body-only slope alignment far away.
			if (animateNow)
				this.animateLive(
					item.id,
					r,
					live,
					item.distance < budget.nearDistance ? 0 : item.distance < 160 ? 1 : 2
				);
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
	/** Poses a live creature on the terrain (grounding, gait, look) for this moment. */
	private animateLive(
		id: string,
		r: CreatureRuntimeDefinition,
		live: LiveCreature,
		lod: CreatureLod,
		maxCadence?: number
	): void {
		const start = performance.now();
		const c = live.compiled;
		let grounding = this.grounding.get(id);
		if (!grounding) {
			grounding = new CreatureGroundingController(c.compilation);
			this.grounding.set(id, grounding);
		}
		animateCreature(
			c,
			{ ...r.intent, heading: r.heading },
			this.time,
			Math.min(0.4, this.time - live.lastAnimation),
			this.access.surface,
			{ grounding, lod, standable: this.access.standable, maxCadence }
		);
		live.lastAnimation = this.time;
		this.stats.animationMs += performance.now() - start;
		this.stats.skeletonUpdates++;
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
		this.updateHitboxDebug(r.spawn.id, live);
	}

	/**
	 * Debug: outlines the box `K` aims at, green for creatures that can be picked up, blue for ones
	 * that can be ridden, grey for the rest. Shares geometry and materials, so it's cheap to leave on.
	 */
	private updateHitboxDebug(id: string, live: LiveCreature) {
		if (!this.debug.showHitboxes || id === this.ride?.id) {
			live.hitbox?.removeFromParent();
			live.hitbox = undefined;
			return;
		}
		const use = this.isCarryable(id) ? 'carry' : this.isRideable(id) ? 'ride' : 'none';
		if (!live.hitbox) {
			live.hitbox = new THREE.LineSegments(HITBOX_EDGES, HITBOX_MATERIALS[use]);
			live.hitbox.renderOrder = 10;
			live.hitbox.frustumCulled = false;
			this.group.add(live.hitbox);
		}
		const o = live.compiled.object;
		const box = creatureHitbox(live.compiled.compilation.bounds, o.position, o.rotation.y);
		live.hitbox.material = HITBOX_MATERIALS[use];
		live.hitbox.position.set(box.centre.x, box.centre.y, box.centre.z);
		live.hitbox.rotation.set(0, box.yaw, 0);
		live.hitbox.scale.set(box.half.x, box.half.y, box.half.z);
	}

	/**
	 * Eases every creature `reachOf` gives a reach for to a stop, when it's within that reach of
	 * `eye` (measured to its hitbox, in any direction), holds it still, then lets it go
	 * (`creatureCalm.ts`). Pressing again restarts the hold. Returns the creatures calmed.
	 */
	calmInReach(eye: Vec3, reachOf: (id: string) => number | null): string[] {
		const calmed: string[] = [];
		for (const [id, live] of this.live) {
			const r = this.logical.get(id);
			const reach = id === this.ride?.id ? null : reachOf(id);
			if (!r || reach === null) continue;
			const o = live.compiled.object;
			const box = creatureHitbox(live.compiled.compilation.bounds, o.position, o.rotation.y);
			if (hitboxDistance(eye, box) > reach) continue;
			const previous = this.calmed.get(id);
			this.calmed.set(id, {
				timeline: startCalm(previous?.timeline, this.time),
				velocity: previous?.velocity ?? { ...r.intent.velocity },
				gait: previous?.gait ?? r.intent.gait
			});
			calmed.push(id);
		}
		return calmed;
	}

	/** Whether `K` is holding this creature still (or easing it back up). */
	isCalmed(id: string): boolean {
		return this.calmed.has(id);
	}

	/**
	 * Scales a calmed creature's own pace by the calm's factor. Its choices go on as usual (a new
	 * decision becomes the pace it resumes at); at the end it simply has its own pace back.
	 */
	private applyCalm(
		id: string,
		r: CreatureRuntimeDefinition,
		calm: CalmedCreature,
		decided: boolean
	) {
		if (decided) {
			calm.velocity = { ...r.intent.velocity };
			calm.gait = r.intent.gait;
		}
		if (calmEnded(calm.timeline, this.time)) {
			r.intent.velocity = { ...calm.velocity };
			r.intent.gait = calm.gait;
			this.calmed.delete(id);
			return;
		}
		const factor = calmFactor(calm.timeline, this.time);
		const v = calm.velocity;
		r.intent.velocity = { x: v.x * factor, y: v.y * factor, z: v.z * factor };
		r.intent.gait =
			factor < CALM_STILL_FACTOR
				? 'idle'
				: calm.gait === 'run' && factor < 0.5
					? 'walk'
					: calm.gait;
	}

	/**
	 * The nearest carryable creature the look ray reaches, within `reach` metres of `eye`: the ray
	 * against each live creature's large padded box (`creatureHitbox.ts`, shown by the "Show K
	 * hitboxes" debug overlay). `dir` must be unit length.
	 */
	pickCarryable(eye: Vec3, dir: Vec3, reach: number): CarryCandidate | null {
		return this.pickAlongRay(eye, dir, reach, (id) => this.isCarryable(id));
	}

	/** The nearest rideable creature (a biped nobody rides) the look ray reaches; see `pickCarryable`. */
	pickRideable(eye: Vec3, dir: Vec3, reach: number): CarryCandidate | null {
		return this.pickAlongRay(eye, dir, reach, (id) => this.isRideable(id));
	}

	private pickAlongRay(
		eye: Vec3,
		dir: Vec3,
		reach: number,
		accept: (id: string) => boolean
	): CarryCandidate | null {
		let best: CarryCandidate | null = null;
		for (const [id, live] of this.live) {
			// Never the creature being ridden (the rider's eye is inside its box).
			if (id === this.ride?.id) continue;
			const r = this.logical.get(id);
			if (!r) continue;
			const o = live.compiled.object;
			const { bounds, collision } = live.compiled.compilation;
			const t = creatureRayHit(bounds, collision, o.position, o.rotation.y, eye, dir, reach);
			if (t === null || (best && t >= best.distance) || !accept(id)) continue;
			best = {
				id,
				definition: { species: r.spawn.species, individual: r.spawn.individual },
				distance: t
			};
		}
		return best;
	}

	/** Whether a creature in the herd can be picked up (cached per spawn: recipes never change). */
	isCarryable(id: string): boolean {
		return this.cachedAbility(id, this.carryableCache, (d) => abilityFor(d) !== null);
	}
	private readonly carryableCache = new WeakMap<CreatureSpawnDefinition, boolean>();

	/** Whether a creature in the herd can be ridden (cached per spawn). */
	isRideable(id: string): boolean {
		return this.cachedAbility(id, this.rideableCache, (d) => rideFor(d) !== null);
	}
	private readonly rideableCache = new WeakMap<CreatureSpawnDefinition, boolean>();

	private cachedAbility(
		id: string,
		cache: WeakMap<CreatureSpawnDefinition, boolean>,
		test: (definition: CreatureDefinition) => boolean
	): boolean {
		const r = this.logical.get(id);
		if (!r) return false;
		let able = cache.get(r.spawn);
		if (able === undefined) {
			able = test({ species: r.spawn.species, individual: r.spawn.individual });
			cache.set(r.spawn, able);
		}
		return able;
	}

	/**
	 * The nearest creature in the herd that can be picked up (not carried by anyone), within
	 * `maxDistance` metres horizontally of `from`, or null. Its position is where it's drawn when it
	 * has a mesh, so a waypoint sits on the animal rather than a step behind it.
	 */
	nearestCarryable(from: Vec3, maxDistance = Number.POSITIVE_INFINITY): NearestCreature | null {
		return this.nearest(from, maxDistance, (id) => this.isCarryable(id));
	}

	/** The nearest creature nobody is riding that can be ridden (riding Q20 B); see `nearestCarryable`. */
	nearestRideable(from: Vec3, maxDistance = Number.POSITIVE_INFINITY): NearestCreature | null {
		return this.nearest(from, maxDistance, (id) => id !== this.ride?.id && this.isRideable(id));
	}

	private nearest(
		from: Vec3,
		maxDistance: number,
		accept: (id: string) => boolean
	): NearestCreature | null {
		let best: CreatureRuntimeDefinition | null = null;
		let bestDistance = maxDistance;
		for (const [id, r] of this.logical) {
			const d = Math.hypot(r.position.x - from.x, r.position.z - from.z);
			if (d >= bestDistance || !accept(id)) continue;
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
		if (carried.synthetic) r.spawn = { ...r.spawn, groupCentre: { ...at } };
		this.settle(r, at, heading, options.save !== false);
		if (this.state.settings.enabled) this.logical.set(id, r);
		this.scanAt = -1;
		return true;
	}

	/**
	 * A creature set down after a player carried or rode it: standing still at `at`, then back to its
	 * own behaviour. An ambient one now belongs to the cell it stands in; its herd's home is unchanged,
	 * so it wanders back. A placed one's saved spot (and home) moves there, unless `save` is false
	 * (online, only the player who moved it saves the edit; everyone else waits for it).
	 */
	private settle(r: CreatureRuntimeDefinition, at: Vec3, heading: number, save: boolean): void {
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
		if (r.spawn.persistent) {
			r.spawn = { ...r.spawn, groupCentre: { ...at } };
			if (!save) return;
			const id = r.spawn.id;
			this.state = {
				...this.state,
				individuals: this.state.individuals.map((p) =>
					p.id === id ? { ...p, position: { ...at }, heading, state: 'IDLE' } : p
				)
			};
			this.revision++;
			this.placedRevision++;
		} else {
			r.spawn = {
				...r.spawn,
				cellX: Math.floor(at.x / CREATURE_CELL_SIZE),
				cellZ: Math.floor(at.z / CREATURE_CELL_SIZE)
			};
		}
	}

	// ------------------------------------------------------------------ riding (2026-11-07 plan)

	/** The id of the creature this player rides, or null. */
	get riddenId(): string | null {
		return this.ride?.id ?? null;
	}

	isRidden(id: string): boolean {
		return this.ride?.id === id && this.logical.has(id);
	}

	/**
	 * Hands `id` (a live biped in the herd) over to the rider: behaviour stops and `steerRide` moves
	 * it from now on. `carryClearance` is the half-width of a creature the rider carries (Q12 C).
	 * Returns its recipe and how it carries a rider, or null when it can't be ridden here.
	 */
	mountRide(
		id: string,
		carryClearance = 0
	): { definition: CreatureDefinition; profile: RideProfile } | null {
		const r = this.logical.get(id);
		const live = this.live.get(id);
		if (!r || !live || this.ride) return null;
		const definition = { species: r.spawn.species, individual: r.spawn.individual };
		const profile = rideFor(definition);
		if (!profile) return null;
		// The rider steers it now.
		this.calmed.delete(id);
		const seat = rideSeatLayout(live.compiled.compilation, profile.seat, carryClearance);
		const anchors = rideSeatAnchors(live.compiled.compilation, seat);
		const { x, y, z } = anchors.pelvis.offset;
		this.ride = {
			id,
			profile,
			seat,
			anchors,
			carryClearance,
			pelvisOffset: new THREE.Vector3(x, y, z),
			jump: restingRideJump()
		};
		r.state = 'IDLE';
		r.intent = { ...r.intent, velocity: { x: 0, y: 0, z: 0 }, gait: 'idle', lookTarget: undefined };
		return { definition, profile };
	}

	/** The rider picked up or put down a creature: lay the seat out again (it eases across). */
	setRideCarryClearance(clearance: number): void {
		const ride = this.ride;
		const live = ride && this.live.get(ride.id);
		if (!ride || !live || Math.abs(ride.carryClearance - clearance) < 1e-3) return;
		ride.carryClearance = clearance;
		ride.seat = rideSeatLayout(live.compiled.compilation, ride.profile.seat, clearance);
		const anchors = rideSeatAnchors(live.compiled.compilation, ride.seat);
		// Easing across to another bone's space would jump: then the seat moves at once.
		if (anchors.pelvis.bone !== ride.anchors.pelvis.bone) {
			const { x, y, z } = anchors.pelvis.offset;
			ride.pelvisOffset.set(x, y, z);
		}
		ride.anchors = anchors;
	}

	/**
	 * Steers, moves and poses the mount for this frame. Call before the camera reads `rideFrame`.
	 * `look` (the rider's aim point) is where the creature's head turns to.
	 */
	steerRide(
		input: RideInput,
		cameraYaw: number,
		runSpeed: number,
		dt: number,
		look?: Vec3
	): RideStepResult {
		const ride = this.ride;
		const r = ride && this.logical.get(ride.id);
		if (!ride || !r) return { blocked: false };
		const result = advanceRiddenCreature(
			r,
			ride.profile,
			input,
			cameraYaw,
			runSpeed,
			dt,
			// No other creatures in its way while a player rides it: it passes through them.
			this.rideAccess ?? this.access
		);
		r.intent.lookTarget = look ? { ...look } : undefined;
		const { jumped, landed } = stepRideJump(ride.jump, !!input.jump, ride.profile, dt);
		const live = this.live.get(ride.id);
		if (live) {
			live.compiled.object.position.copy(r.position);
			this.animateLive(ride.id, r, live, live.lod, ride.profile.maxCadence);
			// Lifted whole, pose and all, after the feet were planted: the rider's seat rises with it.
			if (ride.jump.height > 0) {
				live.compiled.object.position.y += ride.jump.height;
				live.compiled.object.updateMatrixWorld(true);
			}
			const ease = 1 - Math.exp(-SEAT_EASE_RATE * Math.max(0, dt));
			const p = ride.anchors.pelvis.offset;
			ride.pelvisOffset.lerp(this.seatScratch.set(p.x, p.y, p.z), ease);
		}
		return { ...result, jumped, landed };
	}
	private readonly seatScratch = new THREE.Vector3();

	/**
	 * Where the rider sits this frame (world space), or null when there's no drawn mount. The same
	 * object is reused every call (no per-frame allocation): copy anything kept.
	 */
	rideFrame(): RideFrame | null {
		const ride = this.ride;
		const r = ride && this.logical.get(ride.id);
		const live = ride && this.live.get(ride.id);
		if (!ride || !r || !live) return null;
		const compiled = live.compiled;
		const { anchors, seat } = ride;
		const frame = this.frame;
		frame.kind = seat.kind;
		boneToWorld(compiled, anchors.pelvis.bone, ride.pelvisOffset, frame.anchor);
		frame.heading = r.heading;
		frame.headTop = anchorToWorld(compiled, anchors.headTop, this.seatScratch).y;
		frame.hands.left = anchors.hands.left
			? anchorToWorld(compiled, anchors.hands.left, this.handScratch[0])
			: null;
		frame.hands.right = anchors.hands.right
			? anchorToWorld(compiled, anchors.hands.right, this.handScratch[1])
			: null;
		const p = seat.pelvis;
		frame.steadyY = this.seatScratch.set(p.x, p.y, p.z).applyMatrix4(compiled.object.matrixWorld).y;
		return frame;
	}
	private readonly frame: RideFrame = {
		kind: 'neck',
		anchor: new THREE.Vector3(),
		heading: 0,
		headTop: 0,
		hands: { left: null, right: null },
		steadyY: 0
	};
	private readonly handScratch = [new THREE.Vector3(), new THREE.Vector3()] as const;

	/**
	 * The mount's skin as points in its own space, so the third-person camera stays out of it (a
	 * giant's head is well within the camera boom). Null when not riding. The matrix is reused.
	 */
	rideCameraBody(): {
		points: ArrayLike<number>;
		worldToLocal: THREE.Matrix4;
		radius: number;
	} | null {
		const ride = this.ride;
		const live = ride && this.live.get(ride.id);
		if (!ride || !live) return null;
		this.cameraBodyMatrix.copy(live.compiled.object.matrixWorld).invert();
		return {
			points: live.compiled.compilation.geometry.positions,
			worldToLocal: this.cameraBodyMatrix,
			radius: Math.max(0.1, ride.profile.height * 0.025)
		};
	}
	private readonly cameraBodyMatrix = new THREE.Matrix4();

	/** Where the mount stands and how much room its body takes (for choosing where to get off). */
	rideFootprint(): RideFootprint | null {
		const ride = this.ride;
		const r = ride && this.logical.get(ride.id);
		if (!ride || !r) return null;
		const live = this.live.get(ride.id);
		const radius =
			live?.compiled.compilation.collision.radius ??
			creatureDimensions(r.spawn.species, r.spawn.individual.sizeFactor).radius;
		return { ...r.position, heading: r.heading, radius };
	}

	/**
	 * The rider got off: the mount stands where it is, then goes back to its own behaviour (Q19 A).
	 * A placed creature's new spot is saved (Q14 A) unless `save` is false. Returns the mount's id.
	 */
	dismountRide(options: { save?: boolean } = {}): string | null {
		const ride = this.ride;
		this.ride = null;
		const r = ride && this.logical.get(ride.id);
		if (!ride || !r) return null;
		this.settle(r, r.position, r.heading, options.save !== false);
		return ride.id;
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
			// Carried or ridden here: its new spot applies when it's put down or left.
			if (this.carried.has(id) || this.ride?.id === id) continue;
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
		// Placed creatures save today's recipe shape: a biome coat's colours are baked in (Q18).
		const species = structuredClone(recipeForSave(definition.species));
		const individual = { ...definition.individual, id, speciesId: species.id };
		const recipe = {
			id,
			species,
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
	/**
	 * Whether a creature's body (other than the one being ridden) takes up this spot at this height.
	 * Players walk through creatures, so this is only to keep a getting-off spot clear of them.
	 */
	bodyAt(x: number, z: number, feetY: number, headY: number): boolean {
		for (const [id, { compiled: c }] of this.live) {
			if (id === this.ride?.id) continue;
			const p = c.object.position;
			if (headY < p.y || feetY > p.y + c.compilation.collision.height) continue;
			if (Math.hypot(x - p.x, z - p.z) < c.compilation.collision.radius + 0.3) return true;
		}
		return false;
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
